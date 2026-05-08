export class ServiceUnavailableError extends Error { constructor(m='Service unavailable'){super(m); this.name='ServiceUnavailableError';} }
export class LLMDegradedError extends Error { constructor(m='LLM degraded'){super(m); this.name='LLMDegradedError';} }
export class TimeoutError extends Error { constructor(m='Request timed out'){super(m); this.name='TimeoutError';} }
export class ValidationError extends Error { constructor(m='Validation failed'){super(m); this.name='ValidationError';} }

export function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}
