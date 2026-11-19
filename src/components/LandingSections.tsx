// Extra landing-page sections: the problem (with sources), a worked example,
// how Truvify differs, who it helps, how it scales, privacy and FAQ.
// Every statistic here links to its source; every feature claim matches the code.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Transition } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  Check,
  Cpu,
  Database,
  ExternalLink,
  GraduationCap,
  Landmark,
  Lock,
  Microscope,
  Minus,
  Newspaper,
  Plug,
  Stethoscope,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ScrollReveal } from "./ScrollReveal";
import { Spinner } from "./Icons";

const stagger = (i: number): Transition => ({ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 });

export function SectionHeading({ eyebrow, title, intro, id }: { eyebrow: string; title: string; intro?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 pt-8">
      <span className="eyebrow tracking-[0.18em]">{eyebrow}</span>
      <h2 id={id} className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-primary mt-1">
        {title}
      </h2>
      {intro && <p className="text-[14px] text-neutral-500 max-w-2xl mt-2 leading-relaxed">{intro}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ try now
/** Starts a guest session (no sign-up) and opens the upload page. */
export function TryNowButton({ className = "", label = "Try it free — no sign-up" }: { className?: string; label?: string }) {
  const { user, signInAsGuest } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (user) return nav("/upload");
    setBusy(true);
    try {
      await signInAsGuest();
      nav("/upload");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={go} disabled={busy} className={className}>
      {busy ? <Spinner size={14} /> : null}
      {user ? "Open the verifier" : label}
      {!busy && <ArrowRight size={15} />}
    </button>
  );
}

// ------------------------------------------------------------------ problem
const PROBLEM_STATS = [
  {
    v: "1 in 4",
    d: "citations in medical journal articles contain a quotation error — the cited paper does not say what the author claims. About 12% are major errors.",
    src: "Jergas & Baethge, PeerJ (2015) — meta-analysis of 28 studies, 7,321 references",
    href: "https://peerj.com/articles/1364",
  },
  {
    v: "55%",
    d: "of references written by ChatGPT-3.5 for short literature reviews did not exist at all. GPT-4 still invented 18%.",
    src: "Walters & Wilder, Scientific Reports (2023) — 636 references checked",
    href: "https://doi.org/10.1038/s41598-023-41032-5",
  },
  {
    v: "No change",
    d: "in quotation accuracy over the years: an updated review of 46 studies and about 32,000 quotations found no improvement.",
    src: "Baethge & Jergas, Research Integrity and Peer Review (2025)",
    href: "https://kups.ub.uni-koeln.de/80931/",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <SectionHeading
        id="problem-title"
        eyebrow="The problem"
        title="A citation is a promise. Too often, it's broken."
        intro={
          <>
            Readers trust that a cited paper backs up the sentence it is attached to. Checking that by hand means opening every
            source and reading it — hours for one manuscript — so most citations are never checked. With AI writing tools, made-up
            references now slip in as well.
          </>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROBLEM_STATS.map((s, i) => (
          <ScrollReveal key={s.v} className="h-full" transition={stagger(i)}>
            <figure className="card p-6 h-full flex flex-col">
              <div className="text-[34px] font-semibold tracking-tight text-primary leading-none">{s.v}</div>
              <p className="mt-3 text-[13px] text-neutral-600 leading-relaxed flex-1">{s.d}</p>
              <figcaption className="mt-4 pt-3 border-t border-hairline">
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-1.5 text-[11px] text-neutral-500 hover:text-black transition-colors"
                >
                  <ExternalLink size={11} className="mt-0.5 shrink-0" />
                  <span>{s.src}</span>
                </a>
              </figcaption>
            </figure>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ worked example
export function ExampleSection() {
  return (
    <section id="example" aria-labelledby="example-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <SectionHeading
        id="example-title"
        eyebrow="See it work"
        title="One sentence, checked in seconds"
        intro="This sentence is in the demo paper on the upload page. Truvify looks up the cited study, compares the sentence with what the source reports, flags the wrong year and proposes a safe fix."
      />
      <ScrollReveal>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-hairline">
            <div className="p-6">
              <span className="eyebrow">1 · Your sentence</span>
              <p className="mt-3 text-[14px] leading-relaxed text-primary">
                The Framingham Heart Study began enrolling participants in{" "}
                <mark className="bg-red-50 text-red-700 px-1 rounded-sm border-b border-red-300">1952</mark> [2].
              </p>
            </div>
            <div className="p-6 bg-neutral-50/60">
              <div className="flex items-center justify-between gap-2">
                <span className="eyebrow">2 · What the source says</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Partly supported
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">
                The paper covers this topic, but it gives{" "}
                <mark className="bg-emerald-50 text-emerald-800 px-0.5 rounded-sm border-b border-emerald-300">1948</mark>, not 1952.
                Date conflict flagged, with the matching evidence quoted.
              </p>
            </div>
            <div className="p-6">
              <span className="eyebrow">3 · Suggested fix</span>
              <p className="mt-3 text-[14px] leading-relaxed text-primary">
                The Framingham Heart Study began enrolling participants in{" "}
                <mark className="bg-emerald-50 text-emerald-800 px-0.5 rounded-sm border-b border-emerald-300">1948</mark> [2].
              </p>
              <p className="mt-2 text-[12px] text-neutral-500">Apply with one click, re-verify, and download the corrected file.</p>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

// ------------------------------------------------------------------ difference
type Mark = "yes" | "part" | "no";
const TOOLS = ["Truvify", "Reference manager", "Plagiarism checker", "General AI chatbot"] as const;
const ROWS: { label: string; marks: [Mark, Mark, Mark, Mark] }[] = [
  { label: "Confirms each reference really exists (DOI and title lookup)", marks: ["yes", "part", "no", "no"] },
  { label: "Checks that the cited paper supports the sentence", marks: ["yes", "no", "no", "part"] },
  { label: "Shows the exact evidence quote and the reason", marks: ["yes", "no", "no", "no"] },
  { label: "Catches wrong numbers, wrong years and overstated wording", marks: ["yes", "no", "no", "part"] },
  { label: "Flags retracted, corrected and outdated sources", marks: ["yes", "part", "no", "no"] },
  { label: "Suggests a safe fix, re-checks it and exports the corrected file", marks: ["yes", "no", "no", "part"] },
  { label: "Detects copied text", marks: ["no", "no", "yes", "no"] },
];

function MarkIcon({ m, strong }: { m: Mark; strong?: boolean }) {
  if (m === "yes")
    return (
      <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center ${strong ? "bg-primary text-white" : "bg-emerald-50 text-emerald-700"}`}>
        <Check size={13} strokeWidth={2.5} />
        <span className="sr-only">Yes</span>
      </span>
    );
  if (m === "part")
    return (
      <span className="inline-flex px-2 h-6 rounded-full items-center justify-center bg-amber-50 text-amber-700 text-[10px] font-mono font-semibold">
        PARTLY
      </span>
    );
  return (
    <span className="inline-flex w-6 h-6 rounded-full items-center justify-center text-neutral-300">
      <Minus size={14} />
      <span className="sr-only">No</span>
    </span>
  );
}

export function DifferenceSection() {
  return (
    <section id="different" aria-labelledby="different-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <SectionHeading
        id="different-title"
        eyebrow="What's new"
        title="Not a formatter. Not a plagiarism check. An evidence check."
        intro="Existing tools tell you whether a reference is formatted correctly or whether text was copied. Truvify answers a different question: does the source actually say what you say it says?"
      />
      <ScrollReveal>
        <div className="card relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="sr-only">Comparison of Truvify with other kinds of tools</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="px-5 py-4 font-medium text-neutral-500 text-[12px]">What it does</th>
                {TOOLS.map((t) => (
                  <th
                    key={t}
                    scope="col"
                    className={`px-3 py-4 text-center text-[12px] font-semibold ${t === "Truvify" ? "text-primary bg-neutral-50" : "text-neutral-500 font-medium"}`}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-hairline last:border-0">
                  <th scope="row" className="px-5 py-3.5 font-normal text-neutral-700 leading-snug">{r.label}</th>
                  {r.marks.map((m, i) => (
                    <td key={i} className={`px-3 py-3.5 text-center ${i === 0 ? "bg-neutral-50" : ""}`}>
                      <MarkIcon m={m} strong={i === 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollReveal>
      <p className="sm:hidden mt-2 text-[11px] text-neutral-500">Swipe the table sideways to compare all tools →</p>
      <p className="mt-3 text-[12px] text-neutral-500">
        Truvify works alongside your reference manager and plagiarism checker — it fills the gap between them.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ audience / impact
const AUDIENCE = [
  { icon: GraduationCap, t: "Students & teachers", d: "Catch made-up or misread sources before submitting — and teach good citation habits with a clear, evidence-based report." },
  { icon: Microscope, t: "Researchers", d: "Check a manuscript or grant before it goes out, including references suggested by AI writing tools." },
  { icon: BookOpenCheck, t: "Editors & peer reviewers", d: "Triage a submission in minutes: see which citations are unsupported, retracted or fabricated, with evidence." },
  { icon: Stethoscope, t: "Clinicians & guideline writers", d: "In medicine a wrong number or an outdated study can change care. Medical mode flags sources older than 7 years." },
  { icon: Newspaper, t: "Journalists & fact-checkers", d: "Verify that the study behind a headline actually says what the story claims." },
  { icon: Landmark, t: "Policy & legal writers", d: "Back up every claim in a brief or report with a source you have checked." },
];

export function AudienceSection() {
  return (
    <section id="who" aria-labelledby="who-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <SectionHeading
        id="who-title"
        eyebrow="Impact"
        title="Built for anyone who cites evidence"
        intro="Anyone who writes or reviews with sources can use it. It runs in a web browser on any laptop, works in every field, and uses free, open scholarly databases — so cost is never a barrier."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AUDIENCE.map((a, i) => {
          const Icon = a.icon;
          return (
            <ScrollReveal key={a.t} className="h-full" transition={stagger(i)}>
              <div className="card p-6 h-full transition-all duration-200 hover:border-black/20 hover:-translate-y-0.5 hover:shadow-lift">
                <div className="w-9 h-9 rounded-xl bg-neutral-100/80 border border-hairline flex items-center justify-center text-primary">
                  <Icon size={17} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-primary tracking-tight">{a.t}</h3>
                <p className="mt-1.5 text-[13px] text-neutral-500 leading-relaxed">{a.d}</p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ try it
export function TryItSection() {
  const steps = [
    { n: "01", t: "Continue as guest", d: "No account or email needed." },
    { n: "02", t: "Click “Load Demo Paper”", d: "A sample draft with a wrong date, overstated claims and a made-up reference." },
    { n: "03", t: "Read the report", d: "Trust score, evidence quotes, then auto-correct and re-verify." },
  ];
  return (
    <section id="try" aria-labelledby="try-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <ScrollReveal>
        <div className="mt-12 rounded-3xl bg-primary text-white p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 items-center">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">Try it in under a minute</span>
              <h2 id="try-title" className="text-[26px] sm:text-[30px] font-semibold tracking-tight mt-2 leading-tight">
                See your first verification report in three clicks.
              </h2>
              <TryNowButton className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-white text-primary text-[14px] font-medium hover:bg-neutral-100 transition-colors disabled:opacity-60" />
            </div>
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.n} className="flex items-start gap-4 rounded-2xl bg-white/[0.06] border border-white/10 p-4">
                  <span className="font-mono text-[11px] text-white/50 mt-0.5">{s.n}</span>
                  <div>
                    <p className="text-[14px] font-medium">{s.t}</p>
                    <p className="text-[12px] text-white/60 mt-0.5">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

// ------------------------------------------------------------------ scalability
const PILLARS = [
  {
    icon: Cpu,
    t: "Serverless verification engine",
    d: "Documents are read and checked in the visitor's browser, so more users add no server load. References are looked up three at a time, directly from Crossref and OpenAlex.",
  },
  {
    icon: Plug,
    t: "Swappable backend",
    d: "A documented API contract lets a FastAPI service with an LLM take over the comparison step. Switching is one setting — the interface stays the same.",
  },
  {
    icon: Lock,
    t: "Secure multi-user cloud",
    d: "Supabase Auth, Postgres row-level security, private file storage and Edge Functions with rate limits keep every account isolated as usage grows.",
  },
];
const ROADMAP = [
  "Full-text checking of open-access papers",
  "LLM claim comparison on the server backend",
  "Superscript citation numbers (¹ ²)",
  "Word and Google Docs add-ins",
  "Team workspaces for journals and universities",
  "Public API for publishers and editors",
];

export function ScaleSection() {
  return (
    <section id="scale" aria-labelledby="scale-title" className="pb-16 border-t border-hairline scroll-mt-16">
      <SectionHeading
        id="scale-title"
        eyebrow="Architecture"
        title="Designed to grow from one student to a whole publisher"
        intro="Every part can be scaled or swapped on its own, without changing what users see."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PILLARS.map((p, i) => {
          const Icon = p.icon;
          return (
            <ScrollReveal key={p.t} className="h-full" transition={stagger(i)}>
              <div className="card p-6 h-full">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-neutral-100/80 border border-hairline flex items-center justify-center text-primary">
                    <Icon size={15} />
                  </span>
                  <h3 className="text-[14px] font-semibold text-primary">{p.t}</h3>
                </div>
                <p className="mt-3 text-[13px] text-neutral-500 leading-relaxed">{p.d}</p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      <ScrollReveal>
        <div className="mt-4 card p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
            <span className="eyebrow">Planned next</span>
            <span className="text-[12px] text-neutral-500">Not built yet — the architecture already leaves room for each.</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {ROADMAP.map((r) => (
              <li key={r} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-hairline bg-neutral-50 text-[12px] text-neutral-700">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </ScrollReveal>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { icon: Database, k: "Data sources", v: "Crossref · OpenAlex" },
          { icon: Users, k: "Accounts", v: "Supabase Auth + RLS" },
          { icon: Building2, k: "Formats", v: "PDF · DOCX · XLSX · PPTX" },
          { icon: Cpu, k: "Stack", v: "React · TypeScript · Vite" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.k} className="rounded-2xl border border-hairline bg-white px-3 py-4">
              <Icon size={15} className="mx-auto text-neutral-500" />
              <p className="eyebrow mt-2">{s.k}</p>
              <p className="text-[12px] font-medium text-primary mt-1">{s.v}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ FAQ
const FAQ = [
  {
    q: "Is Truvify an AI that could make things up?",
    a: "No. Verdicts come from a transparent comparison against the real abstract fetched from Crossref and OpenAlex — numbers, years, negation and wording. Every verdict shows the evidence quote and the reason, so you can check it yourself. The optional “Ask about this report” chat for signed-in users uses Google Gemini and is limited to the facts in your report.",
  },
  {
    q: "How accurate is it?",
    a: "It checks each claim against the source's abstract, not the full paper, so treat “Partly supported” and “Not found” as prompts to look closer. You can override any verdict, and every result links to the source. If the databases can't be reached, claims are marked “Not found” — never “Fabricated”.",
  },
  {
    q: "What happens to my document?",
    a: "As a guest, your file is read inside your browser and stays on this device; only reference titles and DOIs are sent to Crossref and OpenAlex. With an account, files are stored in private storage that only you can read, and you can delete them — or your whole account — at any time.",
  },
  {
    q: "Which files and citation styles work?",
    a: "PDF (with selectable text), Word, Excel and PowerPoint, up to 20 MB. Numbered citations like [1], [1, 2] and [4–6], and author–year citations like (Smith, 2019) and Smith et al. (2019). Scanned PDFs and superscript numbers are not supported yet.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="pb-20 border-t border-hairline scroll-mt-16">
      <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions people ask" />
      <div className="card divide-y divide-hairline">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[14px] font-medium text-primary [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-neutral-500 transition-transform group-open:rotate-45 text-[18px] leading-none" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed max-w-3xl">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
