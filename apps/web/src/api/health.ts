import { apiFetch } from './http';

export type ApiHealth = {
  ok: boolean;
  status: 'ok' | 'degraded' | 'down';
  service: string;
  canonicalRuntime: string;
  timestamp: string;
  dependencies: Record<string, any>;
  config: Record<string, any>;
};

export async function fetchApiHealth() {
  return apiFetch<ApiHealth>('/api/health');
}
