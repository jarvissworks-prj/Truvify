# Truvify — Claude Assistant Guide

This document provides complete context, architecture, design system conventions, and command references for Claude when working on the **Truvify** codebase.

---

## 1. Project Overview

**Truvify** is a web application for scientific citation verification. Users upload a research paper or draft (PDF, DOCX, XLSX, PPTX), and Truvify:
1. Extracts factual claims and their associated citation markers (e.g. `[1]`, `(Smith, 2019)`).
2. Retrieves the cited reference papers from academic databases (Crossref, Semantic Scholar, OpenAlex, SciFact).
3. Evaluates whether the cited evidence actually supports the claim using an LLM pipeline.
4. Generates an interactive report with trust scores, claim verdict breakdowns, an in-place highlight correction editor, and multi-format exports.

---

## 2. Tech Stack

- **Framework**: React 18 (Vite, TypeScript, strict mode)
- **Routing**: `react-router-dom` v6
- **Styling**: Tailwind CSS v3 with custom design system classes (`btn-primary`, `btn-outline`, `btn-ghost`, `card`, `input`, `label`, `eyebrow`, `shadow-soft`, `shadow-lift`, `border-hairline`)
- **Backend / Auth**: Supabase Auth & PostgreSQL + Storage (or standalone FastAPI backend)
- **Demo Mode**: Zero-backend mode powered by `localStorage` and `IndexedDB` (`truvify_demo_files` database). Uploaded files are **really analysed in the browser** (see §6).
- **Animation & UI helpers**: `framer-motion` (never install `motion`), `lucide-react`, `clsx`, `tailwind-merge` **v2** (v3 is for Tailwind v4 — do not upgrade), `cn()` in `src/lib/utils.ts`
- **In-browser document reading (demo mode)**: `pdfjs-dist` v4 (legacy build, loaded on demand), `jszip` (DOCX/PPTX), `xlsx`
- **Document Processing & Export**:
  - `docx`: Word report and corrected document generation
  - `jspdf`: Clean client-side PDF document generation
  - `pptxgenjs`: Multi-slide PowerPoint reports and corrected presentation generation
  - `xlsx` (SheetJS): Multi-sheet Excel reports and corrected spreadsheet generation
  - `@rollup/wasm-node`: Pure WebAssembly Rollup fallback to ensure compatibility across all operating systems and Windows Application Control policies

---

## 3. Essential Commands

```bash
# Install dependencies
npm install

# Start Vite local development server (port 5173)
npm run dev

# Run TypeScript checks
npm run typecheck       # or: npx tsc -b

# Build for production
npm run build           # tsc -b && vite build

# Preview production build
npm run preview
```

---

## 4. Key Directories and Files

```
├── CLAUDE.md                  # This file (guidelines and context for Claude)
├── BACKEND_CONTRACT.md        # API contract for backend FastAPI endpoints
├── README.md                  # User-facing overview and setup
├── supabase/
│   ├── schema.sql             # Complete database schema, RLS policies, and storage setup
│   ├── config.toml            # Edge Function configuration (verify_jwt = false)
│   └── functions/
│       ├── report-chat/       # Deno Edge Function proxying Gemini AI with grounded context
│       └── delete-account/    # Deno Edge Function for complete account & storage deletion
├── src/
│   ├── App.tsx                # Route definitions with ProtectedRoute wrappers
│   ├── index.css              # Tailwind base, components, utilities, and animations
│   ├── components/
│   │   ├── MagneticButton.tsx # Cursor-following wrapper (hero "Verify now")
│   │   ├── ScrollReveal.tsx   # Progressive fade-in: visible by default, animates in on scroll, never re-hides (no blank screenshots)
│   │   ├── HaloDropzone.tsx   # Colourful halo upload box on /upload (keep its colours as-is)
│   │   ├── AnimatedBackground.tsx # Gliding hover highlight (domain cards on /upload)
│   │   ├── InteractiveCard.tsx    # Lifting card + InteractiveCardLink (ClaimCard uses it)
│   │   ├── ReportChat.tsx     # Grounded Gemini chat about report with clickable "Claim N" links
│   │   ├── SideBySide.tsx     # Word diff of claim vs source quote
│   │   ├── Navbar.tsx         # Top navigation, auth state, settings gear menu, ProtectedRoute, Layout (skip link + #main)
│   │   ├── LandingSections.tsx # Landing: problem (sourced stats), example, comparison, audience, try-it, architecture, FAQ, TryNowButton
│   │   ├── ClaimCard.tsx      # Individual claim card (verdict badge, evidence quote, confidence, override)
│   │   ├── Common.tsx         # Modal, PageShell, FormatIcon, VerdictBadge, Logo, DemoBanner
│   │   ├── DeleteAccountModal.tsx # Reusable account deletion modal
│   │   ├── Icons.tsx          # Consistent stroke SVG icons (Settings, Pencil, Download, etc.)
│   │   └── AuthParts.tsx      # Shared auth layout, forms, Google button
│   ├── context/
│   │   ├── AuthContext.tsx    # User session, login/signup/OAuth, preferences, password reset
│   │   └── ToastContext.tsx   # Global toast notifications
│   ├── lib/
│   │   ├── utils.ts           # cn() = twMerge(clsx(...))
│   │   ├── toneCheck.ts       # Overstated-wording check ("eliminates", "proves" …)
│   │   ├── diffWords.ts       # Word-level diff used by SideBySide
│   │   ├── liveBrowser.ts     # Live in-browser backend engine with Supabase persistence
│   │   ├── analysis/          # In-browser verification engine (see §6)
│   │   │   ├── extract.ts     #   PDF/DOCX/PPTX/XLSX → text per page
│   │   │   ├── citations.ts   #   reference list + cited sentences + domain detection
│   │   │   ├── sources.ts     #   Crossref + OpenAlex lookups (DOI, title search, newer papers, retractions)
│   │   │   ├── judge.ts       #   rule-based claim vs abstract comparison → verdict, evidence, fix
│   │   │   └── pipeline.ts    #   runs everything and reports live job progress
│   │   ├── types.ts           # Core TypeScript types (Claim, DocumentRecord, ChatMessage, etc.)
│   │   ├── config.ts          # Environment variables, DEMO_MODE, BACKEND_MODE ("browser" | "fastapi")
│   │   ├── api.ts             # Unified data and backend client (routes to mock in DEMO_MODE, liveBrowser in browser mode)
│   │   ├── mock.ts            # Complete demo mock implementation with realistic sample claims & demo chat
│   │   ├── export.ts          # XLSX, PPTX, DOCX, PDF report exports & corrected document download (lazy-loaded by Results)
│   │   ├── disclaimer.ts      # DISCLAIMER text (kept separate so Results doesn't statically import export.ts)
│   │   └── verdicts.ts        # Verdict definitions, weights, trust score calculations, badge styles
│   └── pages/
│       ├── Landing.tsx        # Homepage with hero, orbit cards, stats, pipeline steps
│       ├── AuthPages.tsx      # /login, /signup, /verify-email, /reset-password
│       ├── Upload.tsx         # File drag-and-drop & domain selector
│       ├── Progress.tsx       # Live verification job polling & progress bar
│       ├── Results.tsx        # Full report, claim cards, AI chat, highlight view editor, re-verify
│       ├── Compare.tsx        # Side-by-side comparison of two document versions
│       └── Dashboard.tsx      # Document history accordion, file preview, user preferences
```

---

## 5. Important Conventions & Rules

1. **Backend Modes (`BACKEND_MODE`)**:
   - `browser` (default): Analysis pipeline runs directly in the browser tab via `src/lib/liveBrowser.ts`, writing documents, claims, and storage objects directly into Supabase via RLS. No FastAPI server is needed.
   - `fastapi`: Calls external FastAPI server at `VITE_API_URL` for file processing and verification jobs.
   - `DEMO_MODE`: Activated when Supabase keys are empty or `VITE_DEMO_MODE=true`. Uses `src/lib/mock.ts` with local state.

2. **Chat Architecture (`ReportChat.tsx` & Edge Function)**:
   - On `/results/:documentId`, users can ask grounded questions about the specific report.
   - Proxied through Supabase Edge Function `report-chat` in Deno (`verify_jwt = false`).
   - The server verifies user session and ownership via user client with RLS, enforces a 30 messages/hour rate limit, and constructs a grounded report context (verdicts, claim texts, evidence quotes, full citations, DOI, source notices, recent 12 messages, and up to 15,000 characters of extracted text).
   - Gemini API is called strictly with temperature 0.3 and a restrictive system prompt preventing invented facts.
   - Mentions of "Claim N" in assistant replies are interactive buttons that scroll directly to the corresponding claim card (`#claim-{id}`).
   - Message turns are persisted in `chat_messages` table.

3. **Demo Mode Parity**:
   - The app runs in Demo Mode whenever `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are empty in `.env`.
   - Every backend call in `src/lib/api.ts` must follow the `if (DEMO_MODE) return mockApi.xxx(...)` pattern.
   - Any new backend feature or data entity must have an offline equivalent in `src/lib/mock.ts`.

2. **Styling & UI Consistency**:
   - Do NOT rewrite components or alter the visual aesthetic.
   - Use existing Tailwind custom classes defined in `src/index.css`:
     - Buttons: `btn-primary`, `btn-outline`, `btn-ghost`
     - Containers: `card`, `input`, `label`, `eyebrow`
     - Borders & Shadows: `border-hairline`, `shadow-soft`, `shadow-lift`

3. **Verdicts & Calculations**:
   - The 6 standard verdicts are: `supported`, `partly_supported`, `unsupported`, `contradicted`, `not_found`, `likely_fabricated`.
   - Trust score formula: `round((supported * 1.0 + partly_supported * 0.5) / total * 100)`.
   - Score flags: `green` (70–100), `amber` (40–69), `red` (0–39).

4. **Highlight View & Re-verification**:
   - Original text remains in `doc.extracted_text`.
   - Edited versions are stored in `doc.corrected_text`.
   - When text is re-verified (`backend.reverifyText`), only modified sentences are evaluated.
   - Download corrected document exports in the input format (`.pdf`, `.docx`, `.pptx`, `.xlsx`).

5. **UI upgrade rules (agreed with the project owner)**:
   - Keep the monochrome light theme: `#FAFAFA` canvas (`bg-surface`), `#FFFFFF` cards, 1px `#EAEAEA` borders (`border-hairline`), `#0A0A0A` primary, Geist + JetBrains Mono. Exception: `HaloDropzone` keeps its colourful halo.
   - Tailwind **v3** syntax only (no v4 `bg-linear-to-*`, no undefined shadcn CSS variables).
   - Never change routes, API calls, Supabase logic or verification features when doing UI work.
   - `tsconfig` has `noUnusedLocals` — remove unused imports from pasted components (e.g. a stray `React` or icon import).

6. **Performance, accessibility and honesty rules (19 Nov 2026)**:
   - App pages are lazy-loaded in `App.tsx`; Results loads `lib/export.ts` with `import()` and preloads it on mount (the PDF export opens a window, so it must be ready at click time). Don't add static imports of `lib/export.ts`, `pdfjs-dist`, `docx`, `jspdf`, `pptxgenjs` or `xlsx` to Landing, AuthPages, Navbar or Common.
   - `vite.config.ts` splits vendors into chunks. The Rollup CommonJS and preload helpers go to `cjs-helpers` so the home page doesn't preload a big library.
   - `ScrollReveal` must never leave content hidden in a full-page screenshot. Keep it progressive.
   - Absolutely positioned children (`sr-only`) inside an `overflow-x-auto` box need `relative` on that box, otherwise the page scrolls sideways on phones.
   - Landing copy must match the code: browser/guest mode uses Crossref + OpenAlex only (not Semantic Scholar or SciFact), checks abstracts (not full text), and domains only change the outdated-source age (`OUTDATED_AFTER` in `pipeline.ts`). Every statistic on the landing page links to its source.

---

## 6. Demo-mode verification engine (`src/lib/analysis/`)

Before this engine existed, demo mode ignored the uploaded file and always returned the same sample cardiology report. Now every upload is processed for real:

1. **extract.ts** — reads the file in the browser (pdf.js for PDF, JSZip for DOCX/PPTX incl. Word endnotes, SheetJS for XLSX). Returns text per page/slide/sheet. Scanned PDFs (no text layer) fail with a clear message.
2. **citations.ts** — finds the last "References/Bibliography/Works cited" heading, parses entries (numbered `[1]`/`1.` or author–year), and finds every sentence with a marker: `[3]`, `[1, 2]`, `[4–6]`, `(Smith, 2019)`, `(Smith et al., 2019; Lee 2020)`, `Smith et al. (2019)`. Claim text is an **exact substring** of `extracted_text` (Results marks a claim "Edited" when it isn't). Max 60 claims. Also `detectDomainFromText` (keyword scoring on the first 1,000 words).
3. **sources.ts** — Crossref (`api.crossref.org`) and OpenAlex (`api.openalex.org`), both free, keyless and CORS-enabled. DOI lookup first, then title search (accepted only when ≥75% of the found title's words appear in the reference). Reads abstracts, `updated-by` (retractions/corrections) and OpenAlex `is_retracted`. Finds a newer well-cited paper for outdated sources.
4. **judge.ts** — transparent rule-based comparison against the abstract: key-word overlap, numbers, years (date conflicts), finding-level negation ("did not", "no significant effect") and overstated wording. Produces verdict, evidence quote (best-matching abstract sentence), explanation, strength and a safe `suggested_fix` (swaps a wrong number/year, softens overstated words). This is the part the real backend replaces with the Gemini/LLM comparison.
5. **pipeline.ts** — orchestrates, looks references up 3 at a time, and writes progress into the job record that `/progress` polls. Rules: DOI that doesn't resolve + no title match → `likely_fabricated`; no DOI + no match → `not_found`; marker missing from the reference list → `not_found`; databases unreachable → `not_found` with an "internet" note (never "fabricated"). Outdated after 7 yrs (Medical), 10 (General), 12 (Geological/Student); never for Historical/Legal.

`mock.ts` keeps the two hand-written sample reports (Cardio_Review_v1/v2) for the dashboard; the store lists real uploads in `analysed[]` and their retraction notices in `sourceChanges{}`. Recheck and Re-verify re-run `judge.ts` against the abstract saved in `raw_passage` (no new lookup), matching the backend contract. Reloading during a job marks it "interrupted" (the job runs in the tab).

Limits: abstract-level checking only (no full text), no AI, needs internet for lookups, superscript citation numbers are not detected.

## 7. Tests

`tests/` holds browser tests (Python + Playwright) and the fixture builder:
```bash
pip install playwright reportlab python-docx python-pptx openpyxl && playwright install chromium
python tests/make_fixtures.py          # builds tests/fixtures/*.pdf|docx|pptx|xlsx
npm run dev                            # in another terminal (port 5173)
python tests/e2e_results.py            # results page features (20 checks)
python tests/e2e_app.py                # landing, dashboard, compare, settings, failure cases (12 checks)
python tests/e2e_formats.py            # DOCX / PPTX / XLSX / scanned PDF
python tests/e2e_guest.py              # first-visit guest journey + phone layout (29 checks); BASE=... to target another server
```
`tests/fake_db.py` serves canned Crossref/OpenAlex responses so tests run offline. In the scripts, change `executable_path="/usr/bin/google-chrome"` to your Chrome path or remove it to use Playwright's Chromium.
