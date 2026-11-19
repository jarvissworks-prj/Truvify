import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { DemoBanner, Logo } from "./Common";
import { Eye, EyeOff } from "./Icons";

/** Centered card, no navbar, no footer. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <DemoBanner />
      <div className="relative flex-1 flex items-center justify-center px-4 py-12 overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
        <main className="relative w-full max-w-[400px]">
          {/* The logo paints immediately (first paint); the card fades in. */}
          <div className="flex justify-center mb-7">
            <Logo />
          </div>
          <div className="card shadow-soft p-7 sm:p-8 reveal">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className="input pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-black"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-[13px] px-3.5 py-2.5">
      {children}
    </div>
  );
}
