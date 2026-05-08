import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { fetchCandidates, fetchAllEvidence, fetchEvidenceForCandidate, fetchSynthesis, fetchSearchSuggestions, saveCandidateToProgram, type CandidateFilters } from '@/api/research';
import { fetchPrograms } from '@/api/program';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/common/DataTable';
import { ApiErrorBanner } from '@/components/common/ApiErrorBanner';
import { ScoreBadge, RiskBadge } from '@/components/common/ScoreBadge';
import { EvidenceTag } from '@/components/common/EvidenceTag';
import { useAuthStore } from '@/store/authStore';
import { can } from '@/lib/rbac';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, Save } from 'lucide-react';
import type { Candidate } from '@/types';
import type { ColumnDef } from '@tanstack/react-table';

const FALLBACK_SEARCH_SUGGESTIONS = ['COVID-19', 'Oncology', 'bacteria', 'virus', 'parasite', 'malaria'];

function DataSourceBadge({ source }: { source?: string }) {
  if (source === 'live_pipeline') return <Badge variant="default">Live Pipeline</Badge>;
  if (source === 'user_import') return <Badge variant="secondary">User Import</Badge>;
  return <Badge variant="outline">Local Seed</Badge>;
}

export function ResearchPage() {
  const { roles } = useAuthStore();
  const routeSearch = useSearch({ from: '/_app/research' }) as { q?: string; target?: string; mechanism?: string };
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CandidateFilters>({
    q: routeSearch.q || undefined,
    target: routeSearch.target || undefined,
    mechanism: routeSearch.mechanism || undefined,
  });
  const [riskLevels, setRiskLevels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [tab, setTab] = useState(routeSearch.q ? 'results' : 'query');

  useEffect(() => {
    const next = {
      q: routeSearch.q || undefined,
      target: routeSearch.target || undefined,
      mechanism: routeSearch.mechanism || undefined,
    };
    setFilters((prev) => {
      if (prev.q === next.q && prev.target === next.target && prev.mechanism === next.mechanism) {
        return prev;
      }
      return next;
    });
    if (routeSearch.q) setTab('results');
  }, [routeSearch.q, routeSearch.target, routeSearch.mechanism]);

  const candidatesQ = useQuery({
    queryKey: ['candidates', filters, riskLevels],
    queryFn: async () => {
      const r = await fetchCandidates({ ...filters, riskLevels: riskLevels.length ? riskLevels : undefined });
      if (r.coreHydrate === 'attempted-error') {
        toast.error('Biomedical core API is unreachable. Start it or configure CORE_API_BASE_URL on the backend.', { id: 'core-hydrate-error' });
      } else if (r.coreHydrate === 'attempted-empty' && r.candidates.length === 0 && (filters.q?.trim() || filters.disease?.trim())) {
        toast.message('No candidates matched in local data or the core pipeline for this query.', { id: 'core-hydrate-empty' });
      }
      return r;
    },
    staleTime: 30_000,
  });
  const candidateRows = candidatesQ.data?.candidates ?? [];
  const suggestionsQ = useQuery({
    queryKey: ['search-suggestions', filters.q ?? ''],
    queryFn: () => fetchSearchSuggestions(filters.q ?? ''),
    staleTime: 60_000,
  });
  const suggestions = suggestionsQ.data?.length
    ? suggestionsQ.data.map((item) => item.value)
    : FALLBACK_SEARCH_SUGGESTIONS;
  const evidenceQ = useQuery({ queryKey: ['all-evidence'], queryFn: fetchAllEvidence, staleTime: 60_000 });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = {
      q: (fd.get('q') as string) || undefined,
      target: (fd.get('target') as string) || undefined,
      mechanism: (fd.get('mechanism') as string) || undefined,
    };
    setFilters(next);
    navigate({ to: '/research', search: next as Record<string, string | undefined>, replace: true });
    setTab('results');
  };

  const columns: ColumnDef<Candidate>[] = [
    { accessorKey: 'name', header: 'Candidate', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'dataSource', header: 'Source', cell: ({ row }) => <DataSourceBadge source={row.original.dataSource} /> },
    { accessorKey: 'target', header: 'Target' },
    { accessorKey: 'diseaseArea', header: 'Disease', cell: ({ row }) => row.original.diseaseArea ?? '—' },
    { accessorKey: 'confidenceScore', header: 'Confidence', cell: ({ row }) => <ScoreBadge score={row.original.confidenceScore} /> },
    { accessorKey: 'riskLevel', header: 'Risk', cell: ({ row }) => <RiskBadge level={row.original.riskLevel} /> },
    { accessorKey: 'mechanism', header: 'Mechanism', cell: ({ row }) => <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">{row.original.mechanism ?? '—'}</span> },
  ];

  // Group evidence by candidate
  const evidenceByCandidate = (evidenceQ.data ?? []).reduce<Record<string, typeof evidenceQ.data>>((acc, e) => {
    (acc[e.candidateId] ||= [] as any).push(e); return acc;
  }, {});
  const candById = Object.fromEntries(candidateRows.map((c) => [c.id, c]));

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Research Workspace</h1>
        <p className="text-sm text-muted-foreground">Build queries, review candidates, and audit evidence.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="query">Query Builder</TabsTrigger>
          <TabsTrigger value="results">Results {candidateRows.length ? `(${candidateRows.length})` : ''}</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
        </TabsList>

        <TabsContent value="query" className="mt-4">
          <Card className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="q">Search (disease, organism, keywords)</Label>
                  <Input
                    id="q"
                    name="q"
                    list="search-suggestions"
                    placeholder="e.g. COVID-19, bacteria, parasite, virus name…"
                    className="mt-1.5"
                    defaultValue={filters.q ?? ''}
                  />
                  <datalist id="search-suggestions">
                    {suggestions.map((d) => <option key={d} value={d} />)}
                  </datalist>
                </div>
                <div>
                  <Label htmlFor="target">Target</Label>
                  <Input id="target" name="target" placeholder="e.g. KRAS G12C" className="mt-1.5" defaultValue={filters.target ?? ''} />
                </div>
                <div>
                  <Label htmlFor="mechanism">Mechanism of action</Label>
                  <Input id="mechanism" name="mechanism" placeholder="e.g. covalent inhibitor" className="mt-1.5" defaultValue={filters.mechanism ?? ''} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Risk filter</Label>
                <ToggleGroup type="multiple" value={riskLevels} onValueChange={setRiskLevels}>
                  <ToggleGroupItem value="low">Low</ToggleGroupItem>
                  <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                  <ToggleGroupItem value="high">High</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <Button type="submit">Run query</Button>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <div className="space-y-3">
            {candidatesQ.isError && <ApiErrorBanner error={candidatesQ.error} title="Search failed" />}
            {candidatesQ.data?.enrichment && candidatesQ.data.enrichment.status !== 'skipped' && (
              <Card className="p-3 text-sm">
                <div className="font-medium">Enrichment: {candidatesQ.data.enrichment.status}</div>
                <div className="text-xs text-muted-foreground">
                  Local matches: {candidatesQ.data.enrichment.localMatches} · Live matches: {candidatesQ.data.enrichment.liveMatches}
                  {candidatesQ.data.enrichment.error ? ` · ${candidatesQ.data.enrichment.error}` : ''}
                </div>
              </Card>
            )}
            <DataTable
              columns={columns}
              data={candidateRows}
              onRowClick={setSelected}
              searchPlaceholder="Filter candidates…"
              emptyMessage={candidatesQ.isLoading ? 'Loading…' : candidatesQ.isError ? 'Search failed. See the error above.' : 'No candidates match these filters.'}
            />
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <Card className="p-2">
            {evidenceQ.isError && <div className="p-4"><ApiErrorBanner error={evidenceQ.error} title="Evidence load failed" /></div>}
            <Accordion type="multiple" className="w-full">
              {Object.entries(evidenceByCandidate).map(([cid, list]) => {
                const c = candById[cid];
                if (!list) return null;
                return (
                  <AccordionItem key={cid} value={cid}>
                    <AccordionTrigger className="px-4">
                      <div className="flex items-center gap-3 text-left">
                        <div>
                          <div className="font-medium">{c?.name ?? `Candidate ${cid.slice(0, 8)}`}</div>
                          <div className="text-xs text-muted-foreground">{c?.target ?? 'Metadata unavailable'} · {list.length} sources</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4">
                      <ul className="space-y-2">
                        {list.map((ev) => (
                          <li key={ev.id} className="flex items-start gap-3 rounded border p-3">
                            <EvidenceTag source={ev.sourceType} />
                            <div className="flex-1 text-sm">{ev.citation}</div>
                            {ev.uncertaintyFlag && (
                              <TooltipProvider><Tooltip>
                                <TooltipTrigger><AlertTriangle className="size-4 text-risk-flag" /></TooltipTrigger>
                                <TooltipContent>Uncertainty flagged on this source</TooltipContent>
                              </Tooltip></TooltipProvider>
                            )}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
              {!Object.keys(evidenceByCandidate).length && <div className="p-6 text-sm text-muted-foreground">No evidence yet.</div>}
            </Accordion>
          </Card>
        </TabsContent>
      </Tabs>

      <CandidateDialog candidate={selected} onClose={() => setSelected(null)} canSave={can(roles, 'research.save')} />
    </div>
  );
}

function CandidateDialog({ candidate, onClose, canSave }: { candidate: Candidate | null; onClose: () => void; canSave: boolean }) {
  const qc = useQueryClient();
  const evidenceQ = useQuery({ queryKey: ['ev', candidate?.id], queryFn: () => fetchEvidenceForCandidate(candidate!.id), enabled: !!candidate });
  const synthesisQ = useQuery({ queryKey: ['syn', candidate?.id], queryFn: () => fetchSynthesis(candidate!.id), enabled: !!candidate });
  const programsQ = useQuery({ queryKey: ['programs'], queryFn: fetchPrograms, enabled: canSave });
  const [program, setProgram] = useState<string>('');

  const save = useMutation({
    mutationFn: () => saveCandidateToProgram(candidate!.id, program),
    onSuccess: () => { toast.success('Saved to program'); qc.invalidateQueries({ queryKey: ['candidates'] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!candidate) return null;

  return (
    <Dialog open={!!candidate} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">{candidate.name} <ScoreBadge score={candidate.confidenceScore} /> <RiskBadge level={candidate.riskLevel} /></DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="mechanism">
          <TabsList>
            <TabsTrigger value="mechanism">Mechanism</TabsTrigger>
            <TabsTrigger value="reaction">Reaction</TabsTrigger>
            <TabsTrigger value="synthesis">Research</TabsTrigger>
            <TabsTrigger value="live">Live Data</TabsTrigger>
            <TabsTrigger value="qa">Quality</TabsTrigger>
            <TabsTrigger value="ev">Evidence ({evidenceQ.data?.length ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="mechanism" className="mt-4 text-sm">
            <div className="mb-2"><DataSourceBadge source={candidate.dataSource} /></div>
            <p className="text-muted-foreground"><strong className="text-foreground">Target:</strong> {candidate.target}</p>
            <p className="mt-2">{candidate.mechanism ?? 'No mechanism rationale recorded.'}</p>
          </TabsContent>
          <TabsContent value="reaction" className="mt-4 text-sm whitespace-pre-line">{synthesisQ.data?.reactionBrief ?? 'No reaction brief.'}</TabsContent>
          <TabsContent value="synthesis" className="mt-4 text-sm whitespace-pre-line">
            {synthesisQ.isError ? <ApiErrorBanner error={synthesisQ.error} title="Synthesis load failed" /> : synthesisQ.data?.researchSummary ?? 'No research synthesis.'}
          </TabsContent>
          <TabsContent value="live" className="mt-4 space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div><strong>Approved for:</strong> {candidate.approvedFor || '—'}</div>
              <div><strong>IC50/Activity:</strong> {candidate.ic50 || '—'}</div>
              <div><strong>Evidence score:</strong> {candidate.evidenceScore ?? '—'}</div>
              <div><strong>Safety:</strong> {candidate.safetyDetail || '—'}</div>
            </div>
            <div>
              <strong>Binding site:</strong>
              <p className="text-muted-foreground mt-1">{candidate.bindingSite || 'No binding-site summary provided.'}</p>
            </div>
            <div>
              <strong>Data confidence:</strong>
              <p className="text-muted-foreground mt-1">{candidate.dataConfidence || 'No confidence annotation provided.'}</p>
            </div>
            <div>
              <strong>Pathogen context:</strong>
              <pre className="mt-1 max-h-40 overflow-auto rounded border bg-muted p-2 text-xs">
                {candidate.pathogenContext ? JSON.stringify(candidate.pathogenContext, null, 2) : 'No pathogen context available.'}
              </pre>
            </div>
            <div>
              <strong>Source URLs:</strong>
              {(candidate.sourceUrls?.length ?? 0) > 0 ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {candidate.sourceUrls?.map((u) => (
                    <li key={u}><a href={u} target="_blank" rel="noreferrer" className="text-primary underline">{u}</a></li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-1">No source links provided.</p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="qa" className="mt-4">
            {synthesisQ.data?.qualityChecks?.length ? (
              <ul className="space-y-2">
                {synthesisQ.data.qualityChecks.map((c, i) => (
                  <li key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span>{c.check}</span>
                    <span className={c.status === 'pass' ? 'text-confidence-high' : c.status === 'warn' ? 'text-confidence-mid' : 'text-confidence-low'}>{c.status.toUpperCase()}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No QA checks recorded.</p>}
          </TabsContent>
          <TabsContent value="ev" className="mt-4 space-y-2">
            {evidenceQ.isError && <ApiErrorBanner error={evidenceQ.error} title="Evidence load failed" />}
            {(evidenceQ.data ?? []).map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded border p-2 text-sm">
                <EvidenceTag source={e.sourceType} />
                <span className="flex-1">{e.citation}</span>
                {e.uncertaintyFlag && <AlertTriangle className="size-4 text-risk-flag" />}
              </div>
            ))}
            {!evidenceQ.data?.length && <p className="text-sm text-muted-foreground">No evidence linked.</p>}
          </TabsContent>
        </Tabs>
        {canSave && (
          <div className="border-t pt-4 flex items-center gap-2">
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Select program…" /></SelectTrigger>
              <SelectContent>{(programsQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => save.mutate()} disabled={!program || save.isPending}>
              <Save className="size-4 mr-2" /> Save to program
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
