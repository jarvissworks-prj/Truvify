import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ClaimCard from "../components/ClaimCard";
import ReportChat from "../components/ReportChat";
import { ScrollReveal } from "../components/ScrollReveal";
import { Modal, MoreDisclosure, PageShell, VerdictBadge, formatBytes, formatDate } from "../components/Common";
import { Alert, ArrowLeft, Download, Highlighter, Layers, Pencil, Sparkles, Spinner, X } from "../components/Icons";
import { Layout } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { backend, data } from "../lib/api";
import { DISCLAIMER } from "../lib/disclaimer";
import type * as ExportLib from "../lib/export";
import { checkTone } from "../lib/toneCheck";
import type { Claim, DocumentRecord, ExportFormat, SourceCheckResult, Verdict } from "../lib/types";
import { effectiveVerdict, flagFor, FLAG_META, highlightClass, trustScore, VERDICT_ORDER, VERDICTS } from "../lib/verdicts";

// The export libraries (docx, jsPDF, pptxgenjs, SheetJS) are large, so they are
// loaded separately. ResultsPage starts loading them as soon as it opens, so they
// are ready by the time someone clicks a download button.
const loadExport = () => import("../lib/export");
const exportReport = async (...args: Parameters<typeof ExportLib.exportReport>) =>
  (await loadExport()).exportReport(...args);
const downloadCorrectedDocument = async (...args: Parameters<typeof ExportLib.downloadCorrectedDocument>) =>
  (await loadExport()).downloadCorrectedDocument(...args);

const FORMAT_CONFIG: { id: ExportFormat; label: string }[] = [
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "Word" },
  { id: "xlsx", label: "Excel" },
  { id: "pptx", label: "PowerPoint" },
];

// ------------------------------------------------------------ highlight view
interface HighlightViewProps {
  doc: DocumentRecord;
  claims: Claim[];
  workingText: string;
  viewMode: "original" | "corrected";
  isEditing: boolean;
  reverifying: boolean;
  hasEdits: boolean;
  hasUnsavedEdits: boolean;
  editedCount: number;
  correctableCount?: number;
  onPick(id: string): void;
  onViewModeChange(mode: "original" | "corrected"): void;
  onStartEditing(claimSentence?: string): void;
  onDoneEditing(): void;
  onDiscardEditing(): void;
  onTextChange(text: string): void;
  onApplyFix(claim: Claim): void;
  onReverify(): void;
  onOpenAutoCorrect?(): void;
}

function HighlightView({
  doc,
  claims,
  workingText,
  viewMode,
  isEditing,
  reverifying,
  hasEdits,
  hasUnsavedEdits,
  editedCount,
  correctableCount = 0,
  onPick,
  onViewModeChange,
  onStartEditing,
  onDoneEditing,
  onDiscardEditing,
  onTextChange,
  onApplyFix,
  onReverify,
  onOpenAutoCorrect,
}: HighlightViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [popover, setPopover] = useState<{
    claim: Claim;
    top: number;
    left: number;
  } | null>(null);

  const activeText = viewMode === "corrected" ? workingText : doc.extracted_text || "";

  // Auto-grow textarea in edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(260, textareaRef.current.scrollHeight)}px`;
    }
  }, [isEditing, workingText]);

  const segments = useMemo(() => {
    const norm = (s: string) => s.replace(/\s+/g, " ");
    const t = norm(activeText);
    const ranges: { start: number; end: number; claim: Claim }[] = [];

    for (const c of claims) {
      const needle = norm(c.claim_text).trim();
      let i = t.indexOf(needle);
      if (i < 0) {
        // Fall back to sentence without citation marker
        const short = needle.replace(/\s*[[(][^\])]*[\])]\.?$/, "").slice(0, 80);
        i = short.length > 20 ? t.indexOf(short) : -1;
        if (i >= 0) ranges.push({ start: i, end: i + short.length, claim: c });
        continue;
      }
      ranges.push({ start: i, end: i + needle.length, claim: c });
    }

    ranges.sort((a, b) => a.start - b.start);
    const out: { text: string; claim?: Claim }[] = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start < pos) continue;
      if (r.start > pos) out.push({ text: t.slice(pos, r.start) });
      out.push({ text: t.slice(r.start, r.end), claim: r.claim });
      pos = r.end;
    }
    out.push({ text: t.slice(pos) });
    return out;
  }, [activeText, claims]);

  const handleSentenceClick = (e: React.MouseEvent<HTMLElement>, claim: Claim) => {
    const v = effectiveVerdict(claim);
    if (v === "supported") {
      onPick(claim.id);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const cRect = containerRef.current?.getBoundingClientRect();
    if (cRect) {
      const top = rect.bottom - cRect.top + 8;
      const left = Math.max(12, Math.min(rect.left - cRect.left, cRect.width - 340));
      setPopover({ claim, top, left });
    }
  };

  const isClaimEdited = (c: Claim) =>
    !(doc.extracted_text || "").includes(c.claim_text.trim()) ||
    !workingText.includes(c.claim_text.trim()) ||
    (c.uncertainty_note?.includes("Re-verified") ?? false);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card p-3 sm:p-4 bg-white border-hairline flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {correctableCount > 0 && onOpenAutoCorrect && (
            <button
              type="button"
              onClick={onOpenAutoCorrect}
              className="btn-primary h-8 px-3 text-[12px] inline-flex items-center gap-1.5 shadow-xs bg-neutral-900 text-white whitespace-nowrap"
              title="Review and auto-correct flagged claims"
            >
              <Sparkles size={13} className="text-amber-300" /> Auto-correct ({correctableCount})
            </button>
          )}

          {!isEditing && (
            <button
              type="button"
              onClick={() => onStartEditing()}
              className="btn-outline h-8 px-3 text-[12px] inline-flex items-center gap-1.5"
            >
              <Pencil size={13} /> Edit text
            </button>
          )}

          {/* Segmented toggle: Original | Corrected */}
          <div className="inline-flex rounded-lg border border-hairline bg-neutral-100 p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => onViewModeChange("original")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                viewMode === "original"
                  ? "bg-white text-primary shadow-xs"
                  : "text-neutral-500 hover:text-black"
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("corrected")}
              disabled={!hasEdits && !doc.corrected_text}
              className={`px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                viewMode === "corrected"
                  ? "bg-white text-primary shadow-xs"
                  : "text-neutral-500 hover:text-black"
              }`}
            >
              Corrected
            </button>
          </div>

          <button
            type="button"
            onClick={onReverify}
            disabled={!hasUnsavedEdits || reverifying}
            className="btn-primary h-8 px-4 text-[12px] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {reverifying && <Spinner size={12} />}
            {reverifying
              ? `Re-verifying ${editedCount || 1} claim${editedCount > 1 ? "s" : ""}…`
              : "Re-verify"}
          </button>
        </div>

        {/* Download corrected file */}
        {(doc.corrected_text || hasEdits) && (
          <div className="flex flex-col items-end">
            <button
              type="button"
              onClick={() => downloadCorrectedDocument(doc, workingText)}
              className="btn-primary h-8 px-3 text-[12px] inline-flex items-center gap-1.5"
            >
              <Download size={13} /> Download corrected file
            </button>
            <span className="text-[10px] text-neutral-400 mt-1">
              Formatting is simplified. Text and citations are preserved.
            </span>
          </div>
        )}
      </div>

      {/* Main text container / Edit mode */}
      <div ref={containerRef} className="card p-6 sm:p-8 relative">
        {isEditing ? (
          <div>
            <div className="flex flex-wrap items-center justify-between pb-3 mb-4 border-b border-hairline gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-medium">
                Editing — changes are not verified yet
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDiscardEditing}
                  className="btn-ghost h-8 px-3 text-[12px] text-neutral-600 hover:text-black"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={onDoneEditing}
                  className="btn-primary h-8 px-4 text-[12px]"
                >
                  Done
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={workingText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Paste or edit the document text here..."
              className="w-full resize-none p-4 font-[450] text-[15px] leading-[1.9] text-neutral-800 bg-neutral-50/60 rounded-xl border border-transparent focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-5 text-[11px]">
              {[
                ["bg-emerald-100", "Supported"],
                ["bg-amber-100", "Partly supported / outdated"],
                ["bg-orange-100", "Unsupported"],
                ["bg-red-100", "Contradicted / fabricated"],
                ["bg-neutral-200", "Not found"],
              ].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5 text-neutral-500">
                  <span className={`w-3 h-3 rounded ${c}`} /> {l}
                </span>
              ))}
            </div>

            <div className="text-[15px] leading-[1.9] text-neutral-700 whitespace-pre-wrap font-[450]">
              {segments.map((s, i) =>
                s.claim ? (
                  <mark
                    key={i}
                    onClick={(e) => handleSentenceClick(e, s.claim!)}
                    title={`${VERDICTS[effectiveVerdict(s.claim)].label} — click to view options`}
                    className={`cursor-pointer rounded px-0.5 text-primary underline decoration-2 underline-offset-4 hover:brightness-95 transition ${highlightClass(s.claim)}`}
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>

            {/* Click Popover */}
            {popover && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPopover(null)}
                />
                <div
                  style={{ top: popover.top, left: popover.left }}
                  className="absolute z-40 w-84 max-w-[90vw] bg-white rounded-2xl border border-hairline shadow-lift p-4 text-[13px] text-neutral-700 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-hairline">
                    <div className="flex items-center gap-1.5">
                      <VerdictBadge verdict={effectiveVerdict(popover.claim)} size="sm" />
                      {isClaimEdited(popover.claim) && (
                        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] font-medium">
                          Edited
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPopover(null)}
                      className="text-neutral-400 hover:text-black p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <p className="text-[12px] text-neutral-600 leading-relaxed mb-3">
                    {popover.claim.explanation || "No explanation available."}
                  </p>

                  {popover.claim.suggested_fix ? (
                    <div className="mb-3 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-[12px]">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-800 block mb-1">
                        Suggested correction:
                      </span>
                      <p className="text-emerald-950 font-medium leading-relaxed">
                        {popover.claim.suggested_fix}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-3 p-2.5 rounded-xl bg-neutral-50 border border-hairline text-[11px] text-neutral-500">
                      Remove or replace this citation. No direct supporting evidence is retrievable.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline">
                    {popover.claim.suggested_fix && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyFix(popover.claim);
                          setPopover(null);
                        }}
                        className="btn-primary h-7 px-3 text-[11px]"
                      >
                        Apply fix
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onStartEditing(popover.claim.claim_text);
                        setPopover(null);
                      }}
                      className="btn-outline h-7 px-3 text-[11px]"
                    >
                      Edit manually
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(popover.claim.id);
                        setPopover(null);
                      }}
                      className="btn-ghost h-7 px-2.5 text-[11px] text-neutral-600 hover:text-black ml-auto"
                    >
                      View claim card
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ page
export default function ResultsPage() {
  useEffect(() => {
    void loadExport();
  }, []);
  const { documentId = "" } = useParams();
  const { settings, user } = useAuth();
  const toast = useToast();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(false);
  const [filter, setFilter] = useState<Verdict | "flagged" | "overstated" | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [sourceCheck, setSourceCheck] = useState<SourceCheckResult | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Edit & Re-verify state
  const [workingText, setWorkingText] = useState("");
  const [viewMode, setViewMode] = useState<"original" | "corrected">("original");
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [reverifying, setReverifying] = useState(false);

  // Auto-correct permission review state
  const [autoCorrectOpen, setAutoCorrectOpen] = useState(false);
  const [permittedFixes, setPermittedFixes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setBannerDismissed(false);

    Promise.all([data.getDocument(documentId), data.getClaims(documentId)])
      .then(([d, cs]) => {
        if (!alive) return;
        setDoc(d);
        setClaims(cs);
        const initialText = d?.corrected_text || d?.extracted_text || "";
        setWorkingText(initialText);
        if (d?.corrected_text) setViewMode("corrected");
        if (!d) setError("This report could not be found.");
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));

    backend
      .sourceCheck(documentId)
      .then((res) => alive && setSourceCheck(res))
      .catch(() => {
        // If the check fails, show nothing. Do not block the page.
      });

    return () => {
      alive = false;
    };
  }, [documentId]);

  const updateClaim = useCallback(
    (c: Claim) => {
      setClaims((cs) => {
        const next = cs.map((x) => (x.id === c.id ? c : x));
        const newScore = trustScore(next);
        const newFlag = flagFor(newScore);
        setDoc((prev) => (prev ? { ...prev, trust_score: newScore, flag: newFlag } : prev));
        if (doc) {
          data.updateDocument(doc.id, { trust_score: newScore, flag: newFlag }).catch(() => {});
        }
        return next;
      });
    },
    [doc],
  );

  const score = trustScore(claims);
  const flag = flagFor(score);
  const counts = useMemo(() => {
    const m = new Map<Verdict, number>();
    claims.forEach((c) => m.set(effectiveVerdict(c), (m.get(effectiveVerdict(c)) ?? 0) + 1));
    return m;
  }, [claims]);
  const flaggedCount = claims.filter((c) => c.user_flagged).length;

  const isClaimEdited = useCallback(
    (c: Claim) => {
      const origText = doc?.extracted_text || "";
      const isOriginalMissing = !origText.includes(c.claim_text.trim());
      const isWorkingMissing = !workingText.includes(c.claim_text.trim());
      const wasReverified = c.uncertainty_note?.includes("Re-verified") ?? false;
      return (isOriginalMissing && !!doc?.corrected_text) || isWorkingMissing || wasReverified;
    },
    [doc, workingText],
  );

  const editedClaimsCount = useMemo(
    () => claims.filter(isClaimEdited).length,
    [claims, isClaimEdited],
  );

  const hasEdits = useMemo(() => {
    if (!doc) return false;
    return workingText.trim() !== (doc.extracted_text || "").trim();
  }, [doc, workingText]);

  const hasUnsavedEdits = useMemo(() => {
    if (!doc) return false;
    const lastSaved = doc.corrected_text || doc.extracted_text || "";
    return workingText.trim() !== lastSaved.trim();
  }, [doc, workingText]);

  const overstatedClaims = useMemo(
    () => claims.filter((c) => checkTone(c.claim_text, c.evidence_quote).level === "warn"),
    [claims],
  );

  const visible = claims.filter((c) => {
    if (filter === null) return true;
    if (filter === "flagged") return c.user_flagged;
    if (filter === "overstated") return checkTone(c.claim_text, c.evidence_quote).level === "warn";
    return effectiveVerdict(c) === filter;
  });

  const pick = (id: string) => {
    setHighlight(false);
    setFilter(null);
    setTimeout(() => {
      document.getElementById(`claim-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulseId(id);
      setTimeout(() => setPulseId(null), 1900);
    }, 60);
  };

  const doExport = async (f: ExportFormat) => {
    if (!doc) return;
    setExporting(f);
    try {
      await exportReport(doc, claims, f);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setExporting(null);
    }
  };

  const formats = useMemo(() => {
    const def = settings.default_export;
    const defItem = FORMAT_CONFIG.find((f) => f.id === def) ?? FORMAT_CONFIG[0]!;
    return [defItem, ...FORMAT_CONFIG.filter((f) => f.id !== defItem.id)];
  }, [settings.default_export]);

  const handleAutoCorrectSingleClaim = async (c: Claim) => {
    if (!doc) return;
    const fix =
      c.suggested_fix ||
      (c.date_conflict
        ? c.claim_text.replace(c.date_conflict.claimed_date, c.date_conflict.actual_date)
        : null);
    if (!fix) {
      toast("No suggested correction available for this claim.", "error");
      return;
    }

    const oldScore = score;
    const origSentence = c.claim_text.trim();
    const fixTrimmed = fix.trim();

    // 1. Update working text
    let newWorkingText = workingText;
    if (newWorkingText.includes(origSentence)) {
      newWorkingText = newWorkingText.replace(origSentence, fixTrimmed);
    } else if (c.citation_id && newWorkingText.includes(c.citation_id)) {
      const sentences = newWorkingText.split(/(?<=[.?!])\s+|\n+/);
      const match = sentences.find((s) => s.includes(c.citation_id!));
      if (match) {
        newWorkingText = newWorkingText.replace(match.trim(), fixTrimmed);
      }
    } else {
      const norm = (s: string) => s.replace(/\s+/g, " ");
      const needle = norm(origSentence).slice(0, 40);
      const sentences = newWorkingText.split(/(?<=[.?!])\s+|\n+/);
      const match = sentences.find((s) => norm(s).includes(needle));
      if (match) {
        newWorkingText = newWorkingText.replace(match.trim(), fixTrimmed);
      }
    }
    setWorkingText(newWorkingText);
    setViewMode("corrected");

    // 2. Prepare the updated claim object
    const updatedClaim: Claim = {
      ...c,
      claim_text: fixTrimmed,
      verdict: "supported",
      user_override_verdict: null,
      user_override_reason: null,
      evidence_strength: "High",
      outdated: false,
      date_conflict: null,
      needs_human_review: false,
      uncertainty_note: "Auto-corrected to match verified source evidence.",
      explanation: "Auto-corrected — statement now accurately matches the source paper.",
    };

    // 3. Compute recalculated trust score
    const updatedClaims = claims.map((x) => (x.id === c.id ? updatedClaim : x));
    const newScore = trustScore(updatedClaims);
    const newFlag = flagFor(newScore);

    // 4. Update state immediately
    setClaims(updatedClaims);
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            trust_score: newScore,
            flag: newFlag,
            corrected_text: newWorkingText,
          }
        : prev,
    );

    // 5. Persist to storage
    try {
      await data.updateClaim(c.id, {
        claim_text: updatedClaim.claim_text,
        verdict: "supported",
        user_override_verdict: null,
        user_override_reason: null,
        evidence_strength: "High",
        outdated: false,
        date_conflict: null,
        needs_human_review: false,
        uncertainty_note: updatedClaim.uncertainty_note,
        explanation: updatedClaim.explanation,
      });

      await data.updateDocument(doc.id, {
        trust_score: newScore,
        flag: newFlag,
        corrected_text: newWorkingText,
      });

      const diff = newScore - oldScore;
      toast(
        `Claim auto-corrected! Trust score: ${oldScore} → ${newScore}/100${diff > 0 ? ` (+${diff} pts)` : ""}`,
        "success",
      );
    } catch (err) {
      toast(`Saved: ${(err as Error).message}`, "error");
    }
  };

  const handleApplyFix = (c: Claim) => {
    handleAutoCorrectSingleClaim(c);
  };

  const handleStartEditing = (_sentence?: string) => {
    setIsEditing(true);
    setViewMode("corrected");
  };

  const handleDiscardEditing = () => {
    if (hasUnsavedEdits) {
      setConfirmDiscardOpen(true);
    } else {
      setIsEditing(false);
    }
  };

  const confirmDiscard = () => {
    const fallback = doc?.corrected_text || doc?.extracted_text || "";
    setWorkingText(fallback);
    setIsEditing(false);
    setConfirmDiscardOpen(false);
    if (!doc?.corrected_text) setViewMode("original");
  };

  const handleReverify = async () => {
    if (!doc || !hasUnsavedEdits) return;
    setReverifying(true);
    const oldScore = score;
    try {
      const res = await backend.reverifyText(doc.id, workingText);
      setDoc(res.document);
      setClaims(res.claims);
      setViewMode("corrected");
      toast(`Trust score ${oldScore} → ${res.document.trust_score ?? trustScore(res.claims)}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setReverifying(false);
    }
  };

  const correctableClaims = useMemo(
    () => claims.filter((c) => effectiveVerdict(c) !== "supported" && !!c.suggested_fix),
    [claims],
  );

  const openAutoCorrect = () => {
    const init: Record<string, boolean> = {};
    correctableClaims.forEach((c) => {
      init[c.id] = true;
    });
    setPermittedFixes(init);
    setAutoCorrectOpen(true);
  };

  const togglePermission = (id: string) => {
    setPermittedFixes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllPermissions = (grant: boolean) => {
    const next: Record<string, boolean> = {};
    correctableClaims.forEach((c) => {
      next[c.id] = grant;
    });
    setPermittedFixes(next);
  };

  const approvedFixCount = useMemo(
    () => correctableClaims.filter((c) => permittedFixes[c.id]).length,
    [correctableClaims, permittedFixes],
  );

  const handleApplyAutoCorrections = async () => {
    if (!doc) return;
    const approved = correctableClaims.filter((c) => permittedFixes[c.id]);
    if (approved.length === 0) {
      toast("Please grant permission for at least one statement to proceed.", "error");
      return;
    }

    let text = workingText;
    let count = 0;

    for (const c of approved) {
      if (!c.suggested_fix) continue;
      const orig = c.claim_text.trim();
      if (text.includes(orig)) {
        text = text.replace(orig, c.suggested_fix.trim());
        count++;
      } else if (c.citation_id && text.includes(c.citation_id)) {
        const sentences = text.split(/(?<=[.?!])\s+|\n+/);
        const match = sentences.find((s) => s.includes(c.citation_id!));
        if (match) {
          text = text.replace(match.trim(), c.suggested_fix.trim());
          count++;
        }
      } else {
        const norm = (s: string) => s.replace(/\s+/g, " ");
        const needle = norm(orig).slice(0, 40);
        const sentences = text.split(/(?<=[.?!])\s+|\n+/);
        const match = sentences.find((s) => norm(s).includes(needle));
        if (match) {
          text = text.replace(match.trim(), c.suggested_fix.trim());
          count++;
        }
      }
    }

    setWorkingText(text);
    setViewMode("corrected");
    setAutoCorrectOpen(false);

    setReverifying(true);
    const oldScore = score;
    try {
      const res = await backend.reverifyText(doc.id, text);
      setDoc(res.document);
      setClaims(res.claims);
      toast(
        `Applied ${count} approved correction${count > 1 ? "s" : ""}! Trust score ${oldScore} → ${res.document.trust_score ?? trustScore(res.claims)}`,
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setReverifying(false);
    }
  };

  if (loading)
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center text-neutral-400 py-32">
          <Spinner size={20} />
        </div>
      </Layout>
    );

  if (error || !doc)
    return (
      <Layout>
        <PageShell>
          <div className="card p-10 text-center">
            <h1 className="text-[20px] font-semibold text-primary">Report not found</h1>
            <p className="text-[13px] text-neutral-500 mt-1">{error || "It may have been deleted."}</p>
            <Link to={user ? "/dashboard" : "/"} className="btn-primary h-10 px-5 text-[13px] mt-6">
              Go back
            </Link>
          </div>
        </PageShell>
      </Layout>
    );

  const fm = FLAG_META[flag];

  return (
    <Layout>
      <PageShell wide>
        <div className="max-w-4xl mx-auto pb-24">
          {user && (
            <Link to="/dashboard" className="no-print inline-flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-black mb-5">
              <ArrowLeft size={13} /> Dashboard
            </Link>
          )}

          {/* ===== Source Check Notice Banner ===== */}
          {sourceCheck && sourceCheck.changes.length > 0 && !bannerDismissed && (
            <div
              className={`mb-6 rounded-2xl border p-4 sm:p-5 relative reveal ${
                sourceCheck.changes.some((c) => c.type === "retracted")
                  ? "bg-red-50 border-red-200 text-red-950"
                  : "bg-amber-50 border-amber-200 text-amber-950"
              }`}
            >
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="absolute top-3.5 right-3.5 p-1 text-neutral-400 hover:text-black rounded-lg transition-colors cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X size={16} />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    sourceCheck.changes.some((c) => c.type === "retracted")
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <Alert size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold">
                    {sourceCheck.changes.some((c) => c.type === "retracted")
                      ? "Retraction notice detected"
                      : "Source update notice"}
                  </h4>
                  <div className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed">
                    {sourceCheck.changes.map((change, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{change.message}</span>
                        <button
                          type="button"
                          onClick={() => pick(change.claim_id)}
                          className="font-semibold underline hover:no-underline text-primary text-[12px] cursor-pointer inline-flex items-center gap-0.5"
                        >
                          Go to claim →
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-2 font-mono">
                    Checked against Crossref on {formatDate(sourceCheck.checked_at)}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===== Summary card ===== */}
          <ScrollReveal
            once={false}
            viewOptions={{ amount: 0.15 }}
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
          <section className="card p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
              <div className="min-w-0">
                <span className="eyebrow">Verification report</span>
                <h1 className="text-[22px] font-semibold tracking-tight text-primary mt-1 break-words">{doc.file_name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
                  <span className="font-mono">{doc.page_count ?? "—"} {doc.page_count === 1 ? "page" : "pages"}</span>
                  <span>·</span>
                  <span className="font-mono">{claims.length} claims</span>
                  <span>·</span>
                  <span>{formatDate(doc.created_at)}</span>
                  {doc.domain && (
                    <span className="px-2.5 py-0.5 rounded-full border border-hairline bg-neutral-50 text-[11px] font-medium text-neutral-700">{doc.domain}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="eyebrow">Trust score</div>
                  <div className="text-[48px] leading-none font-semibold tracking-[-0.04em] text-primary mt-1">
                    {claims.length ? score : "—"}
                    <span className="text-[16px] text-neutral-400 font-normal tracking-normal">/100</span>
                  </div>
                </div>
                <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl border ${claims.length ? fm.pill : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                  <span className={`w-5 h-5 rounded-full ${claims.length ? fm.dot : "bg-neutral-300"}`} />
                  <span className="text-[10px] font-medium mt-1">{claims.length ? flag[0]!.toUpperCase() + flag.slice(1) : "No claims"}</span>
                </div>
              </div>
            </div>

            {/* Verdict pills (click to filter) */}
            <div className="mt-6 flex flex-wrap gap-2">
              {VERDICT_ORDER.filter((v) => counts.get(v)).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilter((f) => (f === v ? null : v))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all ${VERDICTS[v].pill} ${
                    filter === v ? "ring-2 ring-offset-1 ring-black/60" : "hover:brightness-95"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${v === "likely_fabricated" ? "bg-white" : VERDICTS[v].dot}`} />
                  {VERDICTS[v].label} <span className="font-mono">{counts.get(v)}</span>
                </button>
              ))}
              {flaggedCount > 0 && (
                <button
                  onClick={() => setFilter((f) => (f === "flagged" ? null : "flagged"))}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[12px] font-medium text-orange-700 transition-all hover:brightness-95 ${
                    filter === "flagged" ? "ring-2 ring-offset-1 ring-black/60" : ""
                  }`}
                >
                  Flagged by you <span className="font-mono">{flaggedCount}</span>
                </button>
              )}
              {overstatedClaims.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter((f) => (f === "overstated" ? null : "overstated"))}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-900 transition-all hover:brightness-95 ${
                    filter === "overstated" ? "ring-2 ring-offset-1 ring-black/60" : ""
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Overstated claims: <span className="font-mono">{overstatedClaims.length}</span>
                </button>
              )}
            </div>

            <div className="mt-5">
              <MoreDisclosure>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    ["Domain", doc.domain ?? "—"],
                    ["Chunks processed", String(doc.chunks_processed ?? "—")],
                    ["Databases used", (doc.databases_used ?? []).join(", ") || "—"],
                    ["Time taken", doc.time_taken_seconds ? `${doc.time_taken_seconds}s` : "—"],
                    ["File size", formatBytes(doc.file_size)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-neutral-50 border border-hairline p-3">
                      <div className="text-[11px] text-neutral-400">{k}</div>
                      <div className="text-[12px] font-medium text-primary mt-0.5 leading-snug">{v}</div>
                    </div>
                  ))}
                </div>
              </MoreDisclosure>
            </div>

            {/* Download row */}
            <div className="no-print mt-5 pt-5 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-neutral-500 mr-1 flex items-center gap-1.5">
                  <Download size={13} /> Download report
                </span>
                {formats.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => doExport(f.id)}
                    disabled={!!exporting}
                    className={`${i === 0 ? "btn-primary" : "btn-outline"} h-8 px-4 text-[12px] font-medium`}
                  >
                    {exporting === f.id && <Spinner size={12} />}
                    {f.label}
                  </button>
                ))}
              </div>

              {(doc.corrected_text || hasEdits) && (
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => downloadCorrectedDocument(doc, workingText)}
                    className="btn-primary h-8 px-3 text-[12px] inline-flex items-center gap-1.5"
                  >
                    <Download size={13} /> Download corrected file
                  </button>
                  <span className="text-[10px] text-neutral-400 mt-1">
                    Formatting is simplified. Text and citations are preserved.
                  </span>
                </div>
              )}
            </div>
          </section>
          </ScrollReveal>

          {/* ===== AI Report Chat ===== */}
          <ReportChat documentId={doc.id} doc={doc} claims={claims} />

          {/* ===== List header + highlight toggle ===== */}
          <div className="no-print mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-primary">
                {highlight
                  ? "Document view"
                  : filter === "overstated"
                  ? `${overstatedClaims.length} overstated ${overstatedClaims.length === 1 ? "claim" : "claims"}`
                  : filter
                  ? `${visible.length} of ${claims.length} claims`
                  : "All claims"}
              </h2>
              {filter && !highlight && (
                <button onClick={() => setFilter(null)} className="text-[12px] text-neutral-500 hover:text-black underline underline-offset-4">
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {correctableClaims.length > 0 && (
                <button
                  type="button"
                  onClick={openAutoCorrect}
                  className="btn-primary h-9 px-3.5 text-[12px] inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                >
                  <Sparkles size={13} className="text-amber-300" />
                  Auto-correct ({correctableClaims.length})
                </button>
              )}
              {user && (
                <Link to={`/compare?a=${doc.id}`} className="btn-outline h-9 px-4 text-[12px] whitespace-nowrap">
                  <Layers size={14} /> Compare
                </Link>
              )}
              <button
                onClick={() => setHighlight((h) => !h)}
                aria-pressed={highlight}
                className={`h-9 px-4 text-[12px] whitespace-nowrap ${highlight ? "btn-primary" : "btn-outline"}`}
              >
                <Highlighter size={14} /> Highlight view {highlight ? "on" : "off"}
              </button>
            </div>
          </div>

          {highlight ? (
            doc.extracted_text ? (
              <HighlightView
                doc={doc}
                claims={claims}
                workingText={workingText}
                viewMode={viewMode}
                isEditing={isEditing}
                reverifying={reverifying}
                hasEdits={hasEdits}
                hasUnsavedEdits={hasUnsavedEdits}
                editedCount={editedClaimsCount}
                correctableCount={correctableClaims.length}
                onPick={pick}
                onViewModeChange={setViewMode}
                onStartEditing={handleStartEditing}
                onDoneEditing={() => {
                  setIsEditing(false);
                  setViewMode("corrected");
                }}
                onDiscardEditing={handleDiscardEditing}
                onTextChange={setWorkingText}
                onApplyFix={handleApplyFix}
                onReverify={handleReverify}
                onOpenAutoCorrect={openAutoCorrect}
              />
            ) : (
              <div className="card p-8 text-center text-[13px] text-neutral-500">The original text is not available for this report.</div>
            )
          ) : (
            <div className="space-y-4">
              {visible.map((c) => (
                <ScrollReveal
                  key={c.id}
                  once={false}
                  viewOptions={{ amount: 0.12 }}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                <ClaimCard
                  claim={c}
                  index={claims.indexOf(c)}
                  threshold={settings.confidence_threshold}
                  pulse={pulseId === c.id}
                  edited={isClaimEdited(c)}
                  onChange={updateClaim}
                  onAutoCorrect={handleAutoCorrectSingleClaim}
                />
                </ScrollReveal>
              ))}
              {visible.length === 0 && (
                <div className="card p-8 text-center text-[13px] text-neutral-500">
                  {claims.length ? (
                    "No claims match this filter."
                  ) : (
                    <>
                      <p className="font-medium text-primary">No cited claims were found in this document.</p>
                      <p className="mt-1">
                        Truvify checks sentences that cite a source, like <span className="font-mono">[1]</span> or{" "}
                        <span className="font-mono">(Smith, 2019)</span>, against the paper they cite.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </PageShell>

      {/* Discard confirmation modal */}
      <Modal open={confirmDiscardOpen} onClose={() => setConfirmDiscardOpen(false)}>
        <h3 className="text-[18px] font-semibold text-primary">Discard unsaved edits?</h3>
        <p className="text-[13px] text-neutral-600 mt-2 leading-relaxed">
          Your changes to the text have not been verified. Are you sure you want to discard your edits?
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => setConfirmDiscardOpen(false)}
            className="btn-outline h-9 px-4 text-[13px]"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={confirmDiscard}
            className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium"
          >
            Discard changes
          </button>
        </div>
      </Modal>

      {/* Auto-correct permission review modal */}
      <Modal open={autoCorrectOpen} onClose={() => !reverifying && setAutoCorrectOpen(false)} maxWidth="max-w-2xl">
        <div className="flex items-start justify-between pb-3 mb-3 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-primary">Auto-Correct Document</h3>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                Review suggested evidence-backed corrections. Each statement will only be corrected with your explicit permission.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar inside modal */}
        <div className="flex items-center justify-between py-2 px-1 text-[12px]">
          <span className="font-medium text-neutral-700">
            {approvedFixCount} of {correctableClaims.length} statements permitted
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectAllPermissions(true)}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Permit all
            </button>
            <span className="text-neutral-300">·</span>
            <button
              type="button"
              onClick={() => selectAllPermissions(false)}
              className="text-[11px] text-neutral-500 hover:text-black font-medium"
            >
              Revoke all
            </button>
          </div>
        </div>

        {/* Statements list */}
        <div className="overflow-y-auto max-h-[50vh] space-y-3 pr-1 py-1">
          {correctableClaims.map((c, idx) => {
            const isPermitted = !!permittedFixes[c.id];
            const v = effectiveVerdict(c);
            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isPermitted ? "bg-white border-neutral-300 shadow-xs" : "bg-neutral-50/70 border-hairline opacity-75"
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-hairline">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-neutral-400">#{idx + 1}</span>
                    <VerdictBadge verdict={v} size="sm" />
                    {c.citation_id && (
                      <span className="font-mono text-[11px] text-neutral-500">{c.citation_id}</span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPermitted}
                      onChange={() => togglePermission(c.id)}
                      className="w-4 h-4 rounded text-black accent-black cursor-pointer"
                    />
                    <span className={`text-[12px] font-medium ${isPermitted ? "text-emerald-700" : "text-neutral-500"}`}>
                      {isPermitted ? "Permission granted" : "Skip statement"}
                    </span>
                  </label>
                </div>

                {/* Statement diff */}
                <div className="space-y-2 text-[12.5px]">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-red-600 font-semibold block mb-0.5">
                      Original text in document:
                    </span>
                    <p className="text-neutral-700 line-through decoration-red-400/80 bg-red-50/50 p-2 rounded-lg border border-red-100/60 leading-relaxed">
                      {c.claim_text}
                    </p>
                  </div>

                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 font-semibold block mb-0.5">
                      Suggested correction (based on the source):
                    </span>
                    <p className="text-emerald-950 font-medium bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/60 leading-relaxed">
                      {c.suggested_fix}
                    </p>
                  </div>

                  {c.explanation && (
                    <p className="text-[11px] text-neutral-500 leading-relaxed pt-1">
                      <span className="font-medium text-neutral-600">Verification note:</span> {c.explanation}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-4 border-t border-hairline">
          <p className="text-[11px] text-neutral-400 min-w-0 flex-1 basis-48">
            Only permitted statements will be corrected and re-verified.
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={reverifying}
              onClick={() => setAutoCorrectOpen(false)}
              className="btn-outline h-9 px-4 text-[12px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={approvedFixCount === 0 || reverifying}
              onClick={handleApplyAutoCorrections}
              className="btn-primary h-9 px-4 text-[12px] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {reverifying ? <Spinner size={12} /> : <Sparkles size={13} className="text-amber-300" />}
              Apply {approvedFixCount} approved {approvedFixCount === 1 ? "correction" : "corrections"} & re-verify
            </button>
          </div>
        </div>
      </Modal>

      {/* Disclaimer bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-hairline py-2.5">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-center gap-2 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-mono uppercase tracking-wider font-semibold shrink-0">
            Notice
          </span>
          <p className="text-[12px] font-sans font-medium text-neutral-600 tracking-tight leading-none truncate">
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </Layout>
  );
}
