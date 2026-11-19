// Two layers:
//   data    → reads/writes Supabase tables directly (protected by RLS)
//   backend → routes to liveBrowser (in-browser execution + Supabase persistence)
//             or FastAPI server (if BACKEND_MODE="fastapi")
// In demo mode or guest mode, both are swapped for the in-browser simulation in mock.ts.

import { API_URL, BACKEND_MODE, DEMO_MODE, supabase } from "./config";
import { liveBrowser } from "./liveBrowser";
import { mockApi, mockData } from "./mock";
import type {
  ChatMessage,
  Claim,
  DocumentRecord,
  Domain,
  ExportFormat,
  JobStatus,
  SourceCheckResult,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const isGuestSession = (): boolean => {
  try {
    return Boolean(localStorage.getItem("truvify_guest_session"));
  } catch {
    return false;
  }
};

const isMock = (): boolean => DEMO_MODE || isGuestSession();

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase || isGuestSession()) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeader()), ...(init.headers as Record<string, string> | undefined) };
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the Truvify server. Check that the backend is running.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail || body.message || msg;
    } catch {
      /* not json */
    }
    if (res.status === 429) msg = "You've reached the limit of 10 verifications per hour. Please try again later.";
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

// ------------------------------------------------------------------ data
const db = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

export const data = {
  async listDocuments(): Promise<DocumentRecord[]> {
    if (isMock()) return mockData.listDocuments();
    const { data, error } = await db()
      .from("documents")
      .select("id,file_name,file_format,file_size,domain,page_count,claim_count,trust_score,flag,saved,status,created_at,source_changes,error")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as DocumentRecord[];
  },

  async getDocument(id: string): Promise<DocumentRecord | null> {
    if (isMock()) return mockData.getDocument(id);
    const { data, error } = await db().from("documents").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as DocumentRecord | null;
  },

  async getClaims(documentId: string): Promise<Claim[]> {
    if (isMock()) return mockData.getClaims(documentId);
    const { data, error } = await db()
      .from("claims")
      .select("*")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as Claim[];
  },

  async updateClaim(id: string, patch: Partial<Claim>): Promise<Claim> {
    if (isMock()) return mockData.updateClaim(id, patch);
    const { data, error } = await db().from("claims").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Claim;
  },

  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<DocumentRecord> {
    if (isMock()) return mockData.updateDocument(id, patch);
    const { data, error } = await db().from("documents").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as DocumentRecord;
  },

  async setSaved(id: string, saved: boolean) {
    if (isMock()) return mockData.setSaved(id, saved);
    const { error } = await db().from("documents").update({ saved }).eq("id", id);
    if (error) throw error;
  },

  async deleteDocument(id: string): Promise<void> {
    if (isMock()) return mockData.deleteDocument(id);
    const { error } = await db().from("documents").delete().eq("id", id);
    if (error) throw error;
  },

  async getOriginalFileUrl(doc: DocumentRecord): Promise<string | null> {
    if (isMock()) {
      const blob = await mockData.getOriginalFile(doc.id);
      if (!blob) return null;
      return URL.createObjectURL(blob);
    }
    if (!doc.storage_path) return null;
    const { data: res, error } = await supabase!.storage.from("documents").createSignedUrl(doc.storage_path, 600);
    if (error || !res?.signedUrl) return null;
    return res.signedUrl;
  },

  async listChatMessages(documentId: string): Promise<ChatMessage[]> {
    if (isMock()) return mockData.listChatMessages(documentId);
    const { data, error } = await db()
      .from("chat_messages")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []) as ChatMessage[];
  },

  async clearChat(documentId: string): Promise<void> {
    if (isMock()) return mockData.clearChat(documentId);
    const { error } = await db()
      .from("chat_messages")
      .delete()
      .eq("document_id", documentId);
    if (error) throw error;
  },
};

// ------------------------------------------------------------------ backend
export const backend = {
  /** Sends the file; backend reads the first 1000 words and returns a domain. */
  async detectDomain(file: File): Promise<Domain> {
    if (isMock()) return mockApi.detectDomain(file);
    if (BACKEND_MODE === "browser") return liveBrowser.detectDomain(file);
    const fd = new FormData();
    fd.append("file", file);
    const r = await request<{ domain: Domain }>("/api/detect-domain", { method: "POST", body: fd });
    return r.domain;
  },

  async startVerification(file: File, domain: Domain): Promise<{ job_id: string; document_id: string }> {
    if (isMock()) return mockApi.startVerification(file, domain);
    if (BACKEND_MODE === "browser") return liveBrowser.startVerification(file, domain);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("domain", domain);
    return request("/api/verify", { method: "POST", body: fd });
  },

  async getJob(jobId: string): Promise<JobStatus> {
    if (isMock()) return mockApi.getJob(jobId);
    if (BACKEND_MODE === "browser") return liveBrowser.getJob(jobId);
    return request(`/api/jobs/${encodeURIComponent(jobId)}`);
  },

  /** Re-runs only the comparison step for one claim (no new paper fetch). */
  async recheckClaim(claim: Claim): Promise<Claim> {
    if (isMock()) return mockApi.recheckClaim(claim);
    if (BACKEND_MODE === "browser") return liveBrowser.recheckClaim(claim);
    return request(`/api/claims/${claim.id}/recheck`, { method: "POST" });
  },

  async exportFile(documentId: string, format: ExportFormat): Promise<Blob> {
    if (isMock() || BACKEND_MODE === "browser") return liveBrowser.exportFile(documentId, format);
    return request(`/api/documents/${documentId}/export?format=${format}`);
  },

  async reverifyText(
    documentId: string,
    correctedText: string,
  ): Promise<{ document: DocumentRecord; claims: Claim[] }> {
    if (isMock()) return mockApi.reverifyText(documentId, correctedText);
    if (BACKEND_MODE === "browser") return liveBrowser.reverifyText(documentId, correctedText);
    return request(`/api/documents/${documentId}/reverify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_text: correctedText }),
    });
  },

  async sourceCheck(documentId: string): Promise<SourceCheckResult> {
    if (isMock()) return mockApi.sourceCheck(documentId);
    if (BACKEND_MODE === "browser") return liveBrowser.sourceCheck(documentId);
    return request(`/api/documents/${documentId}/source-check`);
  },

  async deleteAccount(): Promise<void> {
    if (isMock()) {
      mockData.reset();
      try {
        localStorage.removeItem("truvify_guest_session");
      } catch {
        /* ignore */
      }
      return;
    }
    if (BACKEND_MODE === "browser") return liveBrowser.deleteAccount();
    return request("/api/account", { method: "DELETE" });
  },

  async reportChat(documentId: string, message: string): Promise<{ reply: string; created_at: string }> {
    if (isMock()) return mockApi.reportChat(documentId, message);
    if (BACKEND_MODE === "browser") return liveBrowser.reportChat(documentId, message);
    return request(`/api/documents/${documentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  },
};
