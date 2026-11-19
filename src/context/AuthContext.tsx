import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_MODE, supabase } from "../lib/config";
import type { UserSettings } from "../lib/types";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  is_guest?: boolean;
}

interface AuthValue {
  user: AppUser | null;
  loading: boolean;
  settings: UserSettings;
  signIn(email: string, password: string): Promise<void>;
  signUp(fullName: string, email: string, password: string): Promise<void>;
  signInAsDemo(): Promise<void>;
  signInAsGuest(): Promise<void>;
  resendVerification(email: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
}

const DEFAULT_SETTINGS: UserSettings = { confidence_threshold: 70, default_domain: null, default_export: "pdf" };
const DEMO_USER_KEY = "truvify_demo_user";
const DEMO_PENDING_KEY = "truvify_demo_pending";
const GUEST_USER_KEY = "truvify_guest_session";

const Ctx = createContext<AuthValue | null>(null);

function fromSupabase(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AppUser {
  const meta = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? "",
    full_name: (meta.full_name as string) || (meta.name as string) || (u.email ?? "").split("@")[0],
    is_guest: Boolean(meta.is_guest),
  };
}

function settingsFrom(meta: Record<string, unknown> | undefined): UserSettings {
  const s = (meta?.truvify_settings as Partial<UserSettings>) ?? {};
  return { ...DEFAULT_SETTINGS, ...s };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for active guest session
    try {
      const guestRaw = localStorage.getItem(GUEST_USER_KEY);
      if (guestRaw) {
        const parsed = JSON.parse(guestRaw);
        setUser(parsed);
        setLoading(false);
        return;
      }
    } catch {
      /* ignore */
    }

    // 2. Demo mode
    if (DEMO_MODE) {
      try {
        const raw = localStorage.getItem(DEMO_USER_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setUser(parsed.user);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
      return;
    }

    // 3. Detect and exchange PKCE `?code=` if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (code) {
      supabase!.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data.session?.user) {
          const u = data.session.user;
          setUser(fromSupabase(u));
          setSettings(settingsFrom(u.user_metadata));
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      });
    }

    // 4. Load existing session
    supabase!.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? fromSupabase(u) : null);
      setSettings(settingsFrom(u?.user_metadata));
      setLoading(false);
    });

    // 5. Listen to auth state transitions
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, session) => {
      // Don't overwrite if guest session is active
      if (localStorage.getItem(GUEST_USER_KEY)) return;
      const u = session?.user;
      setUser(u ? fromSupabase(u) : null);
      setSettings(settingsFrom(u?.user_metadata));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const persistDemo = (u: AppUser | null, s: UserSettings) => {
    if (u) localStorage.setItem(DEMO_USER_KEY, JSON.stringify({ user: u, settings: s }));
    else localStorage.removeItem(DEMO_USER_KEY);
  };

  const signIn = useCallback(
    async (email: string, password: string) => {
      localStorage.removeItem(GUEST_USER_KEY);

      if (DEMO_MODE) {
        if (!email || password.length < 1) throw new Error("Invalid email or password.");
        const pending = JSON.parse(localStorage.getItem(DEMO_PENDING_KEY) || "null");
        const u: AppUser = {
          id: "demo-user",
          email,
          full_name: pending?.email === email ? pending.full_name : email.split("@")[0],
        };
        setUser(u);
        persistDemo(u, settings);
        return;
      }

      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("confirm") || msg.includes("email not confirmed")) {
          throw new Error("Please confirm your email first — resend link");
        }
        if (msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
          throw new Error("Incorrect email or password.");
        }
        if (msg.includes("rate") || msg.includes("too many requests")) {
          throw new Error("Too many login attempts. Please wait a few minutes and try again.");
        }
        throw new Error(error.message);
      }
    },
    [settings],
  );

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    localStorage.removeItem(GUEST_USER_KEY);

    if (DEMO_MODE) {
      localStorage.setItem(DEMO_PENDING_KEY, JSON.stringify({ email, full_name: fullName }));
      return;
    }
    const { error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signInAsGuest = useCallback(async () => {
    const guestUser: AppUser = {
      id: "guest-user",
      email: "guest@truvify.app",
      full_name: "Guest Researcher",
      is_guest: true,
    };
    setUser(guestUser);
    try {
      localStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
    } catch {
      /* ignore */
    }
  }, []);

  const signInAsDemo = useCallback(async () => {
    localStorage.removeItem(GUEST_USER_KEY);

    if (DEMO_MODE) {
      const u: AppUser = { id: "demo-user", email: "demo@truvify.app", full_name: "Demo User" };
      setUser(u);
      persistDemo(u, settings);
      return;
    }
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL;
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;
    if (!demoEmail || !demoPassword) {
      throw new Error("Demo account is not set up.");
    }
    const { error } = await supabase!.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
    if (error) throw new Error(error.message);
  }, [settings]);

  const resendVerification = useCallback(async (email: string) => {
    if (DEMO_MODE) return;
    const { error } = await supabase!.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (DEMO_MODE) {
      return;
    }
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (DEMO_MODE) {
      return;
    }
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(GUEST_USER_KEY);
    if (DEMO_MODE) {
      setUser(null);
      persistDemo(null, settings);
      return;
    }
    setUser(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, [settings]);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (DEMO_MODE || localStorage.getItem(GUEST_USER_KEY)) {
        persistDemo(user, next);
        return;
      }
      const { error } = await supabase!.auth.updateUser({ data: { truvify_settings: next } });
      if (error) throw new Error(error.message);
    },
    [settings, user],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      settings,
      signIn,
      signUp,
      signInAsDemo,
      signInAsGuest,
      resendVerification,
      resetPassword,
      updatePassword,
      signOut,
      updateSettings,
    }),
    [
      user,
      loading,
      settings,
      signIn,
      signUp,
      signInAsDemo,
      signInAsGuest,
      resendVerification,
      resetPassword,
      updatePassword,
      signOut,
      updateSettings,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
