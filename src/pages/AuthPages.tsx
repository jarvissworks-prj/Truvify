import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout, FormError, PasswordInput } from "../components/AuthParts";
import { Modal } from "../components/Common";
import { Mail, Spinner } from "../components/Icons";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { DEMO_MODE } from "../lib/config";

// ============================================================ /login
export function LoginPage() {
  const { user, signIn, signInAsDemo, signInAsGuest, resetPassword } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const locFrom = (loc.state as { from?: string } | null)?.from;
  const target = locFrom || "/dashboard";
  const isDemoRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "email" | "demo" | "guest" | "forgot">("");

  // Forgot password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const showDemo = DEMO_MODE || Boolean(import.meta.env.VITE_DEMO_EMAIL);
  const showGoogle = import.meta.env.VITE_ENABLE_GOOGLE === "true";

  useEffect(() => {
    if (user) {
      nav(isDemoRef.current ? "/upload" : target, { replace: true });
    }
  }, [user, nav, target]);

  if (user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("email");
    try {
      await signIn(email.trim(), password);
      nav(target, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const guest = async () => {
    setError("");
    setBusy("guest");
    try {
      await signInAsGuest();
      nav("/upload", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const demo = async () => {
    setError("");
    setBusy("demo");
    isDemoRef.current = true;
    try {
      await signInAsDemo();
      nav("/upload", { replace: true });
    } catch (err) {
      isDemoRef.current = false;
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setBusy("forgot");
    try {
      await resetPassword(forgotEmail.trim());
      setForgotSent(true);
      toast("Password reset instructions sent to your email.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-[22px] font-semibold tracking-tight text-primary">Log in</h1>
      <p className="text-[13px] text-neutral-500 mt-1 mb-6">Welcome back. Verify your citations in minutes.</p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="label !mb-0">
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setForgotEmail(email.trim());
                setForgotSent(false);
                setForgotOpen(true);
              }}
              className="text-[12px] text-neutral-500 hover:text-black underline underline-offset-4"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <FormError>
            {error.includes("confirm your email first") ? (
              <div className="flex flex-col gap-1.5">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => nav("/verify-email", { state: { email: email.trim() } })}
                  className="font-medium underline hover:text-red-900 text-left"
                >
                  Resend confirmation link &rarr;
                </button>
              </div>
            ) : (
              error
            )}
          </FormError>
        )}

        <button type="submit" disabled={!!busy || !email || !password} className="btn-primary w-full h-11 text-[14px]">
          {busy === "email" && <Spinner />} Log in
        </button>

        <div className="relative my-3 flex items-center justify-center">
          <div className="border-t border-hairline w-full" />
          <span className="bg-white px-3 text-[11px] font-mono uppercase tracking-wider text-neutral-500 absolute">
            or
          </span>
        </div>

        <button
          type="button"
          onClick={guest}
          disabled={!!busy}
          className="btn-outline w-full h-11 text-[14px] flex items-center justify-center gap-2 font-medium"
        >
          {busy === "guest" && <Spinner />} Continue as Guest
        </button>
        <p className="text-center text-[12px] text-neutral-500">
          No account needed. Your files are checked in this browser and kept on this device.
        </p>

        {showGoogle && (
          <button
            type="button"
            className="btn-outline w-full h-11 text-[14px] flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        )}

        {showDemo && (
          <div className="pt-1">
            <button
              type="button"
              onClick={demo}
              disabled={!!busy}
              className="btn-outline w-full h-11 text-[14px]"
            >
              {busy === "demo" && <Spinner />} Try the demo
            </button>
            <p className="text-center text-[12px] text-neutral-500 mt-2">
              No account needed. Explores the app with sample data.
            </p>
          </div>
        )}
      </form>

      <p className="text-center text-[13px] text-neutral-500 mt-6">
        Don't have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline underline-offset-4">
          Sign up
        </Link>
      </p>

      {/* Forgot Password Modal */}
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth="max-w-md">
        <h3 className="text-[18px] font-semibold text-primary">Reset your password</h3>
        <p className="text-[13px] text-neutral-500 mt-1 mb-5">
          Enter your account email and we'll send a link to reset your password.
        </p>

        {forgotSent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3 text-primary">
              <Mail size={24} />
            </div>
            <p className="text-[13px] text-neutral-700">Check your inbox for the password reset link.</p>
            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              className="btn-primary h-9 px-4 text-[12px] mt-5"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="label">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                className="input"
                placeholder="you@university.edu"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="btn-outline h-9 px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === "forgot" || !forgotEmail}
                className="btn-primary h-9 px-4 text-[13px]"
              >
                {busy === "forgot" && <Spinner />} Send reset link
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AuthLayout>
  );
}

// ============================================================ /signup
export function SignupPage() {
  const { user, signUp, signInAsGuest } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const guest = async () => {
    setBusy(true);
    try {
      await signInAsGuest();
      nav("/upload", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Please enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Please enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
      nav("/verify-email", { state: { email: form.email.trim() } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tooShort = form.password.length > 0 && form.password.length < 8;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  return (
    <AuthLayout>
      <h1 className="text-[22px] font-semibold tracking-tight text-primary">Create your account</h1>
      <p className="text-[13px] text-neutral-500 mt-1 mb-6">We'll send a link to verify your email.</p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="label">
            Full name
          </label>
          <input
            id="name"
            autoComplete="name"
            className="input"
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            placeholder="you@university.edu"
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.password}
            onChange={set("password")}
          />
          <p className={`mt-1.5 text-[11px] ${tooShort ? "text-red-600" : "text-neutral-500"}`}>
            Minimum 8 characters
          </p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            Confirm password
          </label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.confirm}
            onChange={set("confirm")}
          />
          {mismatch && <p className="mt-1.5 text-[11px] text-red-600">Passwords do not match</p>}
        </div>
        <FormError>{error}</FormError>
        <button type="submit" disabled={busy} className="btn-primary w-full h-11 text-[14px]">
          {busy && <Spinner />} Create account
        </button>

        <div className="relative my-3 flex items-center justify-center">
          <div className="border-t border-hairline w-full" />
          <span className="bg-white px-3 text-[11px] font-mono uppercase tracking-wider text-neutral-500 absolute">
            or
          </span>
        </div>

        <button
          type="button"
          onClick={guest}
          disabled={busy}
          className="btn-outline w-full h-11 text-[14px] flex items-center justify-center gap-2 font-medium"
        >
          Continue as Guest
        </button>
        <p className="text-center text-[12px] text-neutral-500">
          Try Truvify right away — no sign-up, no email.
        </p>
      </form>

      <p className="text-center text-[13px] text-neutral-500 mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-medium hover:underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

// ============================================================ /verify-email
export function VerifyEmailPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { resendVerification, signIn } = useAuth();
  const email = (loc.state as { email?: string } | null)?.email ?? "";
  const [cooldown, setCooldown] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return toast("Go back and sign up again to resend the link.", "error");
    setBusy(true);
    try {
      await resendVerification(email);
      toast("Verification email sent again.", "success");
      setCooldown(60);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-neutral-50 border border-hairline flex items-center justify-center text-primary mb-5">
          <Mail size={30} />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-primary">Check your email</h1>
        <p className="text-[13px] text-neutral-500 mt-2 leading-relaxed">
          We sent a verification link to
          <br />
          <span className="font-medium text-primary">{email || "your email address"}</span>
        </p>
        <p className="text-[12px] text-neutral-500 mt-3">Click the link in the email to activate your account.</p>

        <button onClick={resend} disabled={cooldown > 0 || busy} className="btn-outline w-full h-11 text-[14px] mt-7">
          {busy && <Spinner />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
        </button>

        {DEMO_MODE && (
          <button
            onClick={async () => {
              await signIn(email || "demo@truvify.app", "demo");
              nav("/dashboard");
            }}
            className="mt-3 text-[12px] font-mono text-neutral-500 hover:text-black underline underline-offset-4"
          >
            Demo: simulate clicking the email link
          </button>
        )}

        <p className="text-[13px] text-neutral-500 mt-6">
          <Link to="/login" className="text-primary font-medium hover:underline underline-offset-4">
            Back to login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

// ============================================================ /reset-password
export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      return setError("Password must be at least 8 characters.");
    }
    if (password !== confirm) {
      return setError("Passwords do not match.");
    }

    setBusy(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      toast("Password updated successfully.", "success");
      setTimeout(() => nav("/dashboard", { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-[22px] font-semibold tracking-tight text-primary">Set new password</h1>
      <p className="text-[13px] text-neutral-500 mt-1 mb-6">Enter and confirm your new account password.</p>

      {success ? (
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <p className="text-[14px] font-medium text-primary">Password updated successfully</p>
          <p className="text-[12px] text-neutral-500">Redirecting to your dashboard…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="new-password" className="label">
              New password
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1.5 text-[11px] text-neutral-500">Minimum 8 characters</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="label">
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <FormError>{error}</FormError>

          <button
            type="submit"
            disabled={busy || !password || !confirm}
            className="btn-primary w-full h-11 text-[14px]"
          >
            {busy && <Spinner />} Update password
          </button>

          <p className="text-center text-[13px] text-neutral-500 mt-6">
            <Link to="/login" className="text-primary font-medium hover:underline underline-offset-4">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
