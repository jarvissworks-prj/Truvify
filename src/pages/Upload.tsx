import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormatIcon, formatBytes, PageShell } from "../components/Common";
import { HaloDropzone } from "../components/HaloDropzone";
import AnimatedBackground from "../components/AnimatedBackground";
import { ArrowRight, Spinner, X } from "../components/Icons";
import { Layout } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { backend } from "../lib/api";
import { ACCEPTED_EXT, BACKEND_MODE, DEMO_MODE, MAX_FILE_BYTES } from "../lib/config";
import { DOMAINS, type Domain } from "../lib/types";

// Descriptions match the rules in src/lib/analysis/pipeline.ts (OUTDATED_AFTER).
const DOMAIN_INFO: Record<Domain, { desc: string; icon: string }> = {
  Medical: { desc: "Clinical and health research. Strictest on age: sources older than 7 years are flagged as outdated.", icon: "✚" },
  Historical: { desc: "History and archives. Checks dates and events; older sources are never marked outdated.", icon: "◷" },
  Geological: { desc: "Earth and environmental science. Sources older than 12 years are flagged as outdated.", icon: "◭" },
  "Student assignment": { desc: "Essays and coursework. Checks that sources exist and match; 12-year outdated limit.", icon: "✎" },
  Legal: { desc: "Law and policy. Checks the cited source; the age of a source is never held against it.", icon: "§" },
  "General research": { desc: "Any other field. Balanced standard; sources older than 10 years are flagged as outdated.", icon: "◎" },
};

export default function UploadPage() {
  const { settings } = useAuth();
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  // Bumping this remounts the dropzone so it returns to its empty state.
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const resetDropzone = () => setDropzoneKey((k) => k + 1);
  const [domain, setDomain] = useState<Domain>(settings.default_domain ?? "General research");
  const [detected, setDetected] = useState<Domain | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const manualPick = useRef(false);

  const accept = async (f: File | undefined) => {
    setStartError("");
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(ACCEPTED_EXT as readonly string[]).includes(ext)) {
      setFile(null);
      resetDropzone();
      return setFileError("Only PDF, DOCX, XLSX, and PPTX files are accepted.");
    }
    if (f.size > MAX_FILE_BYTES) {
      setFile(null);
      resetDropzone();
      return setFileError("File size must be under 20MB.");
    }
    setFileError("");
    setFile(f);
    setDetected(null);
    manualPick.current = false;
    setDetecting(true);
    try {
      const d = await backend.detectDomain(f); // backend reads the first 1000 words
      setDetected(d);
      if (!manualPick.current) setDomain(d);
    } catch {
      /* detection is optional — user can pick manually */
    } finally {
      setDetecting(false);
    }
  };

  const loadDemoPaper = async (name: string, path: string) => {
    try {
      setFileError("");
      const res = await fetch(path);
      const blob = await res.blob();
      const demoFile = new File([blob], name, { type: blob.type || "application/pdf" });
      await accept(demoFile);
    } catch (e) {
      setFileError("Could not load sample paper: " + (e as Error).message);
    }
  };

  const start = async () => {
    if (!file) return;
    setStarting(true);
    setStartError("");
    try {
      const { job_id } = await backend.startVerification(file, domain);
      nav(`/progress/${job_id}`);
    } catch (err) {
      setStartError((err as Error).message);
      setStarting(false);
    }
  };

  return (
    <Layout>
      <PageShell>
        <div className="mb-8 reveal">
          <span className="eyebrow">New verification</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary mt-1">Upload your document</h1>
          <p className="text-[14px] text-neutral-500 mt-1">
            PDF, Word, Excel or PowerPoint · up to 20 MB · checked against{" "}
            {DEMO_MODE || BACKEND_MODE === "browser" ? "Crossref and OpenAlex" : "open research databases"}
          </p>
        </div>

        {/* Upload zone */}
        <HaloDropzone
          key={dropzoneKey}
          accept=".pdf,.docx,.xlsx,.pptx"
          multiple={false}
          emptyLabel="Drag and drop your file here or browse"
          formatHint="PDF, DOCX, XLSX, PPTX up to 20MB"
          successLabel="File selected"
          successResetMs={0}
          onFiles={(files) => accept(files[0])}
        />
        {file && (
          <div className="mt-3 flex items-center gap-3 card px-4 py-3">
            <FormatIcon format={file.name.split(".").pop()} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-primary truncate">{file.name}</p>
              <p className="text-[12px] text-neutral-500 font-mono">{formatBytes(file.size)}</p>
            </div>
            <span className="hidden sm:inline text-[12px] text-neutral-500">Click the box above to replace</span>
            <button
              type="button"
              aria-label="Remove file"
              onClick={() => {
                setFile(null);
                setDetected(null);
                resetDropzone();
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {fileError && (
          <p role="alert" className="mt-2 text-[13px] text-red-600 font-medium">
            {fileError}
          </p>
        )}

        {/* Sample papers quick-select */}
        {!file && (
          <div className="mt-4 p-4 rounded-xl border border-hairline bg-neutral-50/70 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
            <div>
              <p className="font-medium text-neutral-800">Need a sample paper to test?</p>
              <p className="text-[12px] text-neutral-500">
                Try our pre-built draft with real medical citations, dates, and correctable claims.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadDemoPaper("Truvify_Verification_Demo_Paper.pdf", "/demo_papers/Truvify_Verification_Demo_Paper.pdf")}
                className="btn-primary h-8 px-3.5 text-[12px] inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>✚</span> Load Demo Paper (.pdf)
              </button>
              <button
                type="button"
                onClick={() => loadDemoPaper("Soil_Erosion_Essay.docx", "/demo_papers/Soil_Erosion_Essay.docx")}
                className="btn-outline h-8 px-3 text-[12px] inline-flex items-center gap-1.5 bg-white cursor-pointer"
              >
                <span>✎</span> Load Soil Essay (.docx)
              </button>
              <a
                href="/demo_papers/Truvify_Verification_Demo_Paper.pdf"
                download="Truvify_Verification_Demo_Paper.pdf"
                className="btn-outline h-8 px-3 text-[12px] text-neutral-700 bg-white hover:text-black inline-flex items-center gap-1.5 cursor-pointer"
                title="Download demo PDF"
              >
                Download Demo PDF
              </a>
            </div>
          </div>
        )}

        {/* Domain selection */}
        <section className="mt-10">
          <h2 className="text-[16px] font-semibold tracking-tight text-primary">Select document domain</h2>
          <p className="text-[13px] text-neutral-500 mt-0.5 mb-4">The domain sets how strictly source age is judged. We pick one for you from the text — change it if needed.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatedBackground
              enableHover
              className="rounded-2xl bg-neutral-100/90 border border-black/10"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            >
            {DOMAINS.map((d) => {
              const active = d === domain;
              return (
                <button
                  key={d}
                  data-id={d}
                  type="button"
                  onClick={() => {
                    manualPick.current = true;
                    setDomain(d);
                  }}
                  aria-pressed={active}
                  className={`text-left card p-4 transition-all ${
                    active ? "border-[#0A0A0A] ring-1 ring-[#0A0A0A] shadow-lift" : "hover:border-black/25 hover:bg-white/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-primary">
                      <span className="w-6 h-6 rounded-md bg-neutral-50 border border-hairline flex items-center justify-center text-[12px] text-neutral-600">
                        {DOMAIN_INFO[d].icon}
                      </span>
                      {d}
                    </span>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${active ? "border-primary" : "border-neutral-300"}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </span>
                  </div>
                  <p className="text-[12px] text-neutral-500 mt-2 leading-relaxed">{DOMAIN_INFO[d].desc}</p>
                </button>
              );
            })}
            </AnimatedBackground>
          </div>
          <div className="mt-3 min-h-[20px] text-[12px] text-neutral-500 flex items-center gap-2">
            {detecting && (
              <>
                <Spinner size={12} /> Detecting domain from the first 1,000 words…
              </>
            )}
            {!detecting && detected && (
              <span>
                Domain auto-detected as <span className="font-medium text-primary">{detected}</span>. Change if incorrect.
              </span>
            )}
          </div>
        </section>

        {/* Start */}
        <div className="mt-8">
          {startError && (
            <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-[13px] px-3.5 py-2.5">
              {startError}
            </div>
          )}
          <button type="button" disabled={!file || starting} onClick={start} className="btn-primary w-full h-12 text-[14px]">
            {starting ? <Spinner /> : null}
            Start verification
            {!starting && <ArrowRight size={15} />}
          </button>
          <p className="text-center text-[12px] text-neutral-500 mt-3">
            Your file is not stored permanently unless you choose to save your results.
          </p>
        </div>
      </PageShell>
    </Layout>
  );
}
