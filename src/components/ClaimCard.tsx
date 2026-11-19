import { useState } from "react";
import { useToast } from "../context/ToastContext";
import { backend, data } from "../lib/api";
import { checkTone } from "../lib/toneCheck";
import type { Claim, Verdict } from "../lib/types";
import { effectiveVerdict, needsReview, VERDICT_ORDER, VERDICTS } from "../lib/verdicts";
import { MoreDisclosure, VerdictBadge } from "./Common";
import { Alert, Calendar, Check, Clock, Copy, Flag, Pencil, Refresh, Search, Sparkles, Spinner, X } from "./Icons";
import { SideBySide } from "./SideBySide";
import { InteractiveCard, InteractiveCardLink } from "./InteractiveCard";

interface Props {
  claim: Claim;
  index: number;
  threshold: number;
  pulse: boolean;
  edited?: boolean;
  onChange(c: Claim): void;
  onAutoCorrect?(c: Claim): Promise<void> | void;
}

const doiUrl = (doi?: string | null) => (doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : null);

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-3 text-[12px] leading-relaxed">
      <span className="w-32 shrink-0 text-neutral-400">{label}</span>
      <span className="text-neutral-700">{value || "—"}</span>
    </div>
  );
}

function Signal({ ok, label }: { ok: boolean | null | undefined; label: string }) {
  if (ok === null || ok === undefined)
    return (
      <li className="flex items-center gap-2 text-[13px] text-neutral-400">
        <span className="w-4 h-4 rounded-full border border-neutral-300" /> {label} — not checked
      </li>
    );
  return (
    <li className={`flex items-center gap-2 text-[13px] ${ok ? "text-neutral-600" : "text-red-700"}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
        {ok ? <Check size={10} /> : <X size={10} />}
      </span>
      {label}
    </li>
  );
}

export default function ClaimCard({ claim: c, index, threshold, pulse, edited, onChange, onAutoCorrect }: Props) {
  const toast = useToast();
  const v = effectiveVerdict(c);
  const review = needsReview(c, threshold);
  const [editing, setEditing] = useState(false);
  const [ovVerdict, setOvVerdict] = useState<Verdict>(c.user_override_verdict ?? c.verdict);
  const [ovReason, setOvReason] = useState(c.user_override_reason ?? "");
  const [busy, setBusy] = useState<"" | "save" | "recheck" | "flag" | "autocorrect">("");

  const suggestedFix =
    c.suggested_fix ||
    (c.date_conflict
      ? c.claim_text.replace(c.date_conflict.claimed_date, c.date_conflict.actual_date)
      : null);

  const handleAutoCorrect = async () => {
    if (!onAutoCorrect) return;
    setBusy("autocorrect");
    try {
      await onAutoCorrect(c);
    } finally {
      setBusy("");
    }
  };

  const special =
    v === "likely_fabricated" ? "border-l-red-600" :
    v === "not_found" ? "border-l-neutral-400" :
    c.outdated || c.date_conflict ? "border-l-amber-500" : VERDICTS[v].border;
  // Same colours as the old left border, drawn as an accent bar so the card's hover border doesn't grey it out.
  const ACCENT_BG: Record<string, string> = {
    "border-l-emerald-500": "bg-emerald-500",
    "border-l-amber-500": "bg-amber-500",
    "border-l-orange-500": "bg-orange-500",
    "border-l-red-500": "bg-red-500",
    "border-l-red-600": "bg-red-600",
    "border-l-neutral-400": "bg-neutral-400",
  };
  const accent = ACCENT_BG[special] ?? "bg-neutral-400";

  const saveOverride = async () => {
    if (!ovReason.trim()) return toast("Please add a reason for the override.", "error");
    setBusy("save");
    try {
      const updated = await data.updateClaim(c.id, { user_override_verdict: ovVerdict, user_override_reason: ovReason.trim() });
      onChange(updated);
      setEditing(false);
      toast("Verdict updated.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const clearOverride = async () => {
    setBusy("save");
    try {
      onChange(await data.updateClaim(c.id, { user_override_verdict: null, user_override_reason: null }));
      setOvVerdict(c.verdict);
      setOvReason("");
      setEditing(false);
    } finally {
      setBusy("");
    }
  };

  const recheck = async () => {
    setBusy("recheck");
    try {
      onChange(await backend.recheckClaim(c));
      toast("Claim rechecked.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const toggleFlag = async () => {
    setBusy("flag");
    try {
      onChange(await data.updateClaim(c.id, { user_flagged: !c.user_flagged }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const copyCitation = async () => {
    const text = c.newer_paper?.citation || `${c.newer_paper?.title} (${c.newer_paper?.year})${c.newer_paper?.doi ? ` doi:${c.newer_paper.doi}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Updated citation copied.", "success");
    } catch {
      toast("Could not copy to clipboard.", "error");
    }
  };

  const fd = c.fabrication_detail ?? {};
  const doiLink = doiUrl(c.citation_doi);
  const tone = checkTone(c.claim_text, c.evidence_quote);
  const [toneExpanded, setToneExpanded] = useState(false);

  return (
    <InteractiveCard
      id={`claim-${c.id}`}
      accentClassName={accent}
      wrapperClassName="scroll-mt-24"
      className={pulse ? "animate-pulsering" : ""}
    >
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={v} />
          {edited && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 text-[11px] font-medium">
              Edited
            </span>
          )}
          {c.user_override_verdict && (
            <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-medium">User reviewed</span>
          )}
          {review && v !== "supported" && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-900 text-white text-[11px] font-medium">Needs human review</span>
          )}
          <span className="font-mono text-[11px] text-neutral-400">
            Claim {index + 1}
            {c.page_number ? ` · p.${c.page_number}` : ""}
          </span>
          {c.user_flagged && (
            <span className="ml-auto inline-flex items-center gap-1 text-orange-600 text-[11px] font-medium">
              <Flag size={13} /> Flagged
            </span>
          )}
        </div>

        {/* Claim */}
        <p className="mt-3 text-[15px] leading-relaxed text-primary font-medium">{c.claim_text}</p>

        {/* Tone warning pill */}
        {tone.level === "warn" && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setToneExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-medium hover:bg-amber-100 transition-colors cursor-pointer select-none"
              title="Click to view tone analysis"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Tone: stronger than the source
              <span className="text-[10px] text-amber-700 ml-0.5">{toneExpanded ? "▲" : "▼"}</span>
            </button>
            {toneExpanded && (
              <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[12px] text-amber-900 leading-relaxed animate-in fade-in duration-150">
                {tone.message}
              </div>
            )}
          </div>
        )}

        {/* Citation row */}
        <div className="mt-3 flex items-start gap-2 text-[12px] text-neutral-500">
          <span className="font-mono text-[11px] text-primary bg-neutral-100 rounded px-1.5 py-0.5 shrink-0">{c.citation_id ?? "—"}</span>
          <span className="leading-relaxed">
            {c.citation_full_reference ?? "No reference text found."}
            {doiLink && (
              <InteractiveCardLink href={doiLink} target="_blank" rel="noreferrer" className="ml-1.5 gap-0.5 text-[12px] underline-offset-2">
                DOI
              </InteractiveCardLink>
            )}
          </span>
        </div>
        {c.user_override_verdict && (
          <p className="mt-2 text-[12px] text-neutral-500">
            Agent verdict: <span className="font-medium">{VERDICTS[c.verdict].label}</span> · Reason for override: {c.user_override_reason}
          </p>
        )}

        {/* Special states */}
        {v === "likely_fabricated" && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-red-700">
              <Alert size={15} /> {c.fabrication_signals_failed} of {[fd.doi_resolved, fd.journal_found, fd.title_found, fd.authors_found].filter((x) => x !== null && x !== undefined).length || 3} checks failed
            </p>
            <ul className="mt-3 space-y-1.5">
              <Signal ok={fd.doi_resolved} label="DOI resolves to a real record" />
              <Signal ok={fd.journal_found} label="Journal is a known, indexed journal" />
              <Signal ok={fd.title_found} label="Paper title matches a database record" />
              {fd.authors_found !== undefined && <Signal ok={fd.authors_found} label="Authors match a database record" />}
            </ul>
            <p className="mt-3 text-[12px] text-red-700/90">This may be an AI-hallucinated or mistyped reference. Manual check required.</p>
          </div>
        )}

        {v === "not_found" && (
          <div className="mt-4 rounded-xl border border-hairline bg-neutral-50 p-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-neutral-700">
              <Search size={14} /> Searched: {(c.databases_searched ?? ["Crossref", "Semantic Scholar", "OpenAlex", "SciFact"]).join(", ")}
            </p>
            <p className="mt-2 text-[12px] text-neutral-500">
              This does not mean the reference is fake. It may be a minor publication or not yet indexed.
            </p>
          </div>
        )}

        {c.outdated && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-800">
              <Clock size={14} /> Outdated research — source is from {c.paper_year ?? "over 7 years ago"}
            </p>
            {c.newer_paper ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                <p className="eyebrow text-emerald-700">Newer research · {c.newer_paper.year}</p>
                <p className="text-[13px] font-medium text-primary mt-1">{c.newer_paper.title}</p>
                {c.newer_paper.finding && <p className="text-[12px] text-neutral-600 mt-1 leading-relaxed">{c.newer_paper.finding}</p>}
                <div className="mt-2.5 flex items-center gap-3">
                  {c.newer_paper.doi && (
                    <InteractiveCardLink href={doiUrl(c.newer_paper.doi)!} target="_blank" rel="noreferrer" className="gap-1 text-[12px] text-emerald-800">
                      Open DOI
                    </InteractiveCardLink>
                  )}
                  <button onClick={copyCitation} className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-800 hover:underline">
                    <Copy size={12} /> Copy updated citation
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-amber-800/80">No newer paper on this topic was found.</p>
            )}
          </div>
        )}

        {c.date_conflict && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-800">
              <Calendar size={14} /> Date conflict
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 max-w-sm">
              <div>
                <p className="text-[11px] text-neutral-500">Document says</p>
                <p className="font-mono text-[15px] text-red-600 line-through decoration-red-300">{c.date_conflict.claimed_date}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">Source says</p>
                <p className="font-mono text-[15px] text-emerald-700 font-semibold">{c.date_conflict.actual_date}</p>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-neutral-600">{c.date_conflict.source}</p>
          </div>
        )}

        {/* Evidence */}
        {v !== "likely_fabricated" && (
          <blockquote className={`mt-4 border-l-[3px] ${VERDICTS[v].border} bg-neutral-50 rounded-r-lg px-4 py-3 text-[13px] leading-relaxed text-neutral-700`}>
            {c.evidence_quote ? <>"{c.evidence_quote}"</> : <span className="text-neutral-400">No direct evidence found in the available text.</span>}
          </blockquote>
        )}

        {c.explanation && <p className="mt-3 text-[13px] text-neutral-700 leading-relaxed">{c.explanation}</p>}

        {/* Suggested correction card */}
        {suggestedFix && (
          <div
            className={`mt-4 rounded-xl border p-4 transition-all ${
              v === "supported"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-emerald-300 bg-emerald-50/70"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-900">
                <Sparkles size={14} className="text-emerald-600" />
                <span>Suggested correction (based on the source)</span>
              </div>
              {v === "supported" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium border border-emerald-200">
                  <Check size={12} /> Correction applied
                </span>
              ) : (
                onAutoCorrect && (
                  <button
                    type="button"
                    onClick={handleAutoCorrect}
                    disabled={busy === "autocorrect"}
                    className="btn-primary h-7 px-3 text-[11px] inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer font-medium"
                  >
                    {busy === "autocorrect" ? <Spinner size={12} /> : <Check size={12} />}
                    Auto-correct claim
                  </button>
                )
              )}
            </div>
            <p className="text-[13px] text-emerald-950 font-medium leading-relaxed bg-white/95 p-3 rounded-lg border border-emerald-200/60 shadow-2xs">
              {suggestedFix}
            </p>
            {v !== "supported" && (
              <p className="mt-2 text-[11px] text-emerald-800/80 leading-relaxed">
                Click <span className="font-semibold text-emerald-950">Auto-correct claim</span> to update this statement to match the source paper and increase the report Trust Score.
              </p>
            )}
          </div>
        )}

        {/* Confidence — three separate lines, never a single number */}
        <div className="mt-4 rounded-xl border border-hairline p-3.5 space-y-1.5">
          <div className="flex items-center gap-3 text-[12px]">
            <span className="w-32 shrink-0 text-neutral-400">Evidence strength</span>
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-3 h-1.5 rounded-sm ${
                      i < (c.evidence_strength === "High" ? 3 : c.evidence_strength === "Medium" ? 2 : c.evidence_strength === "Low" ? 1 : 0) ? "bg-primary" : "bg-neutral-200"
                    }`}
                  />
                ))}
              </span>
              {c.evidence_strength ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="w-32 shrink-0 text-neutral-400">Source used</span>
            <span className="font-medium text-primary">{c.retrieval_quality ?? "—"}</span>
          </div>
          <div className="flex gap-3 text-[12px]">
            <span className="w-32 shrink-0 text-neutral-400">Uncertainty</span>
            <span className="text-neutral-600 leading-relaxed">{c.uncertainty_note ?? "—"}</span>
          </div>
        </div>

        {/* More */}
        <div className="mt-4">
          <MoreDisclosure>
            <div className="rounded-xl bg-neutral-50 border border-hairline p-4 space-y-1.5">
              <Line label="Full citation" value={c.citation_full_reference} />
              <Line label="DOI" value={c.citation_doi} />
              <Line
                label="DOI resolution"
                value={fd.doi_resolved === false ? "Did not resolve" : c.citation_doi ? "Resolved" : "No DOI given"}
              />
              <Line label="Databases searched" value={(c.databases_searched ?? []).join(", ")} />
              <Line label="Matched in" value={c.source_used} />
              <Line label="Paper year" value={c.paper_year ? String(c.paper_year) : null} />

              {/* Side by side */}
              <div className="pt-2 pb-1 border-t border-hairline">
                <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-1">
                  Side by side
                </span>
                {c.claim_text && c.evidence_quote ? (
                  <SideBySide claimText={c.claim_text} sourceText={c.evidence_quote} />
                ) : (
                  <p className="text-[12px] text-neutral-400 italic">No source sentence to compare.</p>
                )}
              </div>

              <Line label="Raw passage used" value={c.raw_passage ?? c.evidence_quote} />
            </div>
          </MoreDisclosure>
        </div>
      </div>

      {/* Override form */}
      {editing && (
        <div className="px-5 sm:px-6 py-4 border-t border-hairline bg-neutral-50/70 reveal">
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
            <div>
              <label className="label">Your verdict</label>
              <select value={ovVerdict} onChange={(e) => setOvVerdict(e.target.value as Verdict)} className="input h-10 text-[13px]">
                {VERDICT_ORDER.map((x) => (
                  <option key={x} value={x}>
                    {VERDICTS[x].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reason</label>
              <input
                value={ovReason}
                onChange={(e) => setOvReason(e.target.value)}
                className="input h-10 text-[13px]"
                placeholder="e.g. Checked the full text — table 2 supports this claim."
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={saveOverride} disabled={busy === "save"} className="btn-primary h-8 px-4 text-[12px]">
              {busy === "save" && <Spinner size={12} />} Save
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost h-8 px-3 text-[12px]">Cancel</button>
            {c.user_override_verdict && (
              <button onClick={clearOverride} className="ml-auto btn-ghost h-8 px-3 text-[12px] text-red-600 hover:text-red-700">
                Restore agent verdict
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="no-print px-5 sm:px-6 py-3 border-t border-hairline flex flex-wrap items-center gap-1">
        {suggestedFix && v !== "supported" && onAutoCorrect && (
          <button
            type="button"
            onClick={handleAutoCorrect}
            disabled={busy === "autocorrect"}
            className="btn-ghost h-8 px-3 text-[12px] text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            {busy === "autocorrect" ? <Spinner size={13} /> : <Sparkles size={13} />} Auto-correct
          </button>
        )}
        <button onClick={() => setEditing((e) => !e)} className="btn-ghost h-8 px-3 text-[12px]">
          <Pencil size={13} /> Override verdict
        </button>
        <button onClick={recheck} disabled={busy === "recheck"} className="btn-ghost h-8 px-3 text-[12px]">
          {busy === "recheck" ? <Spinner size={13} /> : <Refresh size={13} />} Recheck
        </button>
        <button
          onClick={toggleFlag}
          disabled={busy === "flag"}
          className={`btn-ghost h-8 px-3 text-[12px] ${c.user_flagged ? "text-orange-600 hover:text-orange-700" : ""}`}
        >
          <Flag size={13} /> {c.user_flagged ? "Unflag" : "Flag"}
        </button>
      </div>
    </InteractiveCard>
  );
}
