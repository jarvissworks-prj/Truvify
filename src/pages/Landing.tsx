import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Layout } from "../components/Navbar";
import { Logo } from "../components/Common";
import { MagneticButton } from "../components/MagneticButton";
import { ScrollReveal } from "../components/ScrollReveal";
import { BookOpen, Download, Highlighter, Scale, ShieldCheck, Upload } from "../components/Icons";
import {
  AudienceSection,
  DifferenceSection,
  ExampleSection,
  FaqSection,
  ProblemSection,
  ScaleSection,
  TryItSection,
  TryNowButton,
} from "../components/LandingSections";

// ---------------------------------------------------------------- orbit tiles
type Tile = { pos: string; depth: number; rot: number; dur: number; delay: number; w: string; body: ReactNode };

const Pill = ({ tone, children }: { tone: "g" | "a" | "r"; children: ReactNode }) => {
  const c = tone === "g" ? "bg-emerald-50 text-emerald-700" : tone === "a" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600";
  const d = tone === "g" ? "bg-emerald-500" : tone === "a" ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={`font-mono text-[8px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${c}`}>
      <span className={`w-1 h-1 rounded-full ${d}`} />
      {children}
    </span>
  );
};

const TILES: Tile[] = [
  {
    pos: "left-[22%] top-[8%]", depth: 18, rot: -14, dur: 6.5, delay: 0.2, w: "w-44",
    body: (
      <>
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/[0.06]">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#777]">Claim [2]</span>
          <Pill tone="g">SUPPORTED</Pill>
        </div>
        <div className="space-y-1.5 opacity-80">
          <div className="h-2 bg-neutral-900 rounded-sm w-4/5" />
          <div className="h-1.5 bg-neutral-300 rounded-sm w-full" />
          <div className="h-1.5 bg-neutral-200 rounded-sm w-11/12" />
        </div>
        <div className="mt-2.5 pt-2 border-t border-black/[0.05] flex items-center justify-between font-mono text-[8px]">
          <span className="text-[#999]">Abstract</span>
          <span className="text-neutral-600 font-medium">Strength: High</span>
        </div>
      </>
    ),
  },
  {
    pos: "left-[46%] top-[4%] -translate-x-1/2", depth: 12, rot: 6, dur: 7.8, delay: 1.1, w: "w-36",
    body: (
      <>
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wide text-neutral-500">Trust score</span>
          <span className="font-mono text-[9px] text-emerald-600 font-medium">82</span>
        </div>
        <svg className="w-full h-9 overflow-visible" viewBox="0 0 100 40">
          <path d="M0,36 Q20,34 38,24 T75,10 T100,4" fill="none" stroke="#10B981" strokeLinecap="round" strokeWidth="2" />
          <path d="M0,36 Q20,34 38,24 T75,10 T100,4 L100,40 L0,40 Z" fill="rgba(16,185,129,0.08)" />
          <circle cx="75" cy="10" fill="#10B981" r="2.5" />
        </svg>
        <span className="font-mono text-[8px] text-[#888] mt-1 block">v1 → v2 improved</span>
      </>
    ),
  },
  {
    pos: "right-[20%] top-[6%]", depth: 22, rot: 16, dur: 6.8, delay: 2.0, w: "w-48",
    body: (
      <>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-700 font-semibold">Evidence found</span>
        </div>
        <p className="text-[11px] leading-[15px] text-neutral-700">
          "…LDL-C was lowered by{" "}
          <span className="bg-emerald-100/90 text-emerald-950 px-1 py-0.5 rounded font-mono text-[10px] font-medium border-b border-emerald-400">30–49%</span>{" "}
          with moderate-intensity statins."
        </p>
      </>
    ),
  },
  {
    pos: "right-[5%] top-[18%]", depth: 28, rot: -11, dur: 8.2, delay: 2.9, w: "w-44",
    body: (
      <>
        <span className="font-mono text-[8px] text-[#888] block uppercase tracking-wider">Lookup chain</span>
        <span className="text-[12px] font-semibold text-primary block mt-0.5 tracking-tight">DOI → Crossref → OpenAlex</span>
        <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-neutral-500 pt-1.5 border-t border-black/[0.05]">
          <span>+ TITLE MATCH</span>
          <span className="text-emerald-600 font-medium">✓ MATCHED</span>
        </div>
      </>
    ),
  },
  {
    pos: "right-[4%] top-[42%]", depth: 24, rot: 14, dur: 6.5, delay: 0.2, w: "w-40",
    body: (
      <>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">Citation graph</span>
          <span className="font-mono text-[8px] text-neutral-500">k=12</span>
        </div>
        <div className="h-14 w-full flex items-center justify-center bg-neutral-50/80 rounded-lg border border-black/[0.04]">
          <svg className="w-full h-full" viewBox="0 0 120 60">
            {[[25, 30, 60, 15], [60, 15, 95, 30], [60, 15, 60, 45], [25, 30, 60, 45], [60, 45, 95, 30]].map(([a, b, c, d], i) => (
              <line key={i} stroke="#D4D4D4" strokeWidth="1.2" x1={a} y1={b} x2={c} y2={d} />
            ))}
            <circle cx="25" cy="30" fill="#10B981" r="3" />
            <circle cx="60" cy="15" fill="#0A0A0A" r="4.5" />
            <circle cx="95" cy="30" fill="#10B981" r="3" />
            <circle cx="60" cy="45" fill="#F59E0B" r="3.5" />
          </svg>
        </div>
      </>
    ),
  },
  {
    pos: "right-[7%] top-[65%]", depth: 16, rot: -18, dur: 7.8, delay: 1.1, w: "w-48",
    body: (
      <>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[9px] text-[#777] uppercase tracking-wider">Claim [1]</span>
          <Pill tone="a">PARTLY</Pill>
        </div>
        <p className="text-[11px] leading-[15px] text-neutral-600">
          "Claim says 40%, source reports{" "}
          <span className="bg-amber-100/90 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px]">22%</span> in a narrower group."
        </p>
      </>
    ),
  },
  {
    pos: "right-[20%] bottom-[6%]", depth: 20, rot: 10, dur: 6.8, delay: 2.0, w: "w-40",
    body: (
      <>
        <div className="flex justify-between items-center mb-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">Verdicts</span>
          <span className="font-mono text-[8px] text-emerald-600 font-semibold">8 CLAIMS</span>
        </div>
        <div className="flex items-end gap-1.5 h-10 pt-1 px-1">
          {["bg-emerald-500 h-[92%]", "bg-amber-500 h-[55%]", "bg-orange-400 h-[30%]", "bg-red-500 h-[30%]", "bg-neutral-300 h-[30%]", "bg-red-700 h-[20%]"].map((c, i) => (
            <div key={i} className={`w-3 rounded-t ${c}`} />
          ))}
        </div>
      </>
    ),
  },
  {
    pos: "left-[52%] bottom-[4%]", depth: 14, rot: -7, dur: 8.2, delay: 2.9, w: "w-44",
    body: (
      <>
        <div className="flex items-center justify-between pb-1.5 border-b border-black/[0.05]">
          <span className="font-mono text-[8px] uppercase tracking-wider text-neutral-500">Confidence</span>
          <span className="font-mono text-[8px] text-[#888]">3-part</span>
        </div>
        <div className="font-mono text-[9px] space-y-1 mt-1.5 text-neutral-700">
          <div className="flex justify-between"><span>Strength</span><span className="text-emerald-600 font-semibold">High</span></div>
          <div className="flex justify-between"><span>Source</span><span>Abstract</span></div>
        </div>
      </>
    ),
  },
  {
    pos: "left-[31%] bottom-[5%]", depth: 26, rot: 18, dur: 6.5, delay: 0.2, w: "w-44",
    body: (
      <>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600 font-medium">DOI check</span>
        </div>
        <p className="text-[10px] leading-snug font-mono text-neutral-600">doi:10.5555/demo.2022</p>
        <div className="mt-1.5 text-[9px] font-medium text-emerald-600">✓ Resolves</div>
      </>
    ),
  },
  {
    pos: "left-[12%] bottom-[12%]", depth: 18, rot: -15, dur: 7.8, delay: 1.1, w: "w-48",
    body: (
      <>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[9px] text-[#777] uppercase tracking-wider">Claim [7]</span>
          <Pill tone="r">FABRICATED?</Pill>
        </div>
        <p className="text-[11px] leading-[15px] text-neutral-600">
          "DOI, journal and title{" "}
          <span className="bg-red-50 text-red-900 border-b border-red-300 px-1 rounded font-mono text-[10px]">3 of 3 failed</span>."
        </p>
      </>
    ),
  },
  {
    pos: "left-[4%] top-[58%]", depth: 24, rot: 11, dur: 6.8, delay: 2.0, w: "w-44",
    body: (
      <>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[8px] uppercase tracking-wider text-neutral-500">Date check</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        </div>
        <div className="font-mono text-[11px] text-primary font-medium">1952 → 1948</div>
        <div className="mt-2 pt-1.5 border-t border-black/[0.05] flex items-center justify-between text-[9px] font-mono text-neutral-500">
          <span>CONFLICT</span>
          <span className="text-neutral-800 font-semibold">FIXED</span>
        </div>
      </>
    ),
  },
  {
    pos: "left-[5%] top-[34%]", depth: 15, rot: -18, dur: 8.2, delay: 2.9, w: "w-40",
    body: (
      <>
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">Outdated</span>
          <span className="font-mono text-[8px] text-amber-600 font-medium">2013</span>
        </div>
        <div className="h-12 w-full bg-neutral-50 rounded-lg p-1.5 border border-black/[0.04]">
          <svg className="w-full h-full" viewBox="0 0 100 50">
            <line stroke="#E5E5E5" x1="10" x2="90" y1="45" y2="45" />
            <line stroke="#E5E5E5" x1="10" x2="10" y1="5" y2="45" />
            <line opacity="0.4" stroke="#000" strokeDasharray="2 2" x1="15" x2="85" y1="40" y2="10" />
            {[[20, 38], [32, 33], [45, 27], [58, 22], [70, 18], [82, 11]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2" fill={i > 3 ? "#10B981" : "#0A0A0A"} />
            ))}
          </svg>
        </div>
      </>
    ),
  },
  {
    pos: "left-[6%] top-[13%]", depth: 20, rot: 8, dur: 6.5, delay: 0.2, w: "w-40",
    body: (
      <>
        <div className="h-2 w-16 bg-neutral-900 rounded-sm mb-2" />
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[0, 1].map((k) => (
            <div key={k} className="space-y-1">
              <div className="h-1 bg-neutral-300 rounded-full w-full" />
              <div className="h-1 bg-neutral-200 rounded-full w-4/5" />
              <div className="h-1 bg-neutral-200 rounded-full w-full" />
            </div>
          ))}
        </div>
        <div className="font-mono text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-center font-medium">REPORT READY</div>
      </>
    ),
  },
];

function OrbitTiles() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const d = TILES[i]!.depth;
        el.style.transform = `translate3d(${-x * d}px, ${-y * d}px, 0)`;
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none select-none max-w-[1440px] mx-auto hidden lg:block" aria-hidden>
      {TILES.map((t, i) => (
        <div key={i} ref={(el) => (refs.current[i] = el)} className={`parallax-tile absolute pointer-events-auto ${t.pos}`}>
          <div className="animate-float" style={{ "--rot": `${t.rot}deg`, "--dur": `${t.dur}s`, animationDelay: `${t.delay}s` } as CSSProperties}>
            <div className={`tile-card ${t.w} p-3 bg-white/95 rounded-2xl border border-black/[0.08] shadow-soft backdrop-blur-md`}>
              {t.body}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- page
const STATS = [
  {
    k: "01 / Sources",
    v: "Crossref + OpenAlex",
    d: "Every reference is looked up by DOI, then by title, in two free and open scholarly indexes covering hundreds of millions of works — and checked for retractions and corrections.",
    dots: ["bg-emerald-500"],
  },
  {
    k: "02 / Verdicts",
    v: "6 evidence verdicts",
    d: "From Supported to Likely fabricated — each with the matching evidence quote, the reason, date conflicts, overstated wording and outdated-source alerts.",
    dots: ["bg-emerald-500", "bg-amber-500", "bg-red-500"],
  },
  {
    k: "03 / Domains",
    v: "6 subject domains",
    d: "Medical, Legal, Historical, Geological, Student assignment and General research — each with its own rule for source age. The domain is detected from your text.",
    dots: ["bg-neutral-900"],
  },
];

const STEPS = [
  { label: "Upload your document", d: "PDF, Word, Excel or PowerPoint, up to 20 MB.", icon: Upload },
  { label: "Extract claims and citations", d: "Finds each cited sentence and the reference list: [1], (Smith, 2019), Smith et al. (2019).", icon: Highlighter },
  { label: "Retrieve original papers", d: "Looks each reference up by DOI and title, and flags ones that don't exist.", icon: BookOpen },
  { label: "Compare claim to evidence", d: "Checks numbers, years, negation and overstated wording against the source.", icon: Scale },
  { label: "Fix and download", d: "Trust score, one-click fixes, re-verify, and export to PDF, Word, Excel or PowerPoint.", icon: Download },
];

export default function Landing() {
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) return;
    const el = document.getElementById(loc.hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [loc.hash]);

  return (
    <Layout>
      {/* HERO */}
      <section className="relative w-full flex items-center justify-center overflow-hidden min-h-[calc(100vh-56px)] py-20">
        <div className="absolute inset-0 dot-grid opacity-45 pointer-events-none" />
        <OrbitTiles />

        <div className="relative z-20 flex flex-col items-center text-center px-6 max-w-2xl mx-auto py-12">
          <div className="reveal inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 border border-hairline shadow-[0_1px_2px_rgba(0,0,0,0.02)] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono text-[10px] font-medium tracking-[0.16em] uppercase text-neutral-600">Scientific Citation Verification</span>
          </div>

          <h1 className="reveal reveal-1 text-4xl sm:text-5xl md:text-[58px] font-semibold tracking-[-0.04em] leading-[1.06] text-primary mb-5">
            Does your citation actually support your claim?
          </h1>

          <p className="reveal reveal-2 text-[15px] sm:text-[16px] leading-relaxed text-neutral-500 max-w-lg mb-8">
            Truvify extracts every claim and reference from your document, retrieves the original papers, and checks whether the source truly
            backs up what you wrote.
          </p>

          <div className="reveal reveal-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <MagneticButton distance={0.35}>
              <Link
                to="/upload"
                className="btn-primary h-12 px-7 text-[14px] rounded-full bg-primary text-white hover:bg-neutral-800 shadow-md hover:shadow-lg"
              >
                Verify now
              </Link>
            </MagneticButton>
            <TryNowButton className="btn-outline h-12 px-6 text-[14px] bg-white/90 disabled:opacity-60" />
          </div>
          <p className="reveal reveal-3 mt-3 text-[12px] text-neutral-500">
            Free · no sign-up needed · try the built-in demo paper
          </p>

          <div id="formats" className="reveal reveal-3 mt-7 flex flex-wrap items-center justify-center gap-2 scroll-mt-24">
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 mr-1">Formats</span>
            {["PDF", "DOCX", "XLSX", "PPTX"].map((f) => (
              <span key={f} className="px-2.5 py-1 rounded-full bg-white/90 border border-hairline font-mono text-[11px] font-medium text-neutral-700">
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* BELOW THE FOLD */}
      <div className="w-full bg-surface border-t border-hairline relative z-20">
        <div className="max-w-5xl mx-auto px-6">
          <section id="stats" className="py-16 scroll-mt-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STATS.map((s, i) => (
                <ScrollReveal key={s.k} className="h-full" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}>
                <div className="card p-7 h-full transition-all duration-200 hover:border-black/20 hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-center justify-between mb-4">
                    <span className="eyebrow tracking-wider">{s.k}</span>
                    <div className="flex items-center gap-1">
                      {s.dots.map((d) => (
                        <span key={d} className={`w-1.5 h-1.5 rounded-full ${d}`} />
                      ))}
                    </div>
                  </div>
                  <div className="text-[28px] font-semibold tracking-tight text-primary">{s.v}</div>
                  <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed">{s.d}</p>
                </div>
                </ScrollReveal>
              ))}
            </div>
          </section>

          <ProblemSection />
          <ExampleSection />

          <section id="how-it-works" aria-labelledby="how-title" className="pb-16 border-t border-hairline scroll-mt-16">
            <div className="mb-8 pt-8">
              <span className="eyebrow tracking-[0.18em]">Pipeline</span>
              <h2 id="how-title" className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-primary mt-1">How Truvify works</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {STEPS.map((s, i) => {
                const StepIcon = s.icon;
                return (
                  <ScrollReveal key={s.label} className="h-full" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}>
                  <div
                    className="card p-5 h-full flex flex-col min-h-[176px] transition-all duration-200 hover:border-black/25 hover:-translate-y-0.5 hover:shadow-soft"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-8 h-8 rounded-lg bg-neutral-100/80 border border-hairline flex items-center justify-center text-primary">
                        <StepIcon size={15} />
                      </div>
                      <span className="font-mono text-[10px] font-semibold text-neutral-500">STEP 0{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-primary leading-snug">{s.label}</p>
                      <p className="text-[12px] text-neutral-500 leading-snug mt-1">{s.d}</p>
                    </div>
                  </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </section>

          <DifferenceSection />
          <AudienceSection />
          <TryItSection />
          <ScaleSection />

          <section id="privacy" aria-labelledby="privacy-title" className="pb-16 pt-10 border-t border-hairline scroll-mt-16">
            <div className="flex items-center gap-2 mb-1">
              <span className="eyebrow tracking-[0.18em]">Confidentiality & Data Protection</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                <ShieldCheck size={11} /> Privacy by design
              </span>
            </div>
            <h2 id="privacy-title" className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-primary mt-1 mb-2">
              Your unpublished work stays yours
            </h2>
            <p className="text-[14px] text-neutral-500 max-w-2xl mb-8 leading-relaxed">
              Drafts are sensitive. Truvify only sends what it needs to find your sources, and you can delete everything at any time.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-[13px] text-neutral-600 leading-relaxed">
              <ScrollReveal className="h-full" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0 * 0.08 }}>
              <div className="card p-6 h-full bg-white border-hairline">
                <div className="font-semibold text-primary text-[14px] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Checked in your browser
                </div>
                <p>
                  As a guest, your document is read <strong>inside your browser</strong> and stays on this device. Only reference titles and DOIs are sent to Crossref and OpenAlex to find the papers.
                </p>
              </div>
              </ScrollReveal>

              <ScrollReveal className="h-full" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 1 * 0.08 }}>
              <div className="card p-6 h-full bg-white border-hairline">
                <div className="font-semibold text-primary text-[14px] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Encrypted and auto-cleaned
                </div>
                <p>
                  With an account, files travel over HTTPS and are kept in private, encrypted storage. Reports you don't save are set to be deleted after 30 days, and you can delete any document — or your whole account — at any time.
                </p>
              </div>
              </ScrollReveal>

              <ScrollReveal className="h-full" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 2 * 0.08 }}>
              <div className="card p-6 h-full bg-white border-hairline">
                <div className="font-semibold text-primary text-[14px] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Only you can see it
                </div>
                <p>
                  Every row in the database is protected by PostgreSQL row-level security, and files sit in a private folder per user. Only your signed-in account can read, change or export your reports.
                </p>
              </div>
              </ScrollReveal>
            </div>
          </section>

          <FaqSection />
        </div>
      </div>

      <footer className="border-t border-hairline bg-white">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8">
          <div>
            <Logo small />
            <p className="mt-3 text-[12px] text-neutral-500 max-w-md leading-relaxed">
              Automated scientific evidence verification. Designed to assist academic rigor, peer review and citation integrity.
              Truvify is a checking aid — always read the source before you publish.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12px]">
            {[
              ["#problem", "The problem"],
              ["#how-it-works", "How it works"],
              ["#different", "What's new"],
              ["#who", "Who it's for"],
              ["#scale", "Architecture"],
              ["#faq", "FAQ"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-neutral-500 hover:text-black transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-hairline">
          <p className="max-w-5xl mx-auto px-6 py-4 text-[11px] text-neutral-500">
            Data from Crossref and OpenAlex, both free and open scholarly indexes. Statistics above link to their published sources.
          </p>
        </div>
      </footer>
    </Layout>
  );
}
