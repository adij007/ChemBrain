export function confidenceClass(score: number): { bg: string; text: string; label: string } {
  if (score >= 0.75) return { bg: 'bg-confidence-high/15', text: 'text-confidence-high', label: 'High' };
  if (score >= 0.5) return { bg: 'bg-confidence-mid/15', text: 'text-confidence-mid', label: 'Medium' };
  return { bg: 'bg-confidence-low/15', text: 'text-confidence-low', label: 'Low' };
}

export function formatDate(d: string | Date | undefined | null): string {
  if (d == null || d === '') return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
