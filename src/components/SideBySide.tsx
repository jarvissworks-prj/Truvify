import { useMemo } from "react";
import { diffWords, type DiffToken } from "../lib/diffWords";

interface SideBySideProps {
  claimText: string;
  sourceText: string;
}

function renderTokens(tokens: DiffToken[]) {
  return tokens.map((token, idx) => {
    if (token.kind === "diff-number") {
      return (
        <span
          key={idx}
          className="bg-red-100 text-red-950 font-semibold px-1 py-0.5 rounded mx-0.5"
          title="Differing number"
        >
          {token.text}
        </span>
      );
    }
    if (token.kind === "diff-claim") {
      return (
        <span
          key={idx}
          className="bg-amber-100 text-amber-950 px-1 py-0.5 rounded mx-0.5"
          title="Appears only in your document"
        >
          {token.text}
        </span>
      );
    }
    if (token.kind === "diff-source") {
      return (
        <span
          key={idx}
          className="bg-emerald-100 text-emerald-950 px-1 py-0.5 rounded mx-0.5"
          title="Appears only in source paper"
        >
          {token.text}
        </span>
      );
    }
    return <span key={idx}>{token.text}</span>;
  });
}

export function SideBySide({ claimText, sourceText }: SideBySideProps) {
  const { claimTokens, sourceTokens } = useMemo(
    () => diffWords(claimText, sourceText),
    [claimText, sourceText],
  );

  return (
    <div className="space-y-2 mt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px] leading-relaxed">
        {/* Left Column: Your document */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Your document
            </span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-hairline min-h-[64px] text-neutral-800">
            {renderTokens(claimTokens)}
          </div>
        </div>

        {/* Right Column: Source paper */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Source paper
            </span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-hairline min-h-[64px] text-neutral-800">
            {renderTokens(sourceTokens)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-200" /> Differing number
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200" /> Only in your document
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> Only in source paper
        </span>
      </div>
    </div>
  );
}

export default SideBySide;
