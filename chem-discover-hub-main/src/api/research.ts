import type { Candidate } from '@/types';
import { toCandidate, toEvidence, toSynthesis } from './adapters';
import { apiFetch, apiFetchResponse, parseApiResponse } from './http';

export interface CandidateFilters {
  /** Full-text style search across name, disease area, target, mechanism, pathogen context */
  q?: string;
  disease?: string;
  target?: string;
  mechanism?: string;
  minConfidence?: number;
  riskLevels?: string[];
}

export interface CandidateQueryResult {
  candidates: Candidate[];
  enrichment?: {
    status: string;
    attempted: boolean;
    source: string;
    query: string | null;
    inserted: number;
    error: string | null;
    url: string | null;
    localMatches: number;
    liveMatches: number;
  };
  /** Compatibility mirror from backend header after optional core pipeline hydration */
  coreHydrate?: string;
}

export async function fetchCandidates(filters: CandidateFilters = {}): Promise<CandidateQueryResult> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.disease) params.set('disease', filters.disease);
  if (filters.target) params.set('target', filters.target);
  if (filters.mechanism) params.set('mechanism', filters.mechanism);
  if (filters.minConfidence != null) params.set('minConfidence', String(filters.minConfidence));
  if (filters.riskLevels?.length) params.set('riskLevels', filters.riskLevels.join(','));
  const res = await apiFetchResponse(`/api/research/candidates?${params.toString()}`);
  const body = await parseApiResponse<any[] | { candidates?: any[]; enrichment?: CandidateQueryResult['enrichment'] }>(res);
  const coreHydrate = res.headers.get('x-chembrain-core-hydrate') ?? undefined;
  const candidates = Array.isArray(body) ? body : body?.candidates ?? [];
  return {
    candidates: candidates.map(toCandidate),
    enrichment: Array.isArray(body) ? undefined : body.enrichment,
    coreHydrate: coreHydrate ?? undefined,
  };
}

export async function fetchSearchSuggestions(q = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const data = await apiFetch<{ suggestions: Array<{ value: string; kind: string; count: number }> }>(
    `/api/research/suggestions?${params.toString()}`,
  );
  return data.suggestions;
}

export async function fetchEvidenceForCandidate(candidateId: string) {
  const data = await apiFetch<any[]>(`/api/research/evidence?candidateId=${candidateId}`);
  return (data ?? []).map(toEvidence);
}

export async function fetchAllEvidence() {
  const data = await apiFetch<any[]>(`/api/research/evidence`);
  return (data ?? []).map(toEvidence);
}

export async function fetchSynthesis(candidateId: string) {
  const data = await apiFetch<any | null>(`/api/research/synthesis/${candidateId}`);
  return data ? toSynthesis(data) : null;
}

export async function saveCandidateToProgram(candidateId: string, programId: string) {
  await apiFetch<{ ok: boolean }>(`/api/research/candidates/${candidateId}/program`, {
    method: 'POST',
    body: JSON.stringify({ programId }),
  });
}
