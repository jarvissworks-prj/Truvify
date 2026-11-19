import { lazy, Suspense, type ReactNode } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout, ProtectedRoute } from "./components/Navbar";
import { PageShell } from "./components/Common";
import { Spinner } from "./components/Icons";
import { LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from "./pages/AuthPages";
import Landing from "./pages/Landing";

// The app pages pull in the document readers and export libraries (pdf.js, docx,
// jsPDF, pptxgenjs, SheetJS). Loading them only when needed keeps the landing
// and login pages fast.
const UploadPage = lazy(() => import("./pages/Upload"));
const ProgressPage = lazy(() => import("./pages/Progress"));
const ResultsPage = lazy(() => import("./pages/Results"));
const ComparePage = lazy(() => import("./pages/Compare"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-[13px] text-neutral-400" role="status" aria-live="polite">
      <Spinner size={16} /> Loading…
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </ProtectedRoute>
  );
}

function NotFound() {
  return (
    <Layout>
      <PageShell>
        <div className="card p-10 text-center">
          <p className="font-mono text-[11px] text-neutral-400">404</p>
          <h1 className="text-[22px] font-semibold text-primary mt-1">Page not found</h1>
          <p className="text-[13px] text-neutral-500 mt-2">The page you were looking for doesn't exist or has moved.</p>
          <Link to="/" className="btn-primary h-10 px-5 text-[13px] mt-6">Go home</Link>
        </div>
      </PageShell>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/upload" element={<Protected><UploadPage /></Protected>} />
      <Route path="/progress/:jobId" element={<Protected><ProgressPage /></Protected>} />
      <Route path="/results/:documentId" element={<Protected><ResultsPage /></Protected>} />
      <Route path="/report/:documentId" element={<Protected><ResultsPage /></Protected>} />
      <Route path="/compare" element={<Protected><ComparePage /></Protected>} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
