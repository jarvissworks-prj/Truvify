import { useCallback, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { DemoBanner, Logo, useOutsideClose } from "./Common";
import { Settings, Spinner } from "./Icons";
import { DeleteAccountModal } from "./DeleteAccountModal";

export function Navbar() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const settingsRef = useOutsideClose<HTMLDivElement>(settingsOpen, closeSettings);

  const isDashboard = loc.pathname.startsWith("/dashboard");
  const isVerify = loc.pathname === "/upload" || loc.pathname.startsWith("/progress") || loc.pathname.startsWith("/results");

  const handleLogout = async () => {
    closeSettings();
    await signOut();
    nav("/");
  };

  return (
    <>
      <DemoBanner />
      <header className="no-print sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-hairline">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3">
            {!user ? (
              <>
                {loc.pathname === "/" && (
                  <div className="hidden md:flex items-center gap-1 mr-2 text-[13px]">
                    {[
                      ["#how-it-works", "How it works"],
                      ["#who", "Who it's for"],
                      ["#faq", "FAQ"],
                    ].map(([href, label]) => (
                      <a key={href} href={href} className="px-2.5 py-1.5 rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors">
                        {label}
                      </a>
                    ))}
                  </div>
                )}
                <Link to="/upload" className="btn-primary h-8 px-3.5 sm:px-4 text-[13px] whitespace-nowrap">
                  Verify now
                </Link>
                <Link to="/signup" className="btn-outline h-8 px-3.5 sm:px-4 text-[13px] whitespace-nowrap">
                  Sign up
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Alternating active black pill toggle between Verify now & Dashboard */}
                <div className="inline-flex items-center rounded-full border border-hairline bg-neutral-100 p-0.5 text-[12px] sm:text-[13px]">
                  <Link
                    to="/upload"
                    aria-current={isVerify || !isDashboard ? "page" : undefined}
                    className={`h-7 sm:h-8 px-3 sm:px-4 whitespace-nowrap rounded-full font-medium transition-all duration-200 flex items-center justify-center ${
                      isVerify || !isDashboard
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:text-black"
                    }`}
                  >
                    Verify now
                  </Link>
                  <Link
                    to="/dashboard"
                    aria-current={isDashboard ? "page" : undefined}
                    className={`h-7 sm:h-8 px-3 sm:px-4 whitespace-nowrap rounded-full font-medium transition-all duration-200 flex items-center justify-center ${
                      isDashboard
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:text-black"
                    }`}
                  >
                    Dashboard
                  </Link>
                </div>

                <div className="relative pl-1 border-l border-hairline" ref={settingsRef}>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((o) => !o)}
                    className="p-1.5 text-neutral-500 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors flex items-center justify-center"
                    aria-label="Settings"
                    aria-expanded={settingsOpen}
                  >
                    <Settings size={17} />
                  </button>
                  {settingsOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-hairline shadow-soft py-2 z-50">
                      <div className="px-3.5 py-1.5 select-none">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[12px] font-semibold text-neutral-700 truncate">{user.full_name || "Account"}</p>
                          {user.is_guest && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-hairline shrink-0">
                              Guest
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 truncate">{user.email}</p>
                      </div>
                      <div className="border-t border-hairline my-1.5" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left px-3.5 py-1.5 text-[12px] text-neutral-600 hover:text-black hover:bg-neutral-50 font-medium transition-colors"
                      >
                        {user.is_guest ? "Exit guest session" : "Log out"}
                      </button>
                      {!user.is_guest && (
                        <button
                          type="button"
                          onClick={() => {
                            closeSettings();
                            setDeleteModalOpen(true);
                          }}
                          className="w-full text-left px-3.5 py-1.5 text-[12px] text-red-600 hover:bg-red-50 font-medium transition-colors"
                        >
                          Delete account
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </nav>
        </div>
      </header>
      <DeleteAccountModal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} />
    </>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400">
        <Spinner size={18} />
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <div id="main" tabIndex={-1} className="flex-1 flex flex-col outline-none">
        {children}
      </div>
    </div>
  );
}
