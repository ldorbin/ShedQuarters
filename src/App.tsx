import { Navigate, Outlet, Route, Routes, useOutletContext } from "react-router";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { SettingsProvider } from "./lib/settings";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentEditorPage } from "./pages/DocumentEditorPage";
import { DocumentListPage } from "./pages/DocumentListPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrintPage } from "./pages/PrintPage";
import { SettingsPage } from "./pages/SettingsPage";

export interface ShellContext {
  openMenu: () => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

function RequireAuth() {
  const { state } = useAuth();

  if (state === "checking") {
    return (
      <div className="loading-block">
        <span className="spinner" />
        Loading…
      </div>
    );
  }

  if (state === "signed-out") return <Navigate to="/login" replace />;

  return (
    <SettingsProvider>
      <Outlet />
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        {/* Print view sits outside the shell so it renders chrome-free. */}
        <Route path="/:kindSlug/:id/print" element={<PrintPage />} />

        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/:kindSlug" element={<DocumentListPage />} />
          <Route path="/:kindSlug/new" element={<DocumentEditorPage />} />
          <Route path="/:kindSlug/:id" element={<DocumentEditorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
