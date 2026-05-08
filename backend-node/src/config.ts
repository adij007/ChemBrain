import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const fallbackDevSecret = "dev-only-change-me-32-characters-minimum";
const jwtSecret = process.env.JWT_SECRET ?? (isProduction ? "" : fallbackDevSecret);

if (!jwtSecret || jwtSecret === "dev-secret" || (isProduction && jwtSecret === fallbackDevSecret)) {
  throw new Error(
    "JWT_SECRET must be set to a strong non-default value before starting the API.",
  );
}

function splitCsv(value: string | undefined, fallback: string[]) {
  const parsed = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function normalizeSameSite(value: string | undefined): "lax" | "strict" | "none" {
  const normalized = (value ?? "lax").toLowerCase();
  if (normalized === "strict" || normalized === "none") return normalized;
  return "lax";
}

function inferOllamaBaseUrl(openAiBaseUrl: string) {
  if (!openAiBaseUrl) return process.env.OLLAMA_BASE_URL?.trim() ?? "http://localhost:11434";
  return openAiBaseUrl.replace(/\/v1\/?$/, "");
}

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4100),
  jwtSecret,
  frontendOrigins: splitCsv(process.env.FRONTEND_ORIGINS, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ]),
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProduction,
  cookieSameSite: normalizeSameSite(process.env.COOKIE_SAMESITE),
  coreApiBaseUrl: process.env.CORE_API_BASE_URL?.trim() ?? "http://localhost:8000",
  coreApiTimeoutMs: Number(process.env.CORE_API_TIMEOUT_MS ?? 2500),
  healthTimeoutMs: Number(process.env.HEALTH_TIMEOUT_MS ?? 1500),
  /** Cloud OpenAI or any provider key; optional when using a local OpenAI-compatible server with OPENAI_BASE_URL. */
  openAiKey: process.env.OPENAI_API_KEY ?? "",
  /** e.g. http://localhost:11434/v1 for Ollama */
  openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim() ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "llama3:latest",
};

export const ollamaBaseUrl = inferOllamaBaseUrl(config.openAiBaseUrl);
