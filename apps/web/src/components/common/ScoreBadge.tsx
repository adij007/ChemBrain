import { cn } from '@/lib/utils';
import { confidenceClass } from '@/lib/format';

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const c = confidenceClass(score);
  return (
    <span
      role="status"
      aria-label={`Confidence ${c.label} ${(score * 100).toFixed(0)} percent`}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums',
        c.bg, c.text, className)}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {(score * 100).toFixed(0)}% · {c.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-confidence-high/10 text-confidence-high',
    medium: 'bg-confidence-mid/15 text-confidence-mid',
    high: 'bg-risk-flag/15 text-risk-flag',
  }[level];
  return <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize', styles)}>{level} risk</span>;
}
