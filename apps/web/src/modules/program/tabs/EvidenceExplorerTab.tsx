import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllEvidence, fetchCandidates } from '@/api/research';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EvidenceTag } from '@/components/common/EvidenceTag';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { ApiErrorBanner } from '@/components/common/ApiErrorBanner';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { EvidenceTrace } from '@/types';

export function EvidenceExplorerTab() {
  const [filter, setFilter] = useState<string[]>([]);
  const [open, setOpen] = useState<EvidenceTrace | null>(null);
  const evQ = useQuery({ queryKey: ['all-evidence'], queryFn: fetchAllEvidence });
  const candQ = useQuery({
    queryKey: ['candidates', {}],
    queryFn: async () => (await fetchCandidates()).candidates,
  });
  const candById = Object.fromEntries((candQ.data ?? []).map((c) => [c.id, c]));

  const filtered = (evQ.data ?? []).filter((e) => !filter.length || (filter.includes('uncertain') && e.uncertaintyFlag) || (filter.includes('certain') && !e.uncertaintyFlag));

  return (
    <div className="space-y-4">
      {evQ.isError && <ApiErrorBanner error={evQ.error} title="Evidence load failed" />}
      {candQ.isError && <ApiErrorBanner error={candQ.error} title="Candidate metadata failed" />}
      <div className="flex items-center justify-between">
        <div>
          <ToggleGroup type="multiple" value={filter} onValueChange={setFilter}>
            <ToggleGroupItem value="certain">Certain</ToggleGroupItem>
            <ToggleGroupItem value="uncertain">Uncertain only</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} traces</span>
      </div>

      <Card className="p-0">
        <ScrollArea className="h-[60vh]">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Candidate</th>
                <th className="p-3 font-medium">Citation</th>
                <th className="p-3 font-medium">Retrieved</th>
                <th className="p-3 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const c = candById[e.candidateId];
                return (
                  <tr key={e.id} className="border-b cursor-pointer hover:bg-accent/40" onClick={() => setOpen(e)}>
                    <td className="p-3"><EvidenceTag source={e.sourceType} /></td>
                    <td className="p-3 font-medium">{c?.name ?? `Candidate ${e.candidateId.slice(0, 8)}`}</td>
                    <td className="p-3 text-muted-foreground max-w-md whitespace-normal break-words">{e.citation}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(e.retrievedAt).toLocaleDateString()}</td>
                    <td className="p-3">{e.uncertaintyFlag && <AlertTriangle className="size-4 text-risk-flag" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && !evQ.isLoading && !evQ.isError && (
            <div className="p-6 text-sm text-muted-foreground">No evidence traces match the current filter.</div>
          )}
        </ScrollArea>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Citation</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4">
              <div className="flex items-center gap-2"><EvidenceTag source={open.sourceType} />{open.uncertaintyFlag && <AlertTriangle className="size-4 text-risk-flag" />}</div>
              <p className="text-sm">{open.citation}</p>
              {open.url && <a href={open.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ExternalLink className="size-3" />Open source</a>}
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Provenance</h4>
                <AuditTimeline events={[
                  { label: 'Source retrieved', timestamp: open.retrievedAt, status: 'done' },
                  { label: 'Linked to candidate', timestamp: open.retrievedAt, status: 'done' },
                  { label: 'Quality review', timestamp: open.retrievedAt, status: open.uncertaintyFlag ? 'warn' : 'done', detail: open.uncertaintyFlag ? 'Uncertainty flagged' : 'Confirmed' },
                ]} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
