import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold">
            AI Study Companion
          </Link>
          <Link to="/spaces" className="text-sm text-muted-foreground hover:text-foreground">
            Spaces
          </Link>
          {user?.isAdmin && (
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user?.name}</span>
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
