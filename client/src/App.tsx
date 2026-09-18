import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireAdmin } from "@/components/RequireAdmin";
import { AppLayout } from "@/components/AppLayout";
import { AdminPage } from "@/pages/AdminPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { SpacesPage } from "@/pages/SpacesPage";
import { SpaceDetailPage } from "@/pages/SpaceDetailPage";
import { ProjectPage } from "@/pages/ProjectPage";
import { TutorPage } from "@/pages/TutorPage";
import { QuizPage } from "@/pages/QuizPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { HomeDashboardPage } from "@/pages/HomeDashboardPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<HomeDashboardPage />} />
            <Route path="/spaces" element={<SpacesPage />} />
            <Route path="/spaces/:spaceId" element={<SpaceDetailPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/projects/:projectId/tutor" element={<TutorPage />} />
            <Route path="/projects/:projectId/quiz" element={<QuizPage />} />
            <Route path="/projects/:projectId/analytics" element={<AnalyticsPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
