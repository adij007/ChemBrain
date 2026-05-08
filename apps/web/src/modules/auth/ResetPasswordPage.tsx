import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const { updatePassword } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Backend reset flow is session-based; allow reset view immediately.
    setReady(true);
  }, []);

  const submit = async () => {
    if (password.length < 6) { toast.error('Min 6 characters'); return; }
    try {
      await updatePassword(password);
      toast.success('Password updated');
      navigate({ to: '/signin' });
    } catch (error: any) {
      toast.error(error?.message ?? "Password update failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 space-y-4">
        <h1 className="text-xl font-semibold">Set new password</h1>
        {!ready && <p className="text-sm text-muted-foreground">Open the reset link from your email to continue.</p>}
        {ready && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="np">New password</Label>
              <Input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button onClick={submit} className="w-full">Update password</Button>
          </>
        )}
      </div>
    </div>
  );
}
