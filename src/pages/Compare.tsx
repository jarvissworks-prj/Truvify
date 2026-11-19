import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageShell, VerdictBadge, formatDate } from "../components/Common";
import { ArrowRight, Spinner } from "../components/Icons";
import { Layout } from "../components/Navbar";
import { data } from "../lib/api";
import type { Claim, DocumentRecord } from "../lib/types";
import { effectiveVerdict, isIssue, trustScore } from "../lib/verdicts";

type Kind = "fixed" | "new_issue" | "unchanged_clean" | "unchanged_issue";
interface Row { kind: Kind; a: Claim | null; b: Claim | null; note?: string }

const KIND_META: Record<Kind, { label: string; cls: string }> = {
  fixed: { label: "Fixed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  new_issue: { label: "New issue", cls: "bg-red-50 text-red-700 border-red-200" },
  unchanged_issue: { label: "Unchanged issue", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  unchanged_clean: { label: "Unchanged clean", cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
};
const ORDER: Kind[] = ["new_issue", "unchanged_issue", "fixed", "unchanged_clean"];

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function diff(a: Claim[], b: Claim[]): Row[] {
  const used = new Set<string>();
  const rows: Row[] = [];
  const findMatch = (c: Claim) =>
    a.find((x) => !used.has(x.id) && norm(x.claim_text) === norm(c.claim_text)) ??
    a.find((x) => !used.has(x.id) && !!c.citation_full_reference && norm(x.citation_full_reference) === norm(c.citation_full_reference)) ??
    a.find((x) => !used.has(x.id) && !!c.citation_id && x.citation_id === c.citation_id);

  for (const cb of b) {
    const ca = findMatch(cb);
    if (ca) used.add(ca.id);
    const ia = ca ? isIssue(ca) : false;
    const ib = isIssue(cb);
    let kind: Kind;
    if (!ca) kind = ib ? "new_issue" : "unchanged_clean";
    else if (ia && !ib) kind = "fixed";
    else if (!ia && ib) kind = "new_issue";
    else kind = ib ? "unchanged_issue" : "unchanged_clean";
    rows.push({ kind, a: ca ?? null, b: cb, note: ca ? undefined : "Only in version 2" });
  }
  for (const ca of a) {
    if (used.has(ca.id)) continue;
    rows.push({ kind: isIssue(ca) ? "fixed" : "unchanged_clean", a: ca, b: null, note: "Removed in version 2" });
  }
  return rows.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
}

function Side({ c, label }: { c: Claim | null; label: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-1.5">{label}</div>
      {c ? (
        <>
          <VerdictBadge verdict={effectiveVerdict(c)} size="sm" />
          {(c.outdated || c.date_conflict) && (
            <span className="ml-1.5 text-[11px] text-amber-700">{c.outdated ? "Outdated" : "Date conflict"}</span>
          )}
          <p className="text-[13px] text-neutral-700 mt-2 leading-relaxed">{c.claim_text}</p>
        </>
      ) : (
        <p className="text-[13px] text-neutral-400 italic">Not present</p>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [ca, setCa] = useState<Claim[] | null>(null);
  const [cb, setCb] = useState<Claim[] | null>(null);
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";

  useEffect(() => {
    data.listDocuments().then((d) => {
      setDocs(d.filter((x) => x.status !== "processing"));
      setLoadingDocs(false);
    });
  }, []);

  useEffect(() => {
    setCa(null);
    if (a) data.getClaims(a).then(setCa);
  }, [a]);
  useEffect(() => {
    setCb(null);
    if (b) data.getClaims(b).then(setCb);
  }, [b]);

  const set = (k: "a" | "b", v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const rows = useMemo(() => (ca && cb ? diff(ca, cb) : []), [ca, cb]);
  const counts = useMemo(() => {
    const m: Record<Kind, number> = { fixed: 0, new_issue: 0, unchanged_clean: 0, unchanged_issue: 0 };
    rows.forEach((r) => m[r.kind]++);
    return m;
  }, [rows]);

  const sa = ca ? trustScore(ca) : null;
  const sb = cb ? trustScore(cb) : null;

  const renderSelect = (k: "a" | "b", value: string, label: string) => (
    <div className="flex-1 min-w-0">
      <label className="label">{label}</label>
      <select value={value} onChange={(e) => set(k, e.target.value)} className="input h-11 text-[13px]" disabled={loadingDocs}>
        <option value="">{loadingDocs ? "Loading…" : "Choose a document"}</option>
        {docs.map((d) => (
          <option key={d.id} value={d.id} disabled={d.id === (k === "a" ? b : a)}>
            {d.file_name} · {formatDate(d.created_at)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Layout>
      <PageShell>
        <div className="mb-8 reveal">
          <span className="eyebrow">Comparison mode</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary mt-1">Compare two versions</h1>
          <p className="text-[14px] text-neutral-500 mt-1">See which issues you fixed and which are new.</p>
        </div>

        <div className="card p-5 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          {renderSelect("a", a, "Version 1 (before)")}
          <div className="hidden sm:flex h-11 items-center text-neutral-300">
            <ArrowRight size={18} />
          </div>
          {renderSelect("b", b, "Version 2 (after)")}
        </div>

        {!loadingDocs && docs.length < 2 && (
          <div className="card p-8 mt-6 text-center text-[13px] text-neutral-500">
            You need at least two verified documents to compare.{" "}
            <Link to="/upload" className="text-primary font-medium underline underline-offset-4">Verify another</Link>
          </div>
        )}

        {a && b && (!ca || !cb) && (
          <div className="py-16 flex justify-center text-neutral-400">
            <Spinner size={18} />
          </div>
        )}

        {ca && cb && (
          <>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ORDER.map((k) => (
                <div key={k} className="card p-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium ${KIND_META[k].cls}`}>{KIND_META[k].label}</span>
                  <div className="text-[26px] font-semibold tracking-tight text-primary mt-2">{counts[k]}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${KIND_META[r.kind].cls}`}>{KIND_META[r.kind].label}</span>
                    <span className="font-mono text-[11px] text-neutral-400">{(r.b ?? r.a)?.citation_id}</span>
                    {r.note && <span className="text-[11px] text-neutral-400">· {r.note}</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Side c={r.a} label="Version 1" />
                    <Side c={r.b} label="Version 2" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 card p-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-[15px] text-primary">
                Score changed from <span className="font-semibold font-mono">{sa}</span> to <span className="font-semibold font-mono">{sb}</span>
              </p>
              <span
                className={`px-3 py-1 rounded-full border text-[12px] font-mono font-medium ${
                  sb! > sa! ? "bg-emerald-50 text-emerald-700 border-emerald-200" : sb! < sa! ? "bg-red-50 text-red-700 border-red-200" : "bg-neutral-100 text-neutral-600 border-neutral-200"
                }`}
              >
                {sb! - sa! > 0 ? "+" : ""}
                {sb! - sa!} points
              </span>
            </div>
          </>
        )}
      </PageShell>
    </Layout>
  );
}
