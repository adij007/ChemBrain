import { toSimulation } from './adapters';
import { apiFetch } from './http';

export async function fetchSimulations() {
  const data = await apiFetch<any[]>('/api/simulation/runs');
  return (data ?? []).map(toSimulation);
}

export async function generateSimulation(input: {
  candidateId: string | null;
  params: Record<string, unknown>;
}) {
  const data = await apiFetch<any>('/api/simulation/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return toSimulation(data);
}

export async function fetchSimulationDemoHtml() {
  const data = await apiFetch<{ html: string }>('/api/simulation/demo-html');
  return data.html;
}
