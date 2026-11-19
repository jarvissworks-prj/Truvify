import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8000").replace(/\/$/, "");

export type BackendMode = "browser" | "fastapi";
export const BACKEND_MODE: BackendMode =
  (import.meta.env.VITE_BACKEND_MODE as BackendMode | undefined) || "browser";

/** Demo mode runs the whole app in the browser with sample data — no Supabase, no backend. */
export const DEMO_MODE =
  import.meta.env.VITE_DEMO_MODE === "true" || !url || !anonKey;

export const supabase: SupabaseClient | null = DEMO_MODE
  ? null
  : createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_EXT = ["pdf", "docx", "xlsx", "pptx"] as const;
export const ACCEPT_ATTR =
  ".pdf,.docx,.xlsx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const DATABASES = ["Crossref", "Semantic Scholar", "OpenAlex", "SciFact"];
export const POLL_MS = 2000;
