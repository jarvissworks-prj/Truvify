import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DEMO_MODE } from "../lib/config";
import type { Verdict } from "../lib/types";
import { VERDICTS } from "../lib/verdicts";
import { ChevronDown, X } from "./Icons";

export function Logo({ to = "/", small = false }: { to?: string; small?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 group shrink-0" aria-label="Truvify home">
      <div className="w-7 h-7 flex items-center justify-center bg-gradient-to-br from-neutral-900 to-black rounded-lg text-white shadow-sm ring-1 ring-black/10 group-hover:scale-105 group-hover:shadow transition-all">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-white">
          <path
            d="M12 2L4 5.5v6.2c0 5.2 3.4 10.1 8 11.3 4.6-1.2 8-6.1 8-11.3V5.5L12 2z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-90"
          />
          <path
            d="M8.5 12.2l2.3 2.3 4.7-4.8"
            stroke="#10B981"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[15px] tracking-tight leading-none text-primary">Truvify</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        {!small && <span className="hidden sm:block text-[10px] text-neutral-400 tracking-tight mt-0.5">Scientific citation verification</span>}
      </div>
    </Link>
  );
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const m = VERDICTS[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${m.pill} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${verdict === "likely_fabricated" ? "bg-white" : m.dot}`} />
      {m.label}
    </span>
  );
}

/** Small "More ▾" disclosure used on cards. */
export function MoreDisclosure({ children, label = "More" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 hover:text-black transition-colors"
        aria-expanded={open}
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-3 reveal">{children}</div>}
    </div>
  );
}

/** Dropdown menu that closes on outside click. */
export function useOutsideClose<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

export function Modal({
  open,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} card shadow-soft p-6 reveal max-h-[90vh] flex flex-col my-auto`}>
        <button onClick={onClose} className="absolute right-4 top-4 text-neutral-400 hover:text-black z-10" aria-label="Close">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DemoBanner() {
  const { user } = useAuth();
  const isGuest = user?.is_guest;
  if (!DEMO_MODE && !isGuest) return null;
  return (
    <div role="note" className="no-print w-full bg-primary text-white text-center text-[11px] py-1.5 px-3 font-mono tracking-wide">
      {isGuest
        ? "GUEST MODE · your files are checked inside this browser · sign up to save reports to your account"
        : "DEMO MODE · your files are checked inside this browser · nothing is uploaded to a server"}
    </div>
  );
}

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={`flex-1 w-full mx-auto px-6 py-10 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>{children}</main>;
}

export function FormatIcon({ format }: { format: string | null | undefined }) {
  const f = (format ?? "").toLowerCase();
  const color =
    f === "pdf" ? "bg-red-50 text-red-600 border-red-100" :
    f === "docx" ? "bg-blue-50 text-blue-600 border-blue-100" :
    f === "xlsx" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
    f === "pptx" ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-neutral-100 text-neutral-500 border-neutral-200";
  return (
    <span className={`inline-flex items-center justify-center w-10 h-6 rounded-md border font-mono text-[9px] font-semibold uppercase ${color}`}>
      {f || "file"}
    </span>
  );
}

export const formatBytes = (b: number | null | undefined) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
