import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FormatIcon, Modal, PageShell, formatDate } from "../components/Common";
import { ArrowRight, Bookmark, FileIcon, Layers, Spinner, Trash, Upload } from "../components/Icons";
import { Layout } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { data } from "../lib/api";
import { DOMAINS, type Claim, type Domain, type DocumentRecord, type ExportFormat } from "../lib/types";
import { flagFor, FLAG_META, VERDICTS, VERDICT_ORDER } from "../lib/verdicts";

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const validExport = (fmt: string): ExportFormat =>
  fmt === "pdf" || fmt === "docx" || fmt === "xlsx" || fmt === "pptx" ? (fmt as ExportFormat) : "pdf";

export default function DashboardPage() {
  const { user, settings, updateSettings } = useAuth();
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [threshold, setThreshold] = useState(settings.confidence_threshold);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claimsCache, setClaimsCache] = useState<Record<string, Claim[]>>({});
  const [loadingClaims, setLoadingClaims] = useState<Record<string, boolean>>({});
  const [openingOriginal, setOpeningOriginal] = useState<Record<string, boolean>>({});
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  useEffect(() => {
    data.listDocuments().then(setDocs).catch((e) => {
      toast((e as Error).message, "error");
      setDocs([]);
    });
  }, [toast]);

  useEffect(() => setThreshold(settings.confidence_threshold), [settings.confidence_threshold]);

  const toggleSave = async (d: DocumentRecord) => {
    setDocs((ds) => ds?.map((x) => (x.id === d.id ? { ...x, saved: !x.saved } : x)) ?? null);
    try {
      await data.setSaved(d.id, !d.saved);
      toast(!d.saved ? "Saved permanently." : "Unsaved — will be deleted after 30 days.", "success");
    } catch (e) {
      setDocs((ds) => ds?.map((x) => (x.id === d.id ? { ...x, saved: d.saved } : x)) ?? null);
      toast((e as Error).message, "error");
    }
  };

  const toggleView = async (d: DocumentRecord) => {
    if (expandedId === d.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(d.id);
    if (!claimsCache[d.id]) {
      setLoadingClaims((prev) => ({ ...prev, [d.id]: true }));
      try {
        const claims = await data.getClaims(d.id);
        setClaimsCache((prev) => ({ ...prev, [d.id]: claims }));
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setLoadingClaims((prev) => ({ ...prev, [d.id]: false }));
      }
    }
  };

  const openOriginal = async (d: DocumentRecord) => {
    setOpeningOriginal((prev) => ({ ...prev, [d.id]: true }));
    try {
      const url = await data.getOriginalFileUrl(d);
      if (!url) {
        toast("Original file not available", "error");
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOpeningOriginal((prev) => ({ ...prev, [d.id]: false }));
    }
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;
    setDeletingDoc(true);
    try {
      await data.deleteDocument(docToDelete.id);
      setDocs((prev) => prev?.filter((x) => x.id !== docToDelete.id) ?? null);
      if (expandedId === docToDelete.id) setExpandedId(null);
      toast("Research document deleted successfully.", "success");
      setDocToDelete(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeletingDoc(false);
    }
  };

  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch);
      toast("Settings saved.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const scored = docs?.filter((d) => d.trust_score !== null && d.trust_score !== undefined) ?? [];
  const avg = scored.length ? Math.round(scored.reduce((s, d) => s + (d.trust_score ?? 0), 0) / scored.length) : null;

  return (
    <Layout>
      <PageShell wide>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8 reveal">
          <div>
            <span className="eyebrow">Dashboard</span>
            <h1 className="text-[28px] font-semibold tracking-tight text-primary mt-1">
              Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-[13px] text-neutral-500 mt-1">Manage your verified documents and preferences.</p>
          </div>
          <Link to="/upload" className="btn-primary h-10 px-5 text-[13px]">
            <Upload size={14} /> Verify new document
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5">
            <span className="eyebrow">Documents verified</span>
            <div className="text-[24px] font-semibold text-primary mt-1 font-mono">{docs?.length ?? "—"}</div>
          </div>
          <div className="card p-5">
            <span className="eyebrow">Average trust score</span>
            <div className="text-[24px] font-semibold text-primary mt-1 font-mono">{avg !== null ? avg : "—"}</div>
          </div>
          <div className="card p-5 flex flex-col justify-between">
            <span className="eyebrow">Compare versions</span>
            <Link to="/compare" className="mt-2 text-[13px] font-medium text-primary hover:underline underline-offset-4 inline-flex items-center gap-1.5">
              <Layers size={14} /> Open document comparison →
            </Link>
          </div>
        </div>

        {/* History table */}
        <section className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-primary">Document history</h2>
              <p className="text-[12px] text-neutral-500">Unsaved documents are deleted automatically after 30 days.</p>
            </div>
            {docs && docs.length > 0 && (
              <span className="font-mono text-[11px] text-neutral-400">{docs.length} total</span>
            )}
          </div>

          {!docs ? (
            <div className="py-16 flex justify-center text-neutral-400">
              <Spinner size={18} />
            </div>
          ) : docs.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[14px] text-primary font-medium">No documents yet</p>
              <p className="text-[13px] text-neutral-500 mt-1 mb-5">Upload your first document to get a verification report.</p>
              <Link to="/upload" className="btn-primary h-10 px-5 text-[13px]">Verify now</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <p className="sm:hidden px-5 pt-3 text-[11px] text-neutral-400">Swipe sideways to see scores and actions →</p>
              <table className="w-full min-w-[820px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-[11px] uppercase tracking-wider text-neutral-400 font-mono">
                    <th className="px-5 py-3 font-medium">File</th>
                    <th className="px-3 py-3 font-medium">Domain</th>
                    <th className="px-3 py-3 font-medium text-right">Claims</th>
                    <th className="px-3 py-3 font-medium">Verified</th>
                    <th className="px-3 py-3 font-medium">Trust score</th>
                    <th className="px-3 py-3 font-medium text-center">Save</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {docs.map((d) => {
                    const processing = d.status === "processing";
                    const failed = d.status === "failed";
                    const flag = d.flag ?? flagFor(d.trust_score ?? 0);
                    const fm = d.trust_score === null || d.trust_score === undefined ? { pill: "bg-neutral-50 text-neutral-500 border-neutral-200", dot: "bg-neutral-300" } : FLAG_META[flag];
                    const isExpanded = expandedId === d.id;
                    const docClaims = claimsCache[d.id] ?? [];
                    const isLoadingClaims = !!loadingClaims[d.id];

                    return (
                      <Fragment key={d.id}>
                        <tr className="hover:bg-neutral-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <FormatIcon format={d.file_format ?? d.file_name.split(".").pop()} />
                              <span className="font-medium text-primary truncate max-w-[240px]">{d.file_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-neutral-600 whitespace-nowrap">{d.domain ?? "—"}</td>
                          <td className="px-3 py-3.5 text-right font-mono text-neutral-600">{d.claim_count ?? "—"}</td>
                          <td className="px-3 py-3.5 text-neutral-500 whitespace-nowrap">{formatDate(d.created_at)}</td>
                          <td className="px-3 py-3.5">
                            {processing ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
                                <Spinner size={11} /> Processing
                              </span>
                            ) : failed ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 px-2.5 py-0.5 text-[12px] font-medium"
                                title={d.error || "Verification failed"}
                              >
                                Failed
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-mono font-medium ${fm.pill}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${fm.dot}`} />
                                {d.trust_score ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <button
                              onClick={() => toggleSave(d)}
                              aria-pressed={d.saved}
                              title={d.saved ? "Saved permanently — click to unsave" : "Save permanently"}
                              className={`w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors ${
                                d.saved ? "text-primary bg-neutral-100" : "text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100"
                              }`}
                            >
                              <Bookmark size={15} filled={d.saved} />
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {processing && (
                                <Link
                                  to={`/progress/${d.id}`}
                                  className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 hover:text-primary underline underline-offset-4"
                                >
                                  In progress &rarr;
                                </Link>
                              )}
                              {!processing && !failed && (
                                <button
                                  type="button"
                                  onClick={() => toggleView(d)}
                                  className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${
                                    isExpanded
                                      ? "bg-neutral-900 text-white"
                                      : "border border-hairline bg-white hover:bg-neutral-50 text-neutral-700"
                                  }`}
                                >
                                  {isExpanded ? "Close" : "View"}
                                </button>
                              )}
                              {!processing && !failed && (
                                <Link to={`/results/${d.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline underline-offset-4">
                                  Open <ArrowRight size={12} />
                                </Link>
                              )}
                              {failed && d.error && (
                                <span className="text-[11px] text-neutral-400 max-w-[140px] truncate" title={d.error}>
                                  {d.error}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setDocToDelete(d)}
                                title="Delete research paper"
                                aria-label="Delete document"
                                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-neutral-50/70 border-b border-hairline">
                            <td colSpan={7} className="px-5 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Panel A: Input file */}
                                <div className="card p-4 bg-white border-hairline flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
                                      <span className="eyebrow tracking-wider">Input file</span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => openOriginal(d)}
                                          disabled={openingOriginal[d.id]}
                                          className="btn-outline h-7 px-3 text-[11px] inline-flex items-center gap-1.5"
                                        >
                                          {openingOriginal[d.id] ? <Spinner size={11} /> : <FileIcon size={12} />}
                                          Open original
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setDocToDelete(d)}
                                          className="btn-outline text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 h-7 px-2.5 text-[11px] inline-flex items-center gap-1.5"
                                          title="Delete document and uploaded file"
                                        >
                                          <Trash size={12} />
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <FormatIcon format={d.file_format ?? d.file_name.split(".").pop()} />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-medium text-primary truncate" title={d.file_name}>
                                          {d.file_name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500 font-mono">
                                          <span>{formatBytes(d.file_size)}</span>
                                          <span>·</span>
                                          <span>{formatDate(d.created_at)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Panel B: Verdicts */}
                                <div className="card p-4 bg-white border-hairline flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
                                      <span className="eyebrow tracking-wider">Verdicts</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-neutral-500 font-medium">Trust score:</span>
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium ${fm.pill}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${fm.dot}`} />
                                          {d.trust_score ?? "—"}
                                        </span>
                                      </div>
                                    </div>

                                    {isLoadingClaims ? (
                                      <div className="py-4 flex items-center justify-center gap-2 text-[12px] text-neutral-400">
                                        <Spinner size={14} /> Loading claims...
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5 py-1">
                                        {VERDICT_ORDER.map((v) => {
                                          const m = VERDICTS[v];
                                          const count = docClaims.filter(
                                            (c) => (c.user_override_verdict ?? c.verdict) === v,
                                          ).length;
                                          return (
                                            <span
                                              key={v}
                                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${m.pill}`}
                                            >
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                  v === "likely_fabricated" ? "bg-white" : m.dot
                                                }`}
                                              />
                                              {m.label}{" "}
                                              <span className="font-mono font-semibold ml-0.5">{count}</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 pt-3 border-t border-hairline flex justify-end">
                                    <Link
                                      to={`/results/${d.id}`}
                                      className="text-[12px] font-medium text-primary hover:underline underline-offset-4 inline-flex items-center gap-1"
                                    >
                                      Open full report →
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="card p-6 mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Settings</h2>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="label" htmlFor="threshold">
                Confidence threshold <span className="font-mono text-neutral-400 ml-1">{threshold}</span>
              </label>
              <input
                id="threshold"
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onMouseUp={() => threshold !== settings.confidence_threshold && save({ confidence_threshold: threshold })}
                onTouchEnd={() => threshold !== settings.confidence_threshold && save({ confidence_threshold: threshold })}
                onKeyUp={() => threshold !== settings.confidence_threshold && save({ confidence_threshold: threshold })}
                className="w-full accent-black mt-2"
              />
              <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">Claims with evidence strength below this are flagged for human review.</p>
            </div>
            <div>
              <label className="label" htmlFor="defdomain">Default domain</label>
              <select
                id="defdomain"
                className="input h-10 text-[13px]"
                value={settings.default_domain ?? ""}
                onChange={(e) => save({ default_domain: (e.target.value || null) as Domain | null })}
              >
                <option value="">None — auto-detect</option>
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-400 mt-1.5">Pre-selected on the upload page.</p>
            </div>
            <div>
              <label className="label" htmlFor="defexport">Default export format</label>
              <select
                id="defexport"
                className="input h-10 text-[13px]"
                value={validExport(settings.default_export)}
                onChange={(e) => save({ default_export: e.target.value as ExportFormat })}
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word (DOCX)</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="pptx">PowerPoint (PPTX)</option>
              </select>
              <p className="text-[11px] text-neutral-400 mt-1.5">Default download format.</p>
            </div>
          </div>
        </section>

        {docToDelete && (
          <Modal
            open={!!docToDelete}
            onClose={() => !deletingDoc && setDocToDelete(null)}
          >
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <Trash size={20} />
            </div>
            <h3 className="text-[18px] font-semibold text-primary">Delete research document?</h3>
            <p className="text-[13px] text-neutral-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-neutral-900">"{docToDelete.file_name}"</span>? This will permanently remove the document, its extracted claims, and the uploaded file. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                disabled={deletingDoc}
                onClick={() => setDocToDelete(null)}
                className="btn-outline h-9 px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingDoc}
                onClick={confirmDeleteDoc}
                className="h-9 px-4 rounded-md text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors inline-flex items-center gap-1.5"
              >
                {deletingDoc ? <Spinner size={12} /> : <Trash size={12} />}
                Delete permanently
              </button>
            </div>
          </Modal>
        )}
      </PageShell>
    </Layout>
  );
}
