import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  return <Navigate to={user ? "/research" : "/signin"} />;
}
