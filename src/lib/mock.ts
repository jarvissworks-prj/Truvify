// Demo mode: everything below runs in the browser with localStorage.
// It lets you click through the whole product before the backend exists.
// Sample references use the 10.5555 Crossref test prefix — they are not real papers.

import type { ActivityItem, ChatMessage, Claim, DocumentRecord, Domain, JobStatus, SourceChange, SourceCheckResult } from "./types";
import { flagFor, trustScore, VERDICTS } from "./verdicts";
import { detectDomainFromText } from "./analysis/citations";
import { extractTextCached } from "./analysis/extract";
import { rejudgeFromSaved, runPipeline, type PipelineProgress } from "./analysis/pipeline";

const KEY = "truvify_demo_store_v1";

interface JobRecord {
  started: number;
  document_id: string;
  file_name: string;
  file_size: number;
  domain: Domain;
  progress?: PipelineProgress;
}

interface Store {
  documents: DocumentRecord[];
  claims: Claim[];
  jobs: Record<string, JobRecord>;
  /** Documents analysed from a real upload (everything else is the built-in sample). */
  analysed?: string[];
  /** Retraction/correction notices found while verifying, per document. */
  sourceChanges?: Record<string, { checked_at: string; changes: SourceChange[] }>;
}

const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const SAMPLE_TEXT = `Cardiovascular disease remains the leading cause of death worldwide, and preventive pharmacology continues to evolve. This review summarises the evidence behind common preventive interventions.

Daily low-dose aspirin reduces the risk of heart attack by 40% in all adults [1]. Statin therapy lowers LDL cholesterol by approximately 30–50% depending on dose and agent [2]. The landmark Framingham Heart Study began enrolling participants in 1952 [3].

Regular aerobic exercise of at least 150 minutes per week lowers systolic blood pressure by roughly 5–8 mmHg [4]. Omega-3 supplementation eliminates the risk of sudden cardiac death in patients with prior myocardial infarction [5].

Beta-blockers remain first-line therapy for uncomplicated hypertension in adults under 60 [6]. A 2021 meta-analysis of 48 trials confirmed that intermittent fasting reverses arterial calcification within six months [7]. Reducing sodium intake below 2,300 mg per day is associated with lower blood pressure in hypertensive adults [8].

Taken together, these findings suggest that lifestyle and pharmacological interventions are complementary rather than interchangeable.`;

function claimsFor(docId: string, variant: 1 | 2): Claim[] {
  const base = (over: Partial<Claim>): Claim => ({
    id: uid(),
    document_id: docId,
    claim_text: "",
    citation_id: null,
    citation_full_reference: null,
    citation_doi: null,
    page_number: 1,
    verdict: "supported",
    evidence_quote: null,
    explanation: null,
    evidence_strength: "High",
    retrieval_quality: "Abstract only",
    uncertainty_note: null,
    date_conflict: null,
    outdated: false,
    paper_year: 2021,
    newer_paper: null,
    needs_human_review: false,
    user_override_verdict: null,
    user_override_reason: null,
    suggested_fix: null,
    user_flagged: false,
    fabrication_signals_failed: 0,
    fabrication_detail: null,
    databases_searched: ["Crossref", "Semantic Scholar"],
    source_used: "Semantic Scholar",
    raw_passage: null,
    created_at: new Date().toISOString(),
    ...over,
  });

  const fixed = variant === 2;

  return [
    base({
      claim_text: fixed
        ? "Daily low-dose aspirin reduces the risk of recurrent cardiovascular events by about 22% in patients with prior events [1]."
        : "Daily low-dose aspirin reduces the risk of heart attack by 40% in all adults [1].",
      citation_id: "[1]",
      citation_full_reference: "Sample A, Demo B. Aspirin in secondary prevention of cardiovascular events. J Demo Cardiol. 2019;12(3):210–219.",
      citation_doi: "10.5555/demo.2019.001",
      verdict: fixed ? "supported" : "partly_supported",
      suggested_fix: fixed
        ? null
        : "Daily low-dose aspirin reduces the risk of recurrent cardiovascular events by about 22% in patients with prior events [1].",
      evidence_quote: "In 4,500 patients with prior cardiovascular events, daily low-dose aspirin reduced recurrence by 22% compared with placebo.",
      explanation: fixed
        ? "The paper reports a 22% reduction in patients with prior events, which matches the claim."
        : "The paper reports a 22% reduction in patients with prior events only, not a 40% reduction across all adults.",
      evidence_strength: "Medium",
      retrieval_quality: "Abstract only",
      uncertainty_note: "Only the abstract was available; the full methodology and subgroup results could not be checked.",
      paper_year: 2019,
      raw_passage: "Background: Aspirin is widely used… Results: In 4,500 patients with prior cardiovascular events, daily low-dose aspirin reduced recurrence by 22% compared with placebo (HR 0.78).",
    }),
    base({
      claim_text: "Statin therapy lowers LDL cholesterol by approximately 30–50% depending on dose and agent [2].",
      citation_id: "[2]",
      citation_full_reference: "Example C, et al. Dose-response of statins on LDL cholesterol: a pooled analysis. Demo Lipid Res. 2022;8:44–58.",
      citation_doi: "10.5555/demo.2022.014",
      verdict: "supported",
      evidence_quote: "Moderate-intensity statins lowered LDL-C by 30–49%, and high-intensity regimens by 50% or more.",
      explanation: "The paper reports LDL reductions of 30–50% by intensity, which matches the claim closely.",
      evidence_strength: "High",
      retrieval_quality: "Full text",
      uncertainty_note: "Full text was available and the reported range matches the claim directly.",
      paper_year: 2022,
      databases_searched: ["Crossref"],
      source_used: "Crossref",
    }),
    base({
      claim_text: `The landmark Framingham Heart Study began enrolling participants in ${fixed ? "1948" : "1952"} [3].`,
      citation_id: "[3]",
      citation_full_reference: "Historic D. Seventy years of the Framingham cohort. Demo Epidemiol Rev. 2020;5:1–12.",
      citation_doi: "10.5555/demo.2020.003",
      verdict: fixed ? "supported" : "partly_supported",
      suggested_fix: fixed ? null : "The landmark Framingham Heart Study began enrolling participants in 1948 [3].",
      evidence_quote: "Enrolment of the original cohort began in 1948 in Framingham, Massachusetts.",
      explanation: fixed
        ? "The paper confirms the study began enrolling participants in 1948."
        : "The paper supports the study's existence and importance, but gives a different start year.",
      evidence_strength: "High",
      retrieval_quality: "Abstract only",
      uncertainty_note: "Date verified against the paper's abstract.",
      date_conflict: fixed ? null : { claimed_date: "1952", actual_date: "1948", source: "Paper abstract states original cohort enrolment began in 1948." },
      paper_year: 2020,
    }),
    base({
      claim_text: "Regular aerobic exercise of at least 150 minutes per week lowers systolic blood pressure by roughly 5–8 mmHg [4].",
      citation_id: "[4]",
      citation_doi: fixed ? "10.5555/demo.2024.031" : "10.5555/demo.2013.022",
      verdict: "supported",
      suggested_fix: fixed ? null : "Regular aerobic exercise of at least 150 minutes per week lowers systolic blood pressure by roughly 5–8 mmHg [4].",
      evidence_quote: "Aerobic training was associated with a mean reduction in systolic blood pressure of 5 to 8 mmHg.",
      explanation: "The paper reports a 5–8 mmHg reduction, matching the claim, but the source is over 7 years old.",
      evidence_strength: "High",
      retrieval_quality: "Abstract only",
      uncertainty_note: "Finding matches, but newer meta-analyses may refine the effect size.",
      outdated: !fixed,
      paper_year: fixed ? 2024 : 2013,
      citation_full_reference: fixed
        ? "Stride G, et al. Exercise dose and blood pressure: updated meta-analysis. Demo J Hypertens. 2024;42:101–115."
        : "Runner E, Walker F. Aerobic exercise and blood pressure: a meta-analysis. Demo J Hypertens. 2013;31:880–891.",
      newer_paper: fixed
        ? null
        : {
            title: "Exercise dose and blood pressure: updated meta-analysis",
            year: 2024,
            doi: "10.5555/demo.2024.031",
            finding: "Confirms a 4–9 mmHg systolic reduction and finds the effect larger in people with hypertension.",
            citation: "Stride G, et al. Exercise dose and blood pressure: updated meta-analysis. Demo J Hypertens. 2024;42:101–115. doi:10.5555/demo.2024.031",
          },
      databases_searched: ["Crossref", "Semantic Scholar", "OpenAlex"],
    }),
    base({
      claim_text: "Omega-3 supplementation eliminates the risk of sudden cardiac death in patients with prior myocardial infarction [5].",
      citation_id: "[5]",
      citation_full_reference: "Fisher H, et al. Omega-3 fatty acids after myocardial infarction: a randomised trial. Demo Heart J. 2021;19:301–312.",
      citation_doi: "10.5555/demo.2021.050",
      verdict: "contradicted",
      suggested_fix: "Omega-3 supplementation did not significantly reduce sudden cardiac death in patients with prior myocardial infarction [5].",
      evidence_quote: "Omega-3 supplementation was associated with no significant reduction in sudden cardiac death compared with placebo (HR 0.95, 95% CI 0.81–1.12).",
      explanation: "The trial found no significant reduction in sudden cardiac death, the opposite of 'eliminates the risk'.",
      evidence_strength: "High",
      retrieval_quality: "Full text",
      uncertainty_note: "SciFact also labels a closely matching claim as refuted.",
      needs_human_review: true,
      databases_searched: ["Crossref", "Semantic Scholar", "SciFact"],
      source_used: "Semantic Scholar + SciFact",
    }),
    base({
      claim_text: "Beta-blockers remain first-line therapy for uncomplicated hypertension in adults under 60 [6].",
      citation_id: "[6]",
      citation_full_reference: "Guide J. Antihypertensive drug classes compared. Demo Clin Pharmacol. 2023;7:55–70.",
      citation_doi: "10.5555/demo.2023.061",
      verdict: "unsupported",
      suggested_fix: "Thiazide diuretics, ACE inhibitors, ARBs and calcium channel blockers are recommended as first-line therapy for uncomplicated hypertension in adults under 60 [6].",
      evidence_quote: "Thiazide diuretics, ACE inhibitors, ARBs and calcium channel blockers are recommended as initial therapy.",
      explanation: "The paper exists but lists other drug classes as first-line; it does not say beta-blockers are first-line.",
      evidence_strength: "Medium",
      retrieval_quality: "Abstract only",
      uncertainty_note: "Only the abstract was available; the paper may discuss beta-blockers elsewhere.",
    }),
    ...(fixed
      ? []
      : [
          base({
            claim_text: "A 2021 meta-analysis of 48 trials confirmed that intermittent fasting reverses arterial calcification within six months [7].",
            citation_id: "[7]",
            citation_full_reference: "Nowhere K, Ghost L. Intermittent fasting and arterial calcification: meta-analysis of 48 RCTs. Int J Vasc Renewal. 2021;3:1–9.",
            citation_doi: "10.5555/does-not-resolve-77",
            verdict: "likely_fabricated" as const,
            suggested_fix: null,
            evidence_quote: null,
            explanation: "No paper matching this title, journal or DOI could be found in any database.",
            evidence_strength: "Low" as const,
            retrieval_quality: "Not retrievable" as const,
            uncertainty_note: "Remove or replace this citation. No matching paper exists in any index.",
            needs_human_review: true,
            fabrication_signals_failed: 3,
            fabrication_detail: { doi_resolved: false, journal_found: false, title_found: false, authors_found: null },
            databases_searched: ["Crossref", "Semantic Scholar", "OpenAlex", "SciFact"],
            source_used: null,
          }),
        ]),
    base({
      claim_text: "Reducing sodium intake below 2,300 mg per day is associated with lower blood pressure in hypertensive adults [8].",
      citation_id: "[8]",
      citation_full_reference: "Salt M. Dietary sodium and blood pressure in a regional cohort. Proc Small Demo Soc. 2018;2:14–19.",
      citation_doi: null,
      verdict: "not_found",
      evidence_quote: null,
      explanation: "The reference could not be retrieved from any database, but there are no signs it is fabricated.",
      evidence_strength: "Low",
      retrieval_quality: "Not retrievable",
      uncertainty_note: "This may be a minor regional publication that is not indexed.",
      fabrication_signals_failed: 1,
      fabrication_detail: { doi_resolved: null, journal_found: true, title_found: false },
      databases_searched: ["Crossref", "Semantic Scholar", "OpenAlex", "SciFact"],
      source_used: null,
      paper_year: 2018,
    }),
  ];
}

function textFor(variant: 1 | 2, claims: Claim[]): string {
  if (variant === 1) return SAMPLE_TEXT;
  return [
    "Cardiovascular disease remains the leading cause of death worldwide, and preventive pharmacology continues to evolve. This revised review summarises the evidence behind common preventive interventions.",
    claims.slice(0, 3).map((c) => c.claim_text).join(" "),
    claims.slice(3, 5).map((c) => c.claim_text).join(" "),
    claims.slice(5).map((c) => c.claim_text).join(" "),
  ].join("\n\n");
}

function makeDoc(fileName: string, variant: 1 | 2, opts: { created?: string; size?: number; domain?: Domain; saved?: boolean } = {}) {
  const id = uid();
  const claims = claimsFor(id, variant);
  const score = trustScore(claims);
  const doc: DocumentRecord = {
    id,
    file_name: fileName,
    file_format: fileName.split(".").pop()?.toLowerCase() ?? "pdf",
    file_size: opts.size ?? 1_240_000,
    domain: opts.domain ?? "Medical",
    page_count: 6,
    claim_count: claims.length,
    trust_score: score,
    flag: flagFor(score),
    saved: opts.saved ?? false,
    chunks_processed: 3,
    databases_used: ["Crossref", "Semantic Scholar", "OpenAlex", "SciFact"],
    time_taken_seconds: 41,
    extracted_text: textFor(variant, claims),
    status: "done",
    created_at: opts.created ?? new Date().toISOString(),
  };
  return { doc, claims };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const day = 86_400_000;
  const a = makeDoc("Cardio_Review_v1.pdf", 1, { created: new Date(Date.now() - 2 * day).toISOString(), saved: true });
  const b = makeDoc("Cardio_Review_v2.pdf", 2, { created: new Date(Date.now() - day).toISOString(), saved: true });
  const s: Store = { documents: [b.doc, a.doc], claims: [...a.claims, ...b.claims], jobs: {} };
  save(s);
  return s;
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

// ---------- IndexedDB demo files storage ----------
function openDemoFilesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not available"));
    }
    const req = indexedDB.open("truvify_demo_files", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDemoFile(documentId: string, file: Blob | File): Promise<void> {
  try {
    const db = await openDemoFilesDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const putReq = store.put(file, documentId);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("Failed to save demo file:", err);
  }
}

export async function getDemoFile(documentId: string): Promise<Blob | null> {
  try {
    const db = await openDemoFilesDB();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const getReq = store.get(documentId);
      getReq.onsuccess = () => resolve((getReq.result as Blob) || null);
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    return null;
  }
}

// ---------- data ----------
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export const mockData = {
  async listDocuments(): Promise<DocumentRecord[]> {
    await wait(150);
    const s = load();
    return [...s.documents].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getDocument(id: string): Promise<DocumentRecord | null> {
    await wait(150);
    return load().documents.find((d) => d.id === id) ?? null;
  },
  async getClaims(documentId: string): Promise<Claim[]> {
    return load().claims.filter((c) => c.document_id === documentId);
  },
  async updateClaim(id: string, patch: Partial<Claim>): Promise<Claim> {
    const s = load();
    const c = s.claims.find((x) => x.id === id);
    if (!c) throw new Error("Claim not found");
    Object.assign(c, patch);
    save(s);
    return { ...c };
  },
  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<DocumentRecord> {
    const s = load();
    const d = s.documents.find((x) => x.id === id);
    if (!d) throw new Error("Document not found");
    Object.assign(d, patch);
    save(s);
    return { ...d };
  },
  async setSaved(id: string, saved: boolean) {
    const s = load();
    const d = s.documents.find((x) => x.id === id);
    if (d) d.saved = saved;
    save(s);
  },
  async deleteDocument(id: string) {
    const s = load();
    s.documents = s.documents.filter((d) => d.id !== id);
    s.claims = s.claims.filter((c) => c.document_id !== id);
    save(s);
    try {
      const db = await openDemoFilesDB();
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(id);
    } catch {
      /* ignore */
    }
  },
  async getOriginalFile(id: string): Promise<Blob | null> {
    return getDemoFile(id);
  },
  async listChatMessages(documentId: string): Promise<ChatMessage[]> {
    try {
      const raw = localStorage.getItem(`truvify_demo_chat_${documentId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  async clearChat(documentId: string): Promise<void> {
    try {
      localStorage.removeItem(`truvify_demo_chat_${documentId}`);
    } catch {
      /* ignore */
    }
  },
  reset() {
    localStorage.removeItem(KEY);
  },
};

// ---------- backend simulation ----------
// Sample documents (Cardio_Review_v1/v2) use hand-written results.
// Every uploaded file is analysed for real by src/lib/analysis/pipeline.ts.

/** Jobs running in this browser tab. A job missing from here was interrupted by a reload. */
const running = new Set<string>();
const isAnalysed = (s: Store, docId: string) => (s.analysed ?? []).includes(docId);

function saveJobProgress(jobId: string, progress: PipelineProgress) {
  const s = load();
  const job = s.jobs[jobId];
  if (!job) return;
  job.progress = progress;
  save(s);
}

export const mockApi = {
  async detectDomain(file: File): Promise<Domain> {
    try {
      const doc = await extractTextCached(file);
      return detectDomainFromText(doc.pages.join(" "));
    } catch {
      return "General research";
    }
  },

  async startVerification(file: File, domain: Domain) {
    const s = load();
    const job_id = uid();
    const document_id = uid();
    s.jobs[job_id] = { started: Date.now(), document_id, file_name: file.name, file_size: file.size, domain };
    save(s);
    await saveDemoFile(document_id, file);
    running.add(job_id);

    runPipeline(file, domain, document_id, (p) => saveJobProgress(job_id, p))
      .then((result) => {
        const st = load();
        const score = result.claims.length ? trustScore(result.claims) : null;
        const doc: DocumentRecord = {
          id: document_id,
          file_name: file.name,
          file_format: file.name.split(".").pop()?.toLowerCase() ?? "pdf",
          file_size: file.size,
          domain,
          page_count: result.pageCount,
          claim_count: result.claims.length,
          trust_score: score,
          flag: score === null ? null : flagFor(score),
          saved: false,
          chunks_processed: result.chunks,
          databases_used: result.databasesUsed,
          time_taken_seconds: result.seconds,
          extracted_text: result.extractedText,
          status: "done",
          created_at: new Date().toISOString(),
        };
        st.documents.unshift(doc);
        st.claims.push(...result.claims);
        st.analysed = [...(st.analysed ?? []), document_id];
        st.sourceChanges = { ...(st.sourceChanges ?? {}), [document_id]: { checked_at: new Date().toISOString(), changes: result.sourceChanges } };
        const job = st.jobs[job_id];
        if (job?.progress) {
          job.progress = {
            ...job.progress,
            stage: "done",
            percent: 100,
            eta_seconds: 0,
            activity: job.progress.activity.filter((a) => a.id !== "report").concat({ id: "done", kind: "ok", text: "Report ready." }),
          };
        }
        try {
          localStorage.setItem(KEY, JSON.stringify(st));
        } catch {
          throw new Error("Your browser storage is full. Delete some old reports from the dashboard and try again.");
        }
      })
      .catch((err: Error) => {
        const st = load();
        const job = st.jobs[job_id];
        if (job) {
          job.progress = {
            ...(job.progress ?? { percent: 0, eta_seconds: null, page_count: null, current_chunk: null, total_chunks: null, claims_checked: 0, total_claims: 0, issues_found: 0, activity: [] }),
            stage: "failed",
            error: err.message || "Verification failed. Please try again.",
          };
          save(st);
        }
      })
      .finally(() => running.delete(job_id));

    return { job_id, document_id };
  },

  async getJob(jobId: string): Promise<JobStatus> {
    await wait(60);
    const s = load();
    const job = s.jobs[jobId];
    if (!job) throw new Error("Job not found");
    let p = job.progress;
    const finished = p?.stage === "done" || p?.stage === "failed";
    if (!finished && !running.has(jobId)) {
      p = {
        ...(p ?? { percent: 0, eta_seconds: null, page_count: null, current_chunk: null, total_chunks: null, claims_checked: 0, total_claims: 0, issues_found: 0, activity: [] }),
        stage: "failed",
        error: "This verification was interrupted because the page was reloaded or closed. Please upload the file again.",
      };
    }
    p ??= { stage: "extracting", percent: 0, eta_seconds: null, page_count: null, current_chunk: null, total_chunks: null, claims_checked: 0, total_claims: 0, issues_found: 0, activity: [] };
    return {
      job_id: jobId,
      document_id: job.document_id,
      file_name: job.file_name,
      page_count: p.page_count,
      domain: job.domain,
      stage: p.stage,
      percent: p.percent,
      eta_seconds: p.eta_seconds,
      current_chunk: p.current_chunk,
      total_chunks: p.total_chunks,
      claims_checked: p.claims_checked,
      total_claims: p.total_claims,
      issues_found: p.issues_found,
      activity: [...p.activity].reverse() as ActivityItem[],
      error: p.error ?? null,
    };
  },

  async recheckClaim(claim: Claim): Promise<Claim> {
    await wait(600);
    const s = load();
    if (isAnalysed(s, claim.document_id)) {
      const j = rejudgeFromSaved(claim, claim.claim_text);
      if (j) return mockData.updateClaim(claim.id, { ...j, uncertainty_note: `${j.uncertainty_note ?? ""} (Rechecked ${new Date().toLocaleTimeString()})`.trim() });
    }
    return mockData.updateClaim(claim.id, {
      uncertainty_note: (claim.uncertainty_note ?? "").replace(/ \(Rechecked.*\)$/, "") + ` (Rechecked ${new Date().toLocaleTimeString()})`,
    });
  },

  async reverifyText(
    documentId: string,
    correctedText: string,
  ): Promise<{ document: DocumentRecord; claims: Claim[] }> {
    await wait(1200);
    const s = load();
    const doc = s.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error("Document not found");
    const analysed = isAnalysed(s, documentId);

    const claims = s.claims.filter((c) => c.document_id === documentId);
    const updatedClaims: Claim[] = [];

    const sentences = correctedText
      .split(/(?<=[.?!])\s+|\n+/)
      .map((str) => str.trim())
      .filter(Boolean);

    const normText = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const c of claims) {
      const origSentence = c.claim_text.trim();
      const cleanFix = c.suggested_fix ? c.suggested_fix.trim() : "";
      const fixNorm = cleanFix ? normText(cleanFix) : "";

      const fixInText = fixNorm.length > 8 && (
        (cleanFix && correctedText.includes(cleanFix)) ||
        normText(correctedText).includes(fixNorm)
      );

      const stillPresent = correctedText.includes(origSentence);

      if (stillPresent && !fixInText) {
        updatedClaims.push(c);
        continue;
      }

      if (fixInText) {
        c.claim_text = cleanFix;
        c.verdict = "supported";
        c.evidence_strength = "High";
        c.outdated = false;
        c.date_conflict = null;
        c.uncertainty_note = "Re-verified — claim updated with recommended source evidence.";
        c.needs_human_review = false;
        c.explanation = "Re-verified — the corrected sentence now matches the source paper.";
        c.user_override_verdict = null;
        c.user_override_reason = null;
        updatedClaims.push(c);
        continue;
      }

      // Sentence was changed! Look for a sentence with the same citation marker
      const marker = c.citation_id;
      let newSentence = marker ? sentences.find((str) => str.includes(marker)) : undefined;

      if (!newSentence && origSentence.length > 20) {
        const words = origSentence.split(/\s+/).slice(0, 4).join(" ");
        newSentence = sentences.find((str) => str.includes(words));
      }

      if (!newSentence) {
        // Sentence deleted entirely -> remove that claim
        continue;
      }

      c.claim_text = newSentence;
      const j = analysed ? rejudgeFromSaved(c, newSentence) : null;
      if (j && j.verdict === "supported") {
        Object.assign(c, j, {
          verdict: "supported",
          date_conflict: null,
          needs_human_review: false,
          uncertainty_note: "Re-verified — your edit now matches the source paper.",
          explanation: "Re-verified — the edited text aligns with the source paper.",
        });
      } else if (j) {
        Object.assign(c, j, {
          outdated: c.outdated,
          uncertainty_note: `Re-verified after your edit. ${j.uncertainty_note ?? ""}`.trim(),
        });
      } else {
        c.uncertainty_note = "Re-verified — the edit did not resolve the issue.";
      }
      updatedClaims.push(c);
    }

    doc.corrected_text = correctedText;
    doc.claim_count = updatedClaims.length;
    doc.trust_score = trustScore(updatedClaims);
    doc.flag = flagFor(doc.trust_score);

    s.claims = s.claims.filter((c) => c.document_id !== documentId).concat(updatedClaims);
    save(s);

    return { document: doc, claims: updatedClaims };
  },

  async sourceCheck(documentId: string): Promise<SourceCheckResult> {
    const s = load();
    const saved = s.sourceChanges?.[documentId];
    if (saved) {
      // Drop notices whose claim was removed by an edit.
      const ids = new Set(s.claims.filter((c) => c.document_id === documentId).map((c) => c.id));
      return { checked_at: saved.checked_at, changes: saved.changes.filter((ch) => ids.has(ch.claim_id)) };
    }
    if (isAnalysed(s, documentId)) return { checked_at: new Date().toISOString(), changes: [] };
    // Built-in sample report: show one example notice.
    const claim3 = s.claims.filter((c) => c.document_id === documentId).find((c) => c.citation_id === "[3]");
    if (claim3) {
      return {
        checked_at: new Date().toISOString(),
        changes: [
          {
            claim_id: claim3.id,
            citation_id: "[3]",
            type: "corrected",
            message: "Source [3] has a published correction (2024).",
            doi: claim3.citation_doi || "10.5555/demo.2020.003",
          },
        ],
      };
    }
    return { checked_at: new Date().toISOString(), changes: [] };
  },

  async reportChat(documentId: string, message: string): Promise<{ reply: string; created_at: string }> {
    await wait(400);
    const s = load();
    const doc = s.documents.find((d) => d.id === documentId);
    const claims = s.claims.filter((c) => c.document_id === documentId);

    let reply = "";
    const lower = message.toLowerCase();
    const claimMatch = lower.match(/claim\s*(\d+)/i);

    if (claimMatch) {
      const index = parseInt(claimMatch[1], 10) - 1;
      const c = claims[index];
      if (!c) {
        reply = `Claim ${claimMatch[1]} was not found in this report. This document contains ${claims.length} evaluated claims.`;
      } else {
        const v = c.user_override_verdict || c.verdict;
        const vLabel = VERDICTS[v]?.label || v;
        const fixText = c.suggested_fix ? `\n\n**Suggested correction:** "${c.suggested_fix}"` : "";
        const evidenceText = c.evidence_quote ? `\n\n**Evidence quote from source:** "${c.evidence_quote}"` : "";
        reply = `Claim ${index + 1} is marked **${vLabel}**.\n\n**Explanation:** ${c.explanation || "No explanation recorded."}${evidenceText}${fixText}`;
      }
    } else if (lower.includes("fix first") || lower.includes("priority") || lower.includes("which claim")) {
      const issues = claims
        .map((c, i) => ({ c, num: i + 1 }))
        .filter(({ c }) => {
          const v = c.user_override_verdict || c.verdict;
          return v === "contradicted" || v === "likely_fabricated" || v === "unsupported" || v === "partly_supported";
        });

      if (issues.length === 0) {
        reply = "All claims in this report are fully supported by their cited sources. There are no critical issues to fix.";
      } else {
        const top = issues.slice(0, 3).map(({ num, c }) => {
          const v = c.user_override_verdict || c.verdict;
          return `- **Claim ${num}** (${VERDICTS[v]?.label || v}): ${c.claim_text.slice(0, 80)}…`;
        }).join("\n");
        reply = `You should prioritize checking and fixing these claims first:\n\n${top}`;
      }
    } else if (lower.includes("score") || lower.includes("trust score") || lower.includes("mean")) {
      const score = doc?.trust_score ?? trustScore(claims);
      reply = `The trust score is **${score}/100**. It is calculated based on evidence alignment: supported claims receive full weight (1.0), partly supported receive half weight (0.5), and unsupported or contradicted claims receive 0.`;
    } else {
      reply = `This report for **${doc?.file_name || "the uploaded document"}** evaluated **${claims.length} claims**. You can ask me about specific claims (e.g. *"Why is Claim 1 partly supported?"*), which claims to fix first, or the preferred corrections based on the evidence.`;
    }

    reply += "\n\n*(Demo mode — connect Supabase + Gemini for full AI answers)*";

    const userMsg: ChatMessage = {
      id: uid(),
      document_id: documentId,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      document_id: documentId,
      role: "assistant",
      content: reply,
      created_at: new Date(Date.now() + 50).toISOString(),
    };

    try {
      const key = `truvify_demo_chat_${documentId}`;
      const existing: ChatMessage[] = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push(userMsg, assistantMsg);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      /* ignore storage error */
    }

    return { reply, created_at: assistantMsg.created_at };
  },
};
