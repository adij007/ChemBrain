import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

export interface TimelineEvent {
  label: string;
  timestamp: string;
  status?: 'done' | 'pending' | 'warn';
  detail?: string;
}

export function AuditTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e, i) => {
        const Icon = e.status === 'warn' ? AlertTriangle : e.status === 'pending' ? Circle : CheckCircle2;
        const color = e.status === 'warn' ? 'text-risk-flag' : e.status === 'pending' ? 'text-muted-foreground' : 'text-confidence-high';
        return (
          <li key={i} className="relative">
            <Icon className={`absolute -left-7 top-0.5 size-4 ${color}`} />
            <div className="text-sm font-medium">{e.label}</div>
            <div className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</div>
            {e.detail && <div className="mt-1 text-xs text-muted-foreground">{e.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}
