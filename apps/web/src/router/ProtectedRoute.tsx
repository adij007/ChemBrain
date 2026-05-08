import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from '@tanstack/react-router';
import { can, type Action } from '@/lib/rbac';

export function ProtectedRoute({ children, requires }: { children: React.ReactNode; requires?: Action }) {
  const { user, loading, roles } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/signin' });
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return null;
  if (requires && !can(roles, requires)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-semibold">Access denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your current role does not include access to this area.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
