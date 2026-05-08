import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string | number;
  delta?: number;
  detail?: React.ReactNode;
}

export function KpiCard({ label, value, delta, detail }: Props) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
          {delta !== undefined && (
            <div className={cn('flex items-center gap-1 text-xs', positive ? 'text-confidence-high' : 'text-confidence-low')}>
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        {detail && (
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Details <ChevronDown className="size-3" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 text-xs text-muted-foreground">{detail}</CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
