import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Client-side convenience only — redirects non-admins away from /admin so they don't see a
 * confusing 403 response rendered as a page. This is NOT the security boundary: every
 * /api/admin/* route enforces requireAdmin server-side regardless of what this component
 * does, and that server-side check is what actually matters (see SECURITY.md).
 */
export function RequireAdmin() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user?.isAdmin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
