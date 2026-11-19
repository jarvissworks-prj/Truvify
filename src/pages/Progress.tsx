import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/Common";
import { Alert, Check, Spinner } from "../components/Icons";
import { Layout } from "../components/Navbar";
import { backend } from "../lib/api";
import { POLL_MS } from "../lib/config";
import type { JobStage, JobStatus } from "../lib/types";

const STEPS: { key: JobStage; label: string }[] = [
  { key: "extracting", label: "Extracted text" },
  { key: "finding_citations", label: "Found citations" },
  { key: "verifying", label: "Verifying claims" },
  { key: "building_report", label: "Build report" },
];
const ORDER: JobStage[] = ["extracting", "finding_citations", "verifying", "building_report", "done"];

function stepState(step: JobStage, current: JobStage): "done" | "active" | "pending" {
  const a = ORDER.indexOf(step);
  const b = ORDER.indexOf(current);
  if (b > a) return "done";
  if (b === a) return "active";
  return "pending";
}

const fmtEta = (s: number | null) => {
  if (s === null || s === undefined) return "Estimating…";
  if (s <= 0) return "Almost done";
  if (s < 60) return `About ${s}s remaining`;
  return `About ${Math.ceil(s / 60)} min remaining`;
};

export default function ProgressPage() {
  const { jobId = "" } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await backend.getJob(jobId);
        if (!alive) return;
        setJob(j);
        if (j.stage === "failed") {
          setError(j.error || "Verification failed. Please try again.");
          return;
        }
        if ((j.stage === "done" || j.percent >= 100) && j.document_id && !done.current) {
          done.current = true;
          setTimeout(() => nav(`/results/${j.document_id}`, { replace: true }), 900);
          return;
        }
      } catch (err) {
        if (!alive) return;
        setError((err as Error).message);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId, nav]);

  const stage = job?.stage ?? "extracting";
  const pct = job?.percent ?? 0;

  return (
    <Layout>
      <PageShell>
        {/* Document info bar */}
        <div className="card px-5 py-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 reveal">
          <span className="text-[14px] font-medium text-primary truncate max-w-[50%]">{job?.file_name ?? "Loading…"}</span>
          <span className="font-mono text-[11px] text-neutral-500">{job?.page_count ? `${job.page_count} ${job.page_count === 1 ? "page" : "pages"}` : "— pages"}</span>
          {job?.domain && (
            <span className="px-2.5 py-0.5 rounded-full border border-hairline bg-neutral-50 text-[11px] font-medium text-neutral-700">{job.domain}</span>
          )}
        </div>

        {error ? (
          <div className="card p-8 mt-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <Alert size={22} />
            </div>
            <h1 className="text-[20px] font-semibold text-primary">Verification stopped</h1>
            <p className="text-[13px] text-neutral-500 mt-1">{error}</p>
            <Link to="/upload" className="btn-primary h-10 px-5 text-[13px] mt-6">Try again</Link>
          </div>
        ) : (
          <>
            {/* Progress */}
            <section className="mt-8">
              <h1 className="text-[28px] font-semibold tracking-tight text-primary">
                {stage === "done" ? "Verification complete" : "Verifying citations…"}
              </h1>
              <p className="text-[13px] text-neutral-500 mt-1">
                {stage === "verifying" && job?.current_chunk
                  ? `Processing chunk ${job.current_chunk} of ${job.total_chunks ?? "?"}`
                  : stage === "extracting"
                    ? "Reading your document"
                    : stage === "finding_citations"
                      ? "Matching claims to their citation markers"
                      : stage === "verifying"
                        ? "Looking up each reference and comparing it with the claim"
                        : stage === "building_report"
                          ? "Calculating trust score and building your report"
                          : "Opening your results…"}
              </p>

              <div className="mt-6">
                <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-2 font-mono text-[11px] text-neutral-500">
                  <span>{pct}%</span>
                  <span>{fmtEta(job?.eta_seconds ?? null)}</span>
                </div>
              </div>
            </section>

            {/* Step indicators */}
            <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STEPS.map((s) => {
                const st = stepState(s.key, stage);
                return (
                  <div key={s.key} className={`card p-4 flex items-center gap-3 ${st === "active" ? "border-black/30" : ""}`}>
                    <span
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${
                        st === "done" ? "bg-emerald-500 text-white" : st === "active" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {st === "done" ? <Check size={13} /> : st === "active" ? <Spinner size={13} /> : <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />}
                    </span>
                    <span className={`text-[13px] font-medium ${st === "pending" ? "text-neutral-400" : "text-primary"}`}>{s.label}</span>
                  </div>
                );
              })}
            </section>

            {/* Live feed */}
            <section className="mt-8 card">
              <div className="px-5 py-3 border-b border-hairline flex items-center justify-between">
                <span className="eyebrow">Live activity</span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> updates every 2s
                </span>
              </div>
              <ul className="max-h-72 overflow-y-auto thin-scroll divide-y divide-hairline">
                {(job?.activity ?? []).length === 0 && (
                  <li className="px-5 py-4 text-[13px] text-neutral-400 flex items-center gap-2">
                    <Spinner size={12} /> Starting up…
                  </li>
                )}
                {job?.activity.map((a) => (
                  <li key={a.id} className="px-5 py-3 flex items-start gap-3 text-[13px] reveal">
                    <span
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                        a.kind === "ok" ? "bg-emerald-50 text-emerald-600" : a.kind === "issue" ? "bg-amber-50 text-amber-600" : "bg-neutral-100 text-primary"
                      }`}
                    >
                      {a.kind === "ok" ? <Check size={11} /> : a.kind === "issue" ? <Alert size={11} /> : <Spinner size={11} />}
                    </span>
                    <span className="text-neutral-700 leading-relaxed">{a.text}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Counters */}
            <section className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: "Claims checked", v: job?.claims_checked ?? 0 },
                { label: "Total claims found", v: job?.total_claims ?? 0 },
                { label: "Issues found", v: job?.issues_found ?? 0, warn: true },
              ].map((c) => (
                <div key={c.label} className="card p-5">
                  <div className={`text-[28px] font-semibold tracking-tight ${c.warn && c.v > 0 ? "text-amber-600" : "text-primary"}`}>{c.v}</div>
                  <div className="text-[12px] text-neutral-500 mt-0.5">{c.label}</div>
                </div>
              ))}
            </section>
          </>
        )}
      </PageShell>
    </Layout>
  );
}
