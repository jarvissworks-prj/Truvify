import type { Claim, Flag, Verdict } from "./types";

export interface VerdictMeta {
  label: string;
  dot: string;
  pill: string; // bg + text + border classes
  border: string; // left border for cards
  highlight: string; // highlight view mark colour
}

export const VERDICTS: Record<Verdict, VerdictMeta> = {
  supported: {
    label: "Supported",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    border: "border-l-emerald-500",
    highlight: "bg-emerald-100/80 decoration-emerald-400",
  },
  partly_supported: {
    label: "Partly supported",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    border: "border-l-amber-500",
    highlight: "bg-amber-100/80 decoration-amber-400",
  },
  unsupported: {
    label: "Unsupported",
    dot: "bg-orange-500",
    pill: "bg-orange-50 text-orange-700 border-orange-200",
    border: "border-l-orange-500",
    highlight: "bg-orange-100/80 decoration-orange-400",
  },
  contradicted: {
    label: "Contradicted",
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 border-red-200",
    border: "border-l-red-500",
    highlight: "bg-red-100/80 decoration-red-400",
  },
  not_found: {
    label: "Not found",
    dot: "bg-neutral-400",
    pill: "bg-neutral-100 text-neutral-600 border-neutral-200",
    border: "border-l-neutral-400",
    highlight: "bg-neutral-200/80 decoration-neutral-400",
  },
  likely_fabricated: {
    label: "Likely fabricated",
    dot: "bg-red-600",
    pill: "bg-red-600 text-white border-red-600",
    border: "border-l-red-600",
    highlight: "bg-red-200/80 decoration-red-500",
  },
};

export const VERDICT_ORDER: Verdict[] = [
  "supported",
  "partly_supported",
  "unsupported",
  "contradicted",
  "not_found",
  "likely_fabricated",
];

export const effectiveVerdict = (c: Claim): Verdict => c.user_override_verdict ?? c.verdict;

/** Trust score = (supported×1.0 + partly_supported×0.5) / total × 100 */
export function trustScore(claims: Claim[]): number {
  if (!claims.length) return 0;
  let pts = 0;
  for (const c of claims) {
    const v = effectiveVerdict(c);
    if (v === "supported") pts += 1;
    else if (v === "partly_supported") pts += 0.5;
  }
  return Math.round((pts / claims.length) * 100);
}

export function flagFor(score: number): Flag {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

export const FLAG_META: Record<Flag, { label: string; dot: string; text: string; pill: string }> = {
  green: { label: "Green flag", dot: "bg-emerald-500", text: "text-emerald-700", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  amber: { label: "Amber flag", dot: "bg-amber-500", text: "text-amber-700", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  red: { label: "Red flag", dot: "bg-red-500", text: "text-red-700", pill: "bg-red-50 text-red-700 border-red-200" },
};

const STRENGTH_SCORE = { High: 90, Medium: 60, Low: 30 } as const;

/** Needs review = agent flagged it OR its evidence strength sits under the user's threshold. */
export function needsReview(c: Claim, threshold: number): boolean {
  if (c.needs_human_review) return true;
  if (effectiveVerdict(c) === "supported" && c.user_override_verdict) return false;
  const s = c.evidence_strength ? STRENGTH_SCORE[c.evidence_strength] : 0;
  return s < threshold;
}

/** A claim counts as an "issue" for counters and comparison mode. */
export function isIssue(c: Claim): boolean {
  const v = effectiveVerdict(c);
  return v !== "supported" || c.outdated || !!c.date_conflict;
}

/** Colour used in the highlight view. */
export function highlightClass(c: Claim): string {
  const v = effectiveVerdict(c);
  if (v === "supported" && (c.outdated || c.date_conflict)) return VERDICTS.partly_supported.highlight;
  return VERDICTS[v].highlight;
}
