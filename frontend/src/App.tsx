import { Route, Routes, BrowserRouter } from "react-router-dom";

import { ApiProvider } from "./api/ApiProvider";
import { AppShell } from "./components/layout";
import { ToastProvider } from "./components/ui";
import { AuthProvider } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { DashboardPage } from "./pages/DashboardPage";
import { EndpointDetailPage } from "./pages/EndpointDetailPage";
import { EndpointsPage } from "./pages/EndpointsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterEndpointPage } from "./pages/RegisterEndpointPage";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/endpoints" element={<EndpointsPage />} />
        <Route path="/endpoints/new" element={<RegisterEndpointPage />} />
        <Route path="/endpoints/:id" element={<EndpointDetailPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ApiProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ApiProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
