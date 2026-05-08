import { toProgram } from './adapters';
import type { ProgramStatus } from '@/types';
import { apiFetch } from './http';

export async function fetchPrograms() {
  const data = await apiFetch<any[]>('/api/programs');
  return (data ?? []).map(toProgram);
}

export async function updateProgramStatus(id: string, status: ProgramStatus) {
  await apiFetch<{ ok: boolean }>(`/api/programs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function createProgram(input: { name: string; diseaseArea: string; description?: string }) {
  const data = await apiFetch<any>('/api/programs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return toProgram(data);
}
