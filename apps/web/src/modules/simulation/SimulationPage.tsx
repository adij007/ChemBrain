import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSimulations, generateSimulation, fetchSimulationDemoHtml } from '@/api/simulation';
import { fetchCandidates } from '@/api/research';
import { useAuthStore } from '@/store/authStore';
import { can } from '@/lib/rbac';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiErrorBanner } from '@/components/common/ApiErrorBanner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Download, FileJson, Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Candidate } from '@/types';

declare global {
  interface Window {
    $3Dmol?: any;
  }
}

let mol3dPromise: Promise<void> | null = null;

function load3Dmol() {
  if (window.$3Dmol) return Promise.resolve();
  if (mol3dPromise) return mol3dPromise;
  mol3dPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-chembrain-3dmol]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('3Dmol viewer script failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://3Dmol.org/build/3Dmol-min.js';
    script.async = true;
    script.dataset.chembrain3dmol = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('3Dmol viewer script failed to load. Check internet access or CSP.'));
    document.head.appendChild(script);
  });
  return mol3dPromise;
}

function pubchemSdfUrl(smiles: string) {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
}

function rcsbPdbUrl(pdbId: string) {
  return `https://files.rcsb.org/download/${encodeURIComponent(pdbId.toUpperCase())}.pdb`;
}

function compactDisplayNarrative(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .split(/\s+/)
    .slice(0, 95)
    .join(' ')
    .trim();
}

function ViewerPanel({
  label,
  detail,
  candidate,
  kind,
}: {
  label: string;
  detail: string;
  candidate: Candidate | null;
  kind: 'drug' | 'protein';
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('Loading 3D viewer...');

  useEffect(() => {
    let cancelled = false;
    let viewer: any = null;

    async function renderStructure() {
      if (!hostRef.current) return;
      const source =
        kind === 'drug'
          ? candidate?.smiles
            ? { url: pubchemSdfUrl(candidate.smiles), format: 'sdf' as const, style: 'stick' as const }
            : null
          : candidate?.pdbId
            ? { url: rcsbPdbUrl(candidate.pdbId), format: 'pdb' as const, style: 'cartoon' as const }
            : null;

      if (!candidate) {
        setStatus('Select a candidate to load a 3D structure.');
        return;
      }
      if (!source) {
        setStatus(kind === 'drug' ? 'No SMILES identifier available for this candidate.' : 'No PDB ID available for this target.');
        return;
      }

      try {
        setStatus(`Fetching ${kind === 'drug' ? 'PubChem SDF' : 'RCSB PDB'}...`);
        await load3Dmol();
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`Structure API returned HTTP ${response.status}.`);
        const structure = await response.text();
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = '';
        viewer = window.$3Dmol.createViewer(hostRef.current, { backgroundColor: '#020617' });
        viewer.addModel(structure, source.format);
        if (source.style === 'stick') {
          viewer.setStyle({}, { stick: { radius: 0.18 }, sphere: { scale: 0.22 } });
        } else {
          viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
          viewer.addStyle({ hetflag: true }, { stick: { radius: 0.18, colorscheme: 'cyanCarbon' } });
        }
        viewer.zoomTo();
        viewer.render();
        setStatus(kind === 'drug' ? 'Real 3D ligand from PubChem' : `Real protein structure from RCSB ${candidate.pdbId}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    renderStructure();
    return () => {
      cancelled = true;
      try { viewer?.clear?.(); } catch { /* noop */ }
    };
  }, [candidate?.id, candidate?.smiles, candidate?.pdbId, kind]);

  return (
    <div className="relative aspect-square rounded-md border bg-slate-950 overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white">{label}</div>
      <div className="absolute right-2 top-2">
        <Badge variant="secondary" className="bg-white/90 text-slate-900">{status.startsWith('Real') ? '3D API' : 'Waiting'}</Badge>
      </div>
      {!status.startsWith('Real') && <div className="absolute left-2 top-10 right-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">{status}</div>}
      <div className="absolute bottom-2 left-2 right-2 rounded bg-black/50 px-2 py-1 text-[11px] text-white truncate">{detail}</div>
    </div>
  );
}

export function SimulationPage() {
  const { roles } = useAuthStore();
  const canRun = can(roles, 'simulation.run');
  const qc = useQueryClient();

  const candidatesQ = useQuery({
    queryKey: ['candidates', {}],
    queryFn: async () => (await fetchCandidates()).candidates,
    retry: false,
  });
  const simsQ = useQuery({ queryKey: ['sims'], queryFn: fetchSimulations, retry: false });
  const demoHtmlQ = useQuery({
    queryKey: ['simulation-demo-html'],
    queryFn: fetchSimulationDemoHtml,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const [candidate, setCandidate] = useState<string>('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [temperature, setTemperature] = useState([310]);
  const [steps, setSteps] = useState([10000]);
  const [llmMode, setLlmMode] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(simsQ.data?.[0] ?? null);
  const [runError, setRunError] = useState<unknown>(null);

  const run = async () => {
    if (!canRun) { toast.error('No permission'); return; }
    setRunError(null);
    setRunning(true); setProgress(10);
    const t = setInterval(() => setProgress((p) => Math.min(p + 12, 90)), 200);
    try {
      const q = candidateQuery.trim().toLowerCase();
      const fallbackCandidate = (candidatesQ.data ?? []).find((c) => !q || [c.name, c.target, c.diseaseArea ?? '', c.mechanism ?? ''].join(' ').toLowerCase().includes(q));
      const result = await generateSimulation({ candidateId: candidate || (fallbackCandidate?.id ?? null), params: { temperature: temperature[0], steps: steps[0], llmMode } });
      setCurrent(result);
      setProgress(100);
      toast.success('Simulation complete');
      qc.invalidateQueries({ queryKey: ['sims'] });
    } catch (e: any) { setRunError(e); toast.error(e.message); }
    finally { clearInterval(t); setRunning(false); setTimeout(() => setProgress(0), 800); }
  };

  const active = current ?? simsQ.data?.[0] ?? null;
  const allCandidates = candidatesQ.data ?? [];
  const filteredCandidates = allCandidates.filter((c) => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.target, c.diseaseArea ?? '', c.mechanism ?? ''].join(' ').toLowerCase().includes(q);
  });
  const selectedCandidate = allCandidates.find((c) => c.id === candidate) ?? filteredCandidates[0] ?? allCandidates[0] ?? null;
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Simulation Studio</h1>
          <p className="text-sm text-muted-foreground">Configure parameters, run molecular simulations, and inspect outputs.</p>
        </div>
        <div className="flex gap-2">
          <ComparisonDialog />
          <ExportDialog data={active} />
        </div>
      </div>

      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>Demo visualization mode</AlertTitle>
        <AlertDescription>
          The panels load real structure files when identifiers are available: ligand SDF from PubChem and protein PDB from RCSB. Generated simulation records remain demo previews unless a molecular dynamics backend is added.
        </AlertDescription>
      </Alert>

      {candidatesQ.isError && <ApiErrorBanner error={candidatesQ.error} title="Candidate load failed" />}
      {simsQ.isError && <ApiErrorBanner error={simsQ.error} title="Simulation history failed" />}
      {runError && <ApiErrorBanner error={runError} title="Simulation generation failed" />}
      {demoHtmlQ.isError && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Legacy demo HTML unavailable</AlertTitle>
          <AlertDescription>The page is using built-in deterministic viewer panels instead of the legacy iframe artifact.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Viewers */}
        <Card className="lg:col-span-2 p-4 overflow-hidden">
          <div className="grid gap-4 md:grid-cols-2">
            <ViewerPanel
              key={`drug-${selectedCandidate?.id ?? 'empty'}`}
              label="Drug structure"
              detail={selectedCandidate?.name ?? active?.formula ?? 'Select candidate to preview'}
              candidate={selectedCandidate}
              kind="drug"
            />
            <ViewerPanel
              key={`protein-${selectedCandidate?.id ?? 'empty'}`}
              label="Protein target"
              detail={`${selectedCandidate?.target ?? 'No target selected'}${selectedCandidate?.bindingSite ? ` · ${selectedCandidate.bindingSite}` : ''}`}
              candidate={selectedCandidate}
              kind="protein"
            />
          </div>
        </Card>

        {/* Right panel */}
        <Card className="p-4">
          <Tabs defaultValue="narrative">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="narrative">Narrative</TabsTrigger>
              <TabsTrigger value="formula">Formula</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
            </TabsList>
            <TabsContent value="narrative" className="mt-3 text-sm whitespace-pre-line min-h-[180px]">
              <div className="mb-2 flex gap-2">
                <Badge variant={active?.isDemo === false ? 'default' : 'secondary'}>{active?.isDemo === false ? 'Real simulation' : 'Demo output'}</Badge>
                {active?.llm && <Badge variant="outline">{active.llm.used ? `LLM: ${active.llm.model}` : 'Deterministic narrative'}</Badge>}
              </div>
              {compactDisplayNarrative(active?.narrative) ?? 'Run a simulation to see narrative output.'}
            </TabsContent>
            <TabsContent value="formula" className="mt-3 text-sm font-mono">{active?.formula ?? '—'}</TabsContent>
            <TabsContent value="validation" className="mt-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-confidence-high" />
                <span>Residue validation: <strong>{active?.validationStatus ?? 'pending'}</strong></span>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Controls */}
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Search disease / virus / bacteria / parasite / drug</Label>
            <Input
              value={candidateQuery}
              onChange={(e) => setCandidateQuery(e.target.value)}
              placeholder="e.g. COVID-19, bacteria, malaria..."
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs">Candidate</Label>
            <Select value={candidate} onValueChange={setCandidate}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{filteredCandidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Temperature: {temperature[0]} K</Label>
            <Slider value={temperature} onValueChange={setTemperature} min={250} max={400} step={5} className="mt-3" />
          </div>
          <div>
            <Label className="text-xs">Steps: {steps[0].toLocaleString()}</Label>
            <Slider value={steps} onValueChange={setSteps} min={1000} max={50000} step={1000} className="mt-3" />
          </div>
          <div className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <Label htmlFor="llm" className="text-xs flex items-center gap-1"><Sparkles className="size-3" /> LLM narrative</Label>
              <Switch id="llm" checked={llmMode} onCheckedChange={setLlmMode} />
            </div>
            <Button onClick={run} disabled={running || !canRun} className="mt-2">
              <Play className="size-4 mr-2" /> {running ? 'Running…' : 'Generate simulation'}
            </Button>
          </div>
        </div>
        {progress > 0 && <Progress value={progress} className="mt-4" />}
      </Card>
    </div>
  );
}

function ComparisonDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm">Compare</Button></DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Comparison · baseline vs current</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Baseline</div>
            <p>RMSD: 1.8Å · Formula C20H22FN5O2 · 10000 steps · validation: passed.</p>
          </Card>
          <Card className="p-4 border-primary">
            <div className="text-xs text-primary mb-2">Current</div>
            <p>RMSD: <span className="bg-confidence-high/15 text-confidence-high px-1 rounded">1.4Å</span> · Formula C20H22FN5O2 · <span className="bg-confidence-high/15 text-confidence-high px-1 rounded">20000 steps</span> · validation: passed.</p>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportDialog({ data }: { data: any }) {
  const json = JSON.stringify(data ?? {}, null, 2);
  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'simulation.json'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Download className="size-4 mr-2" />Export</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Export simulation</DialogTitle></DialogHeader>
        <pre className="max-h-80 overflow-auto rounded border bg-muted p-3 text-xs">{json}</pre>
        <div className="flex gap-2">
          <Button onClick={download}><FileJson className="size-4 mr-2" />Download JSON</Button>
          <Button variant="outline" disabled>PDF report (coming soon)</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
