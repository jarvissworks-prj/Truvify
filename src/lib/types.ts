// Shared types. Field names match the Supabase tables and the
// Gemini agent's JSON output so the backend can pass data straight through.

export type Verdict =
  | "supported"
  | "partly_supported"
  | "unsupported"
  | "contradicted"
  | "not_found"
  | "likely_fabricated";

export type Domain =
  | "Medical"
  | "Historical"
  | "Geological"
  | "Student assignment"
  | "Legal"
  | "General research";

export type Flag = "green" | "amber" | "red";
export type ExportFormat = "pdf" | "docx" | "xlsx" | "pptx";
export type EvidenceStrength = "High" | "Medium" | "Low";
export type RetrievalQuality = "Full text" | "Abstract only" | "Title only" | "Not retrievable";

export interface DateConflict {
  claimed_date: string;
  actual_date: string;
  source: string;
}

export interface NewerPaper {
  title: string;
  year: number;
  doi?: string | null;
  finding?: string | null;
  citation?: string | null; // formatted citation for "Copy updated citation"
}

export interface FabricationDetail {
  doi_resolved?: boolean | null;
  journal_found?: boolean | null;
  title_found?: boolean | null;
  authors_found?: boolean | null;
  notes?: string[];
}

export interface Claim {
  id: string;
  document_id: string;
  user_id?: string;
  claim_text: string;
  citation_id: string | null; // marker as written, e.g. "[3]" or "(Smith, 2019)"
  citation_full_reference: string | null;
  citation_doi?: string | null;
  page_number: number | null;
  verdict: Verdict;
  evidence_quote: string | null;
  explanation: string | null;
  evidence_strength: EvidenceStrength | null;
  retrieval_quality: RetrievalQuality | null;
  uncertainty_note: string | null;
  date_conflict: DateConflict | null;
  outdated: boolean;
  paper_year?: number | null;
  newer_paper: NewerPaper | null;
  needs_human_review: boolean;
  user_override_verdict: Verdict | null;
  user_override_reason: string | null;
  user_flagged: boolean;
  fabrication_signals_failed: number;
  fabrication_detail: FabricationDetail | null;
  suggested_fix?: string | null;
  databases_searched?: string[] | null;
  source_used?: string | null;
  raw_passage?: string | null;
  created_at?: string;
}

export interface DocumentRecord {
  id: string;
  user_id?: string;
  file_name: string;
  file_format: string | null;
  file_size: number | null;
  domain: Domain | null;
  page_count: number | null;
  claim_count: number | null;
  trust_score: number | null;
  flag: Flag | null;
  saved: boolean;
  chunks_processed?: number | null;
  databases_used?: string[] | null;
  time_taken_seconds?: number | null;
  extracted_text?: string | null;
  corrected_text?: string | null;
  storage_path?: string | null;
  status?: "processing" | "done" | "failed";
  source_changes?: SourceChange[] | null;
  error?: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  document_id: string;
  user_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ActivityItem {
  id: string;
  kind: "ok" | "issue" | "working";
  text: string;
}

export interface SourceChange {
  claim_id: string;
  citation_id: string;
  type: "retracted" | "corrected" | "updated";
  message: string;
  doi?: string;
}

export interface SourceCheckResult {
  checked_at: string;
  changes: SourceChange[];
}

export type JobStage = "extracting" | "finding_citations" | "verifying" | "building_report" | "done" | "failed";

export interface JobStatus {
  job_id: string;
  document_id: string;
  file_name: string;
  page_count: number | null;
  domain: Domain | null;
  stage: JobStage;
  percent: number;
  eta_seconds: number | null;
  current_chunk: number | null;
  total_chunks: number | null;
  claims_checked: number;
  total_claims: number;
  issues_found: number;
  activity: ActivityItem[];
  error?: string | null;
}

export interface UserSettings {
  confidence_threshold: number; // 0-100
  default_domain: Domain | null;
  default_export: ExportFormat;
}

export const DOMAINS: Domain[] = [
  "Medical",
  "Historical",
  "Geological",
  "Student assignment",
  "Legal",
  "General research",
];
