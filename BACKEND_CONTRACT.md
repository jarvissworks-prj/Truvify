# Backend Contract & API Endpoints

> **Note on Browser Mode (`VITE_BACKEND_MODE=browser`)**:
> With browser mode (the default), **no FastAPI backend is required**. Verification runs in the user's browser tab using the in-browser scientific analysis engine (`src/lib/analysis/`), and persists records directly to Supabase with Row Level Security. Report Q&A chat is handled directly by the Supabase Edge Function `report-chat` with Google Gemini.
>
> If running in FastAPI mode (`VITE_BACKEND_MODE=fastapi`), base URL comes from `VITE_API_URL`. Every request carries the user's Supabase token: `Authorization: Bearer <access_token>`.

Reading and updating documents/claims (dashboard, results, overrides, flags, save toggle) goes **straight to Supabase** through RLS. The backend only does the work below.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/detect-domain` | multipart: `file` | `{ "domain": "Medical" }` — read the first **1000 words** and classify |
| POST | `/api/verify` | multipart: `file`, `domain` | `{ "job_id": "...", "document_id": "..." }` — upload original file to private storage bucket `documents` at `{user_id}/{document_id}/{file_name}`, insert a `documents` row with `storage_path` and `status='processing'`, start background job |
| GET | `/api/jobs/{job_id}` | — | `JobStatus` (below). Polled every 2 seconds |
| POST | `/api/claims/{claim_id}/recheck` | — | the updated claim row. Re-run only the comparison step, no new paper fetch |
| POST | `/api/documents/{id}/reverify` | JSON: `{ "corrected_text": "..." }` | `{ "document": DocumentRecord, "claims": Claim[] }` — find changed sentences, re-run verification on edited claims, save `corrected_text`, recalculate score/flag, return updated document & claims |
| GET | `/api/documents/{id}/source-check` | — | `SourceCheckResult` (below). Check Crossref for retractions/corrections |
| GET | `/api/documents/{id}/export?format=pdf\|docx` | — | the file (binary). Excel (XLSX) and PowerPoint (PPTX) are built in the browser |
| POST | `/api/documents/{id}/chat` | JSON: `{ "message": "..." }` | `{ "reply": string, "created_at": string }` — grounded chat about report (implemented by Edge Function `report-chat`) |
| DELETE | `/api/account` | — | `204`. Delete documents, claims, then the auth user (service key) |

Return **429** when a user goes over 10 verifications per hour (or 30 chat messages per hour for chat) — the frontend shows the right friendly message.
Errors: `{"detail": "message"}` with a 4xx/5xx status is shown to the user as-is.

## Report Chat Endpoint (`POST /functions/v1/report-chat`)

Implemented by the Supabase Edge Function `supabase/functions/report-chat/index.ts`:

- **Headers:** `Authorization: Bearer <user_access_token>`, `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "document_id": "d0e14a2b-6899-4d6b-b461-123456789abc",
    "message": "Why is Claim 1 partly supported and how should I fix it?"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "reply": "Claim 1 is marked Partly Supported because the source paper reports a 22% reduction in secondary cardiovascular events in patients with prior infarction, rather than a 40% reduction across all adults. To fix this, change the text to match the sample population: 'Daily low-dose aspirin reduces the risk of recurrent cardiovascular events by about 22% in patients with prior events [1].'",
    "created_at": "2026-11-19T14:40:00.000Z"
  }
  ```
- **Rate Limit:** 30 user messages per hour. Returns `429` with `{"error": "Rate limit reached: maximum 30 questions per hour. Please try again later."}`.
- **Security:** Verifies user identity via JWT token and loads document and claims with RLS. Assistant responses are stored in `chat_messages` via service role.

## Storage Bucket
When `POST /api/verify` is called:
- Upload the original uploaded file to Supabase Storage bucket `documents` at `{user_id}/{document_id}/{file_name}`.
- Store this path in `documents.storage_path`.
- The frontend will obtain 10-minute signed URLs using `supabase.storage.from("documents").createSignedUrl(storage_path, 600)`.

## JobStatus

```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "file_name": "Cardio_Review.pdf",
  "page_count": 6,
  "domain": "Medical",
  "stage": "extracting | finding_citations | verifying | building_report | done | failed",
  "percent": 45,
  "eta_seconds": 30,
  "current_chunk": 1,
  "total_chunks": 3,
  "claims_checked": 2,
  "total_claims": 8,
  "issues_found": 1,
  "activity": [
    { "id": "c_003", "kind": "issue", "text": "Claim 3 — paper is from 2004. Checking for newer research." },
    { "id": "c_002", "kind": "ok", "text": "Claim 2 — found in Semantic Scholar. Verdict: Supported." }
  ],
  "error": null
}
```

`activity` is newest first. `kind` is `ok`, `issue` or `working`.
When `stage` is `done`, the page opens `/results/{document_id}` — so the `documents` row must have `status='done'`, `trust_score`, `flag`, `claim_count`, `extracted_text`, `storage_path`, and all `claims` rows saved before you report `done`.

## Saving the Gemini agent output

Each object the agent returns maps 1:1 onto a `claims` row (see `supabase/schema.sql`):
`verdict, evidence_quote, explanation, evidence_strength, retrieval_quality, uncertainty_note, date_conflict, outdated, newer_paper, needs_human_review, fabrication_signals_failed, fabrication_detail, suggested_fix`.
- `suggested_fix`: string or null — a corrected version of the claim sentence that matches the evidence (null for supported or not_found claims).
Add from your own pipeline: `claim_text, citation_id, citation_full_reference, citation_doi, page_number, paper_year, databases_searched, source_used, raw_passage`.

## Re-verifying Corrected Text (`POST /api/documents/{id}/reverify`)

- Accepts body: `{ "corrected_text": string }`.
- Compares `corrected_text` with original `extracted_text` to identify which claim sentences were modified or deleted.
- Only re-verifies the modified claims (does not re-run unchanged claims).
- If a sentence was deleted, removes that claim row.
- Updates claim rows with new sentences, new verdicts, and evidence fields.
- Recalculates `trust_score` and `flag`.
- Saves `corrected_text` in the `documents` table.
- Returns `{ "document": DocumentRecord, "claims": Claim[] }`.

## Scores

- Trust score = (supported × 1.0 + partly_supported × 0.5) ÷ total claims × 100, rounded
- Flag: 70–100 green, 40–69 amber, 0–39 red
- The results page recalculates the score live using user overrides; use the same rule (with `user_override_verdict` when present) in PDF/DOCX exports.

## Exports (PDF/DOCX)

Excel (XLSX) and PowerPoint (PPTX) reports are generated client-side in the browser.
PDF and DOCX reports are provided by the backend endpoint:
`GET /api/documents/{id}/export?format=pdf|docx`

One section per claim, a summary table, flagged claims and user overrides marked, and this disclaimer on every page:

> This report is a verification aid and an indicator of evidence strength and uncertainty. It is not a guarantee and not a final academic judgment. Human review is recommended for all flagged claims.

## Source Check (`GET /api/documents/{id}/source-check`)

Checks whether any cited paper in the document has been corrected, retracted, or updated since verification.

Response:
```json
{
  "checked_at": "2026-11-19T10:00:00.000Z",
  "changes": [
    {
      "claim_id": "uuid",
      "citation_id": "[3]",
      "type": "retracted | corrected | updated",
      "message": "Source [3] was retracted in 2025.",
      "doi": "10.xxxx/yyyy"
    }
  ]
}
```

- The backend checks each DOI on Crossref (`api.crossref.org/works/{doi}`) and reads its update notices (the `update-to` and `updated-by` fields) for retraction, correction or update notices.
- Cache the result for 24 hours so the same report is not checked over and over.

## CORS

Allow your frontend origin (e.g. `http://localhost:5173`) with `Authorization` in allowed headers.
