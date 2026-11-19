import { supabase } from "./config";
import { detectDomainFromText } from "./analysis/citations";
import { extractTextCached } from "./analysis/extract";
import { rejudgeFromSaved, runPipeline, type PipelineProgress } from "./analysis/pipeline";
import { flagFor, trustScore } from "./verdicts";
import type {
  ActivityItem,
  Claim,
  DocumentRecord,
  Domain,
  ExportFormat,
  JobStatus,
  SourceChange,
  SourceCheckResult,
} from "./types";

interface LiveJobRecord {
  started: number;
  document_id: string;
  file_name: string;
  file_size: number;
  domain: Domain;
  progress?: PipelineProgress;
}

const jobMap = new Map<string, LiveJobRecord>();

export const liveBrowser = {
  /** Detect domain by reading first 1000 words in browser */
  async detectDomain(file: File): Promise<Domain> {
    try {
      const doc = await extractTextCached(file);
      return detectDomainFromText(doc.pages.join(" "));
    } catch {
      return "General research";
    }
  },

  /** Start in-browser verification and persist directly to Supabase */
  async startVerification(file: File, domain: Domain): Promise<{ job_id: string; document_id: string }> {
    if (!supabase) throw new Error("Supabase is not configured.");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You must be logged in to verify documents.");
    }

    // Rate limit check: 10 verifications per hour
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);

    if (count !== null && count >= 10) {
      throw new Error("You've reached the limit of 10 verifications per hour. Please try again later.");
    }

    const document_id = crypto.randomUUID();
    const job_id = document_id;
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const storagePath = `${user.id}/${document_id}/${file.name}`;

    // 1. Insert initial documents row with status='processing'
    const { error: insertError } = await supabase.from("documents").insert({
      id: document_id,
      user_id: user.id,
      file_name: file.name,
      file_format: ext,
      file_size: file.size,
      domain,
      status: "processing",
      saved: false,
      storage_path: storagePath,
    });
    if (insertError) throw insertError;

    // 2. Upload file to Supabase storage bucket `documents`
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, { upsert: true });
    if (uploadError) {
      console.warn("Storage upload warning:", uploadError.message);
    }

    // 3. Register in memory
    jobMap.set(job_id, {
      started: Date.now(),
      document_id,
      file_name: file.name,
      file_size: file.size,
      domain,
      progress: {
        stage: "extracting",
        percent: 5,
        eta_seconds: null,
        page_count: null,
        current_chunk: null,
        total_chunks: null,
        claims_checked: 0,
        total_claims: 0,
        issues_found: 0,
        activity: [{ id: "start", kind: "working", text: "Reading document text…" }],
      },
    });

    // 4. Run pipeline in background without awaiting
    runPipeline(file, domain, document_id, (p) => {
      const j = jobMap.get(job_id);
      if (j) j.progress = p;
    })
      .then(async (result) => {
        const claimsToInsert = result.claims.map((c) => ({
          ...c,
          user_id: user.id,
          document_id,
        }));

        if (claimsToInsert.length > 0) {
          const { error: claimsError } = await supabase!.from("claims").insert(claimsToInsert);
          if (claimsError) throw claimsError;
        }

        const score = result.claims.length ? trustScore(result.claims) : null;
        const flag = score === null ? null : flagFor(score);

        const { error: docUpdateError } = await supabase!
          .from("documents")
          .update({
            status: "done",
            trust_score: score,
            flag: flag,
            claim_count: result.claims.length,
            page_count: result.pageCount,
            chunks_processed: result.chunks,
            databases_used: result.databasesUsed,
            time_taken_seconds: result.seconds,
            extracted_text: result.extractedText,
            source_changes: result.sourceChanges,
          })
          .eq("id", document_id);

        if (docUpdateError) throw docUpdateError;

        const j = jobMap.get(job_id);
        if (j?.progress) {
          j.progress = {
            ...j.progress,
            stage: "done",
            percent: 100,
            eta_seconds: 0,
            activity: j.progress.activity
              .filter((a) => a.id !== "report")
              .concat({ id: "done", kind: "ok", text: "Report ready." }),
          };
        }
      })
      .catch(async (err: Error) => {
        console.error("Verification pipeline error:", err);
        await supabase!
          .from("documents")
          .update({
            status: "failed",
            error: err.message || "Verification failed.",
          })
          .eq("id", document_id);

        const j = jobMap.get(job_id);
        if (j) {
          j.progress = {
            ...(j.progress ?? {
              percent: 0,
              eta_seconds: null,
              page_count: null,
              current_chunk: null,
              total_chunks: null,
              claims_checked: 0,
              total_claims: 0,
              issues_found: 0,
              activity: [],
            }),
            stage: "failed",
            error: err.message || "Verification failed. Please try again.",
          };
        }
      });

    return { job_id, document_id };
  },

  /** Get job progress */
  async getJob(jobId: string): Promise<JobStatus> {
    const job = jobMap.get(jobId);
    if (job) {
      let p = job.progress;
      p ??= {
        stage: "extracting",
        percent: 0,
        eta_seconds: null,
        page_count: null,
        current_chunk: null,
        total_chunks: null,
        claims_checked: 0,
        total_claims: 0,
        issues_found: 0,
        activity: [],
      };
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
    }

    if (!supabase) throw new Error("Supabase is not configured.");

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !doc) throw new Error("Job not found.");

    if (doc.status === "done") {
      return {
        job_id: jobId,
        document_id: doc.id,
        file_name: doc.file_name,
        page_count: doc.page_count,
        domain: doc.domain,
        stage: "done",
        percent: 100,
        eta_seconds: 0,
        current_chunk: doc.chunks_processed ?? 1,
        total_chunks: doc.chunks_processed ?? 1,
        claims_checked: doc.claim_count ?? 0,
        total_claims: doc.claim_count ?? 0,
        issues_found: 0,
        activity: [{ id: "done", kind: "ok", text: "Report ready." }],
        error: null,
      };
    }

    if (doc.status === "processing") {
      const errorMsg =
        "This verification was interrupted because the page was reloaded or closed. Please upload the file again.";
      await supabase.from("documents").update({ status: "failed", error: errorMsg }).eq("id", jobId);
      return {
        job_id: jobId,
        document_id: doc.id,
        file_name: doc.file_name,
        page_count: doc.page_count,
        domain: doc.domain,
        stage: "failed",
        percent: 0,
        eta_seconds: null,
        current_chunk: null,
        total_chunks: null,
        claims_checked: 0,
        total_claims: 0,
        issues_found: 0,
        activity: [],
        error: errorMsg,
      };
    }

    return {
      job_id: jobId,
      document_id: doc.id,
      file_name: doc.file_name,
      page_count: doc.page_count,
      domain: doc.domain,
      stage: "failed",
      percent: 0,
      eta_seconds: null,
      current_chunk: null,
      total_chunks: null,
      claims_checked: 0,
      total_claims: 0,
      issues_found: 0,
      activity: [],
      error: doc.error || "Verification failed. Please try again.",
    };
  },

  /** Recheck a claim against the saved source passage */
  async recheckClaim(claim: Claim): Promise<Claim> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const j = rejudgeFromSaved(claim, claim.claim_text);
    const patch = j
      ? {
          ...j,
          uncertainty_note: `${j.uncertainty_note ?? ""} (Rechecked ${new Date().toLocaleTimeString()})`.trim(),
        }
      : {
          uncertainty_note:
            (claim.uncertainty_note ?? "").replace(/ \(Rechecked.*\)$/, "") +
            ` (Rechecked ${new Date().toLocaleTimeString()})`,
        };

    const { data: updated, error } = await supabase
      .from("claims")
      .update(patch)
      .eq("id", claim.id)
      .select("*")
      .single();

    if (error) throw error;
    return updated as Claim;
  },

  /** Re-verify document with edited text */
  async reverifyText(
    documentId: string,
    correctedText: string,
  ): Promise<{ document: DocumentRecord; claims: Claim[] }> {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found.");

    const { data: claims, error: claimsErr } = await supabase
      .from("claims")
      .select("*")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (claimsErr || !claims) throw new Error("Failed to load claims.");

    const updatedClaims: Claim[] = [];
    const removedClaimIds: string[] = [];

    const sentences = correctedText
      .split(/(?<=[.?!])\s+|\n+/)
      .map((str) => str.trim())
      .filter(Boolean);

    const normText = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const c of claims as Claim[]) {
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

        const { error: updErr } = await supabase.from("claims").update(c).eq("id", c.id);
        if (updErr) throw updErr;

        updatedClaims.push(c);
        continue;
      }

      const marker = c.citation_id;
      let newSentence = marker ? sentences.find((str) => str.includes(marker)) : undefined;

      if (!newSentence && origSentence.length > 20) {
        const words = origSentence.split(/\s+/).slice(0, 4).join(" ");
        newSentence = sentences.find((str) => str.includes(words));
      }

      if (!newSentence) {
        removedClaimIds.push(c.id);
        continue;
      }

      c.claim_text = newSentence;
      const j = rejudgeFromSaved(c, newSentence);
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

      const { error: updErr } = await supabase.from("claims").update(c).eq("id", c.id);
      if (updErr) throw updErr;

      updatedClaims.push(c);
    }

    if (removedClaimIds.length > 0) {
      const { error: delErr } = await supabase.from("claims").delete().in("id", removedClaimIds);
      if (delErr) throw delErr;
    }

    const score = updatedClaims.length ? trustScore(updatedClaims) : null;
    const flag = score === null ? null : flagFor(score);

    const { data: updatedDoc, error: docUpdErr } = await supabase
      .from("documents")
      .update({
        corrected_text: correctedText,
        claim_count: updatedClaims.length,
        trust_score: score,
        flag: flag,
      })
      .eq("id", documentId)
      .select("*")
      .single();

    if (docUpdErr) throw docUpdErr;

    return { document: updatedDoc as DocumentRecord, claims: updatedClaims };
  },

  /** Check for retraction/correction notices */
  async sourceCheck(documentId: string): Promise<SourceCheckResult> {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data: doc } = await supabase
      .from("documents")
      .select("source_changes")
      .eq("id", documentId)
      .single();

    const changes = (doc?.source_changes as SourceChange[]) || [];

    const { data: claims } = await supabase
      .from("claims")
      .select("id")
      .eq("document_id", documentId);

    const validIds = new Set((claims || []).map((c) => c.id));
    const filtered = changes.filter((ch) => validIds.has(ch.claim_id));

    return {
      checked_at: new Date().toISOString(),
      changes: filtered,
    };
  },

  /** In browser mode, PDF & DOCX exports are built client-side in src/lib/export.ts */
  async exportFile(_documentId: string, _format: ExportFormat): Promise<Blob> {
    throw new Error("exportFile is handled client-side in browser mode.");
  },

  /** Delete account via Supabase Edge Function */
  async deleteAccount(): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) throw error;
    await supabase.auth.signOut();
  },

  /** Chat about report via Supabase Edge Function with Gemini */
  async reportChat(documentId: string, message: string): Promise<{ reply: string; created_at: string }> {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.functions.invoke("report-chat", {
      body: { document_id: documentId, message },
    });

    if (error) {
      let msg = error.message;
      if (error.context?.status === 401) {
        msg = "Your session expired. Please log in again.";
      } else if (error.context?.status === 429) {
        msg = "You have reached the limit of 30 messages per hour. Please try again later.";
      }
      throw new Error(msg);
    }

    return data as { reply: string; created_at: string };
  },
};
