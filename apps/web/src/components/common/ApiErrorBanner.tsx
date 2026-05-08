import { AlertTriangle, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { explainApiError } from '@/api/http';

export function ApiErrorBanner({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const explained = explainApiError(error);
  const Icon = explained.title.includes('network') ? WifiOff : AlertTriangle;

  return (
    <Alert variant="destructive">
      <Icon className="size-4" />
      <AlertTitle>{title ?? explained.title}</AlertTitle>
      <AlertDescription>
        <div>{explained.message}</div>
        {explained.remediation && <div className="mt-1 text-xs">{explained.remediation}</div>}
      </AlertDescription>
    </Alert>
  );
}
