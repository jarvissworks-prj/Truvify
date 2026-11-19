// Runs a full verification of an uploaded file in the browser (demo mode).
// extract text → find cited sentences + reference list → look each reference up
// in Crossref/OpenAlex → compare claim vs. abstract → build the report.

import type { ActivityItem, Claim, Domain, JobStage, NewerPaper, SourceChange, Verdict } from "../types";
import { VERDICTS, isIssue } from "../verdicts";
import { prepareDocument, type ReferenceEntry } from "./citations";
import { extractTextCached } from "./extract";
import { judgeClaim, type Judgement } from "./judge";
import { findNewerPaper, lookupDoi, searchReference, type PaperInfo } from "./sources";

export interface PipelineProgress {
  stage: JobStage;
  percent: number;
  eta_seconds: number | null;
  page_count: number | null;
  current_chunk: number | null;
  total_chunks: number | null;
  claims_checked: number;
  total_claims: number;
  issues_found: number;
  activity: ActivityItem[]; // oldest first
  error?: string | null;
}

export interface PipelineResult {
  extractedText: string;
  pageCount: number;
  chunks: number;
  claims: Claim[];
  sourceChanges: SourceChange[];
  databasesUsed: string[];
  seconds: number;
}

const DATABASES = ["Crossref", "OpenAlex"];
const uid = (): string => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Years after which a source counts as outdated, by domain. Null = age doesn't matter. */
const OUTDATED_AFTER: Record<Domain, number | null> = {
  Medical: 7,
  Geological: 12,
  "General research": 10,
  "Student assignment": 12,
  Historical: null,
  Legal: null,
};

type RefOutcome =
  | { kind: "found"; paper: PaperInfo; doiMistyped: boolean }
  | { kind: "missing_from_list" }
  | { kind: "not_found"; hadDoi: boolean }
  | { kind: "unreachable" };

const VERDICT_RANK: Record<Verdict, number> = {
  supported: 6,
  partly_supported: 5,
  unsupported: 3,
  contradicted: 2,
  not_found: 1,
  likely_fabricated: 0,
};

async function resolveReference(entry: ReferenceEntry | undefined): Promise<RefOutcome> {
  if (!entry) return { kind: "missing_from_list" };
  try {
    if (entry.doi) {
      const byDoi = await lookupDoi(entry.doi);
      if (byDoi) return { kind: "found", paper: byDoi, doiMistyped: false };
      const bySearch = await searchReference(entry.text);
      if (bySearch) return { kind: "found", paper: bySearch, doiMistyped: true };
      return { kind: "not_found", hadDoi: true };
    }
    const bySearch = await searchReference(entry.text);
    return bySearch ? { kind: "found", paper: bySearch, doiMistyped: false } : { kind: "not_found", hadDoi: false };
  } catch (_e) {
    return { kind: "unreachable" };
  }
}

function citationFor(p: PaperInfo): string {
  const authors = p.authors.length > 2 ? `${p.authors[0]} et al.` : p.authors.join(", ");
  return [authors, p.title, p.journal, p.year, p.doi ? `doi:${p.doi}` : null].filter(Boolean).join(". ");
}

export async function runPipeline(
  file: File,
  domain: Domain,
  documentId: string,
  onProgress: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const activity: ActivityItem[] = [];
  const log = (kind: ActivityItem["kind"], text: string, id = uid()) => activity.push({ id, kind, text });
  const progress: PipelineProgress = {
    stage: "extracting",
    percent: 3,
    eta_seconds: null,
    page_count: null,
    current_chunk: null,
    total_chunks: null,
    claims_checked: 0,
    total_claims: 0,
    issues_found: 0,
    activity,
  };
  const emit = () => onProgress({ ...progress, activity: [...activity] });
  emit();

  // 1. Extract text
  const extracted = await extractTextCached(file);
  const wordCount = extracted.pages.join(" ").split(/\s+/).filter(Boolean).length;
  if (wordCount < 20) {
    throw new Error(
      extracted.format === "pdf"
        ? "No readable text was found in this PDF. It may be a scanned image — try a PDF with selectable text."
        : "No readable text was found in this file.",
    );
  }
  const chunks = Math.max(1, Math.ceil(wordCount / 3000));
  progress.page_count = extracted.pageCount;
  progress.total_chunks = chunks;
  log("ok", `Extracted text from ${file.name} — ${extracted.pageCount} ${extracted.pageCount === 1 ? "page" : "pages"}, ${wordCount.toLocaleString()} words.`);
  progress.stage = "finding_citations";
  progress.percent = 12;
  emit();

  // 2. Find cited sentences and the reference list
  const prepared = prepareDocument(extracted.pages);
  const found = prepared.claims;
  progress.total_claims = found.length;
  if (!found.length) {
    log("issue", "No citation markers like [1] or (Smith, 2019) were found, so there are no claims to check.");
  } else {
    log("ok", `Found ${found.length} cited ${found.length === 1 ? "claim" : "claims"} and ${prepared.references.size} references.`);
    if (!prepared.hasReferenceList) log("issue", "No reference list was found. Claims can't be matched to papers.");
    if (prepared.truncated) log("issue", "Only the first 60 cited claims are checked in demo mode.");
  }
  progress.stage = "verifying";
  progress.percent = 20;
  emit();

  // 3. Look up every reference once (a few at a time, to be polite to the APIs)
  const neededKeys = [...new Set(found.flatMap((c) => c.refKeys))];
  const outcomes = new Map<string, RefOutcome>();
  const newer = new Map<string, PaperInfo | null>();
  const outdatedAfter = OUTDATED_AFTER[domain];
  const thisYear = new Date().getFullYear();
  let cursor = 0;
  const worker = async () => {
    while (cursor < neededKeys.length) {
      const key = neededKeys[cursor++]!;
      const outcome = await resolveReference(prepared.references.get(key));
      outcomes.set(key, outcome);
      if (outcome.kind === "found" && outdatedAfter !== null && outcome.paper.year && thisYear - outcome.paper.year > outdatedAfter) {
        newer.set(key, await findNewerPaper(outcome.paper).catch(() => null));
      }
      progress.percent = 20 + Math.round((outcomes.size / Math.max(1, neededKeys.length)) * 45);
      const perRef = (Date.now() - startedAt) / Math.max(1, outcomes.size);
      progress.eta_seconds = Math.ceil(((neededKeys.length - outcomes.size) * perRef) / 1000 / 3) + 2;
      emit();
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  if (neededKeys.length && [...outcomes.values()].every((o) => o.kind === "unreachable")) {
    log("issue", "Could not reach Crossref or OpenAlex. Check your internet connection and try again.");
  }

  // 4. Compare each claim with its source(s)
  const claims: Claim[] = [];
  const sourceChanges: SourceChange[] = [];
  found.forEach((f, i) => {
    const n = i + 1;
    progress.current_chunk = Math.min(chunks, 1 + Math.floor((i / Math.max(1, found.length)) * chunks));

    type Candidate = { key: string; entry?: ReferenceEntry; outcome: RefOutcome; judgement: Judgement; paper?: PaperInfo };
    const candidates: Candidate[] = f.refKeys.map((key) => {
      const entry = prepared.references.get(key);
      const outcome = outcomes.get(key) ?? { kind: "missing_from_list" as const };
      const paper = outcome.kind === "found" ? outcome.paper : undefined;
      return { key, entry, outcome, paper, judgement: judgeClaim(f.sentence, paper ? { title: paper.title, abstract: paper.abstract } : null) };
    });
    const pick = candidates.reduce((a, b) => (VERDICT_RANK[b.judgement.verdict] > VERDICT_RANK[a.judgement.verdict] ? b : a));
    const { entry, outcome, paper } = pick;
    let j: Judgement = pick.judgement;
    let fabrication: Claim["fabrication_detail"] = null;
    let signals = 0;

    if (outcome.kind === "missing_from_list") {
      j = {
        ...j,
        explanation: prepared.hasReferenceList
          ? `${f.marker} is not in the document's reference list.`
          : "The document has no reference list, so this citation can't be matched to a paper.",
        uncertainty_note: "Add the full reference so the claim can be checked.",
      };
    } else if (outcome.kind === "unreachable") {
      j = { ...j, explanation: "The citation databases could not be reached, so this claim was not checked.", uncertainty_note: "Check your internet connection and run the verification again." };
    } else if (outcome.kind === "not_found") {
      if (outcome.hadDoi) {
        j = {
          ...j,
          verdict: "likely_fabricated",
          explanation: "The DOI does not resolve, and no paper with this title was found in Crossref or OpenAlex.",
          uncertainty_note: "Check this reference by hand. It may be mistyped, very new, or not a real paper.",
        };
        fabrication = { doi_resolved: false, title_found: false, journal_found: null };
        signals = 2;
      } else {
        j = {
          ...j,
          explanation: "No matching paper was found in Crossref or OpenAlex.",
          uncertainty_note: "This does not mean the reference is fake. It may be a book, report or a paper that isn't indexed.",
        };
        fabrication = { doi_resolved: null, title_found: false, journal_found: null };
        signals = 1;
      }
    } else if (outcome.doiMistyped) {
      j = { ...j, uncertainty_note: `The DOI in the reference didn't resolve; the paper was found by its title instead (correct DOI: ${paper?.doi ?? "unknown"}). ${j.uncertainty_note ?? ""}`.trim() };
      fabrication = { doi_resolved: false, title_found: true, journal_found: true };
      signals = 1;
    }

    const outdated = !!(paper?.year && outdatedAfter !== null && thisYear - paper.year > outdatedAfter);
    const np = outdated ? newer.get(pick.key) ?? null : null;
    const newerPaper: NewerPaper | null = np
      ? {
          title: np.title,
          year: np.year ?? thisYear,
          doi: np.doi,
          finding: np.abstract ? np.abstract.split(/(?<=[.?!])\s+/)[0]!.slice(0, 260) : null,
          citation: citationFor(np),
        }
      : null;

    const claim: Claim = {
      id: uid(),
      document_id: documentId,
      claim_text: f.sentence,
      citation_id: f.marker,
      citation_full_reference: entry?.text ?? null,
      citation_doi: paper?.doi ?? entry?.doi ?? null,
      page_number: f.page,
      ...j,
      outdated,
      paper_year: paper?.year ?? entry?.year ?? null,
      newer_paper: newerPaper,
      user_override_verdict: null,
      user_override_reason: null,
      user_flagged: false,
      fabrication_signals_failed: signals,
      fabrication_detail: fabrication,
      databases_searched: DATABASES,
      source_used: paper?.database ?? null,
      raw_passage: paper ? paper.abstract ?? paper.title : null,
      created_at: new Date().toISOString(),
    };
    claims.push(claim);

    for (const u of paper?.updates ?? []) {
      sourceChanges.push({
        claim_id: claim.id,
        citation_id: f.marker,
        type: u.type,
        message:
          u.type === "retracted"
            ? `Source ${f.marker} was retracted${u.year ? ` in ${u.year}` : ""}.`
            : u.type === "corrected"
            ? `Source ${f.marker} has a published correction${u.year ? ` (${u.year})` : ""}.`
            : `Source ${f.marker} has an update: ${u.label === "new version" ? "a newer version was published" : u.label}${u.year ? ` (${u.year})` : ""}.`,
        doi: paper?.doi ?? undefined,
      });
    }

    let text = `Claim ${n} — ${paper ? `found in ${paper.database}` : "source not found"}. Verdict: ${VERDICTS[claim.verdict].label}.`;
    if (claim.verdict === "likely_fabricated") text = `Claim ${n} — DOI does not resolve and no matching paper exists. Flagged as possibly fabricated.`;
    else if (claim.date_conflict) text = `Claim ${n} — date conflict: document says ${claim.date_conflict.claimed_date}, source says ${claim.date_conflict.actual_date}.`;
    else if (outdated) text = `Claim ${n} — paper is from ${paper?.year}. ${newerPaper ? "Found newer research." : "No newer paper found."}`;
    log(isIssue(claim) ? "issue" : "ok", text, claim.id);

    progress.claims_checked = n;
    progress.issues_found = claims.filter(isIssue).length;
    progress.percent = 65 + Math.round((n / found.length) * 30);
  });
  emit();

  // 5. Build the report
  progress.stage = "building_report";
  progress.percent = 97;
  progress.eta_seconds = 1;
  log("working", "Building report and trust score…", "report");
  emit();

  return {
    extractedText: prepared.text,
    pageCount: extracted.pageCount,
    chunks,
    claims,
    sourceChanges,
    databasesUsed: DATABASES,
    seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
  };
}

/** Re-runs only the comparison step against the passage saved with the claim (no new lookup). */
export function rejudgeFromSaved(claim: Claim, newText: string): Judgement | null {
  if (!claim.raw_passage) return null;
  const titleOnly = claim.retrieval_quality === "Title only";
  return judgeClaim(newText, titleOnly ? { title: claim.raw_passage, abstract: null } : { title: "", abstract: claim.raw_passage });
}
