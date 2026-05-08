import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fetchApiHealth } from '@/api/health';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiErrorBanner } from './ApiErrorBanner';

export function SystemHealthBanner() {
  const healthQ = useQuery({
    queryKey: ['api-health'],
    queryFn: fetchApiHealth,
    refetchInterval: 30_000,
    retry: false,
  });

  if (healthQ.isError) return <ApiErrorBanner error={healthQ.error} title="Backend health check failed" />;
  if (!healthQ.data || healthQ.data.status === 'ok') return null;

  const down = Object.entries(healthQ.data.dependencies ?? {})
    .filter(([, value]: [string, any]) => value?.status && value.status !== 'ok' && value.status !== 'skipped')
    .map(([name, value]: [string, any]) => `${name}: ${value.error ?? value.detail ?? value.status}`);

  return (
    <Alert variant={healthQ.data.ok ? 'default' : 'destructive'}>
      {healthQ.data.ok ? <Activity className="size-4" /> : <AlertTriangle className="size-4" />}
      <AlertTitle>System health: {healthQ.data.status}</AlertTitle>
      <AlertDescription>
        <div className="flex items-center gap-1">
          {healthQ.data.ok && <CheckCircle2 className="size-3" />}
          <span>{healthQ.data.canonicalRuntime}</span>
        </div>
        {down.length > 0 && <div className="mt-1 text-xs">{down.join(' · ')}</div>}
      </AlertDescription>
    </Alert>
  );
}
