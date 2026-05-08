import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/router/ProtectedRoute";
import { AppShell } from "@/components/shell/AppShell";

export const Route = createFileRoute("/_app")({
  component: () => (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  ),
});
