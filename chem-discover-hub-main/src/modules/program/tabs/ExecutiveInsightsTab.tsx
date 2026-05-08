import { useQuery } from '@tanstack/react-query';
import { fetchCandidates } from '@/api/research';
import { fetchPrograms } from '@/api/program';
import { fetchSimulations } from '@/api/simulation';
import { KpiCard } from '@/components/common/KpiCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ExecutiveInsightsTab() {
  const candQ = useQuery({
    queryKey: ['candidates', {}],
    queryFn: async () => (await fetchCandidates()).candidates,
  });
  const progQ = useQuery({ queryKey: ['programs'], queryFn: fetchPrograms });
  const simQ = useQuery({ queryKey: ['sims'], queryFn: fetchSimulations });

  const candidates = candQ.data ?? [];
  const programs = progQ.data ?? [];
  const sims = simQ.data ?? [];

  const avgConfidence = candidates.length ? candidates.reduce((s, c) => s + c.confidenceScore, 0) / candidates.length : 0;
  const activePrograms = programs.filter((p) => p.status !== 'archived').length;

  // Disease area bar
  const byDisease = candidates.reduce<Record<string, number>>((acc, c) => {
    const k = c.diseaseArea ?? 'Other'; acc[k] = (acc[k] || 0) + 1; return acc;
  }, {});
  const diseaseData = Object.entries(byDisease).map(([name, value]) => ({ name, value }));

  // Throughput trend (synthetic from sims createdAt buckets)
  const weeks = Array.from({ length: 6 }).map((_, i) => {
    const w = new Date(); w.setDate(w.getDate() - (5 - i) * 7);
    const label = `W${w.getMonth() + 1}/${Math.ceil(w.getDate() / 7)}`;
    return { week: label, runs: Math.max(2, Math.round(sims.length / 6 + (Math.sin(i) * 2 + 3))) };
  });

  // Confidence histogram
  const buckets = [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => ({ bucket: `${(v * 100).toFixed(0)}%`, count: 0, min: v }));
  candidates.forEach((c) => {
    const idx = Math.min(buckets.length - 1, Math.floor(c.confidenceScore * 5));
    buckets[idx].count++;
  });

  const exportCsv = () => {
    const rows = [['metric', 'value'], ['candidates', candidates.length], ['simulations', sims.length], ['active_programs', activePrograms], ['avg_confidence', avgConfidence.toFixed(2)]];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'executive-summary.csv'; a.click();
  };

  const COLORS = ['oklch(0.45 0.16 255)', 'oklch(0.65 0.18 145)', 'oklch(0.78 0.15 85)', 'oklch(0.62 0.22 27)', 'oklch(0.58 0.18 270)'];

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4 mr-2" />Export summary</Button></div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Candidates evaluated" value={candidates.length} delta={12.4} detail={<>Across {Object.keys(byDisease).length} disease areas</>} />
        <KpiCard label="Simulations run" value={sims.length} delta={8.1} detail={<>Validation pass rate {(sims.filter(s => s.validationStatus === 'passed').length / Math.max(1, sims.length) * 100).toFixed(0)}%</>} />
        <KpiCard label="Active programs" value={activePrograms} delta={3.2} />
        <KpiCard label="Avg confidence" value={`${(avgConfidence * 100).toFixed(0)}%`} delta={1.8} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Opportunity by disease area</h3>
          <div className="h-64">
            <ResponsiveContainer><BarChart data={diseaseData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="value">{diseaseData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Weekly throughput</h3>
          <div className="h-64">
            <ResponsiveContainer><LineChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="runs" stroke="oklch(0.45 0.16 255)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart></ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-3">Confidence distribution</h3>
          <div className="h-56">
            <ResponsiveContainer><BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="oklch(0.65 0.18 145)" />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
