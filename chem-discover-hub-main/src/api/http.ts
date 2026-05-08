const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100";

export class ApiError extends Error {
  status: number;
  code?: string;
  remediation?: string;

  constructor(message: string, status: number, code?: string, remediation?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.remediation = remediation;
  }
}

function csrfToken() {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("chembrain_csrf="))
    ?.split("=")[1];
}

function isUnsafeMethod(method?: string) {
  const normalized = (method ?? "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(normalized);
}

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export function apiHeaders(init?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = csrfToken();
  if (token && isUnsafeMethod(init?.method)) headers["X-CSRF-Token"] = token;
  return {
    ...headers,
    ...(init?.headers ?? {}),
  };
}

export async function apiFetchResponse(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), {
      credentials: "include",
      headers: apiHeaders(init),
      ...init,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? `Network failure: ${error.message}` : "Network failure while contacting API.",
      0,
      "NETWORK_FAILURE",
      `Verify the API is running at ${API_BASE}.`,
    );
  }
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      body?.error ?? body?.detail ?? `Request failed with HTTP ${res.status}`,
      res.status,
      body?.code,
      body?.remediation,
    );
  }
  return body as T;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return parseApiResponse<T>(await apiFetchResponse(path, init));
}

export function explainApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: error.status === 401 ? "Session expired" : "Access blocked",
        message: error.message,
        remediation: error.remediation ?? (error.status === 401 ? "Please sign in again." : undefined),
      };
    }
    if (error.status === 0) {
      return {
        title: "API network failure",
        message: error.message,
        remediation: error.remediation,
      };
    }
    if (error.status >= 500) {
      return {
        title: "API server error",
        message: error.message,
        remediation: error.remediation ?? "Check backend-node logs and /api/health.",
      };
    }
    return { title: "API request failed", message: error.message, remediation: error.remediation };
  }
  if (error instanceof Error) return { title: "Unexpected error", message: error.message };
  return { title: "Unexpected error", message: String(error) };
}
