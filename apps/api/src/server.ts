import express, { type CookieOptions, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { z } from "zod";
import OpenAI from "openai";
import { candidateListQuerySchema } from "@chembrain/shared";
import { config, ollamaBaseUrl } from "./config.js";
import { buildPayload, requireAuth, signToken } from "./auth.js";
import { createId, nowIso, readData, writeData, type Candidate } from "./dataStore.js";

function matchesSearchRow(c: Candidate, searchRaw: string): boolean {
  const search = searchRaw.trim().toLowerCase();
  if (!search) return true;
  const hay = [c.name, c.target, c.diseaseArea ?? "", c.mechanism ?? "", JSON.stringify(c.pathogenContext ?? null)]
    .join(" ")
    .toLowerCase();
  const terms = search.split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}

function filterCandidates(
  candidates: Candidate[],
  opts: {
    q: string;
    disease: string;
    target: string;
    mechanism: string;
    minConfidence?: number;
    riskLevels?: string[] | undefined;
  },
): Candidate[] {
  return candidates
    .filter((c) => {
      if (opts.q.trim()) return matchesSearchRow(c, opts.q);
      if (opts.disease)
        return (c.diseaseArea ?? "").toLowerCase().includes(opts.disease.toLowerCase());
      return true;
    })
    .filter((c) => !opts.target || c.target.toLowerCase().includes(opts.target.toLowerCase()))
    .filter((c) => !opts.mechanism || (c.mechanism ?? "").toLowerCase().includes(opts.mechanism.toLowerCase()))
    .filter((c) => opts.minConfidence == null || c.confidenceScore >= opts.minConfidence)
    .filter((c) => !opts.riskLevels?.length || opts.riskLevels.includes(c.riskLevel))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function candidateForResponse(candidate: Candidate): Candidate {
  const catalog = catalogStructureForCandidate(candidate);
  return {
    ...candidate,
    dataSource: candidate.dataSource ?? "local_seed",
    smiles: candidate.smiles ?? catalog?.smiles ?? null,
    pdbId: candidate.pdbId ?? catalog?.pdbId ?? null,
    molecularFormula: candidate.molecularFormula ?? catalog?.molecularFormula ?? null,
    uniprotId: candidate.uniprotId ?? catalog?.uniprotId ?? null,
    bindingSite: candidate.bindingSite ?? catalog?.bindingSite ?? null,
  };
}

type CatalogStructure = {
  smiles: string | null;
  pdbId: string | null;
  molecularFormula: string | null;
  uniprotId: string | null;
  bindingSite: string | null;
};

let catalogStructureCache: Array<Record<string, unknown>> | null = null;

function loadCatalogDrugs() {
  if (catalogStructureCache) return catalogStructureCache;
  const candidates = [
    path.resolve(process.cwd(), "..", "catalog", "drugs.json"),
    path.resolve(process.cwd(), "catalog", "drugs.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "catalog", "drugs.json"),
  ];
  const catalogPath = candidates.find((p) => fs.existsSync(p));
  if (!catalogPath) {
    catalogStructureCache = [];
    return catalogStructureCache;
  }
  const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf-8")) as { drugs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  catalogStructureCache = Array.isArray(parsed) ? parsed : parsed.drugs ?? [];
  return catalogStructureCache;
}

function normalizeLookup(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function catalogStructureForCandidate(candidate: Candidate): CatalogStructure | null {
  const hay = normalizeLookup(`${candidate.name} ${candidate.target} ${candidate.diseaseArea ?? ""} ${candidate.mechanism ?? ""}`);
  const rules: Array<[string, string]> = [
    ["nirmatrelvir", "nirmatrelvir"],
    ["kras g12c", "sotorasib"],
    ["oseltamivir", "oseltamivir"],
    ["beta lactam", "oxacillin"],
    ["penicillin binding", "oxacillin"],
    ["artemisinin", "artemether"],
    ["artemisinin derivative", "artemether"],
    ["malaria", "artemether"],
  ];
  const preferred = rules.find(([needle]) => hay.includes(needle))?.[1];
  const drugs = loadCatalogDrugs();
  const row = preferred
    ? drugs.find((drug) => normalizeLookup(String(drug.drug_name ?? drug.id ?? "")).includes(preferred))
    : drugs.find((drug) => hay.includes(normalizeLookup(String(drug.drug_name ?? ""))));
  if (!row) return null;
  const residues = Array.isArray(row.binding_residues) ? row.binding_residues.join(", ") : null;
  return {
    smiles: typeof row.smiles === "string" ? row.smiles : null,
    pdbId: typeof row.pdb_id === "string" ? row.pdb_id : null,
    molecularFormula: typeof row.molecular_formula === "string" ? row.molecular_formula : null,
    uniprotId: typeof row.uniprot_id === "string" ? row.uniprot_id : null,
    bindingSite: residues,
  };
}

const app = express();

function createAiClient(): OpenAI | null {
  const base = config.openAiBaseUrl;
  const key = config.openAiKey.trim();
  if (base) {
    return new OpenAI({ apiKey: key || "ollama", baseURL: base });
  }
  if (key) {
    return new OpenAI({ apiKey: key });
  }
  return null;
}

const aiClient = createAiClient();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    exposedHeaders: ["X-Chembrain-Core-Hydrate", "X-Request-Id"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const id = req.header("x-request-id") ?? requestId();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});
app.use(csrfProtection);

const authCookieName = "chembrain_token";
const csrfCookieName = "chembrain_csrf";

function requestId() {
  return crypto.randomUUID();
}

function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setAuthCookies(res: Response, token: string) {
  res.cookie(authCookieName, token, authCookieOptions());
  res.cookie(csrfCookieName, crypto.randomBytes(24).toString("hex"), csrfCookieOptions());
}

function clearAuthCookies(res: Response) {
  res.clearCookie(authCookieName, { path: "/" });
  res.clearCookie(csrfCookieName, { path: "/" });
}

function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  const safeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const csrfExempt = new Set([
    "/api/auth/signin",
    "/api/auth/signup",
    "/api/auth/reset-password",
  ]);

  if (!req.path.startsWith("/api/") || safeMethod || csrfExempt.has(req.path)) {
    next();
    return;
  }

  const hasCookieSession = Boolean(req.cookies?.[authCookieName]);
  if (!hasCookieSession) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.[csrfCookieName];
  const csrfHeader = req.header("x-csrf-token");
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({
      error: "CSRF validation failed. Refresh the page and sign in again.",
      code: "CSRF_INVALID",
    });
    return;
  }

  next();
}

async function probeJson(url: string, timeoutMs = config.healthTimeoutMs) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.ok ? "ok" : "down",
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started),
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: "down",
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildHealth() {
  let dataStoreStatus: Record<string, unknown>;
  try {
    const data = readData();
    dataStoreStatus = {
      status: "ok",
      users: data.users.length,
      candidates: data.candidates.length,
      simulations: data.simulationRuns.length,
      sourceOfTruth: "json_store",
    };
  } catch (error) {
    dataStoreStatus = {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
      sourceOfTruth: "json_store",
    };
  }

  const core = await probeJson(`${config.coreApiBaseUrl}/health`);
  const ollama = await probeJson(`${ollamaBaseUrl}/api/tags`);
  const models = Array.isArray((ollama.body as { models?: unknown[] } | null)?.models)
    ? ((ollama.body as { models: Array<{ name?: string; model?: string }> }).models ?? [])
    : [];
  const modelNames = models.map((model) => model.name ?? model.model).filter(Boolean);
  const modelAvailable =
    modelNames.length > 0 &&
    modelNames.some((model) => model === config.openAiModel || model?.replace(":latest", "") === config.openAiModel);

  const dependencyStatuses = [
    dataStoreStatus.status,
    core.status,
    ollama.status,
    config.openAiBaseUrl ? (modelAvailable ? "ok" : "degraded") : "skipped",
  ];
  const hasRequiredFailure = dataStoreStatus.status !== "ok";
  const hasDegraded = dependencyStatuses.some((status) => status !== "ok" && status !== "skipped");

  return {
    ok: !hasRequiredFailure,
    status: hasRequiredFailure ? "down" : hasDegraded ? "degraded" : "ok",
    service: "backend-node",
    canonicalRuntime: "apps/api -> apps/web",
    timestamp: nowIso(),
    config: {
      port: config.port,
      frontendOrigins: config.frontendOrigins,
      coreApiBaseUrl: config.coreApiBaseUrl,
      llm: {
        configured: Boolean(aiClient),
        openAiBaseUrl: config.openAiBaseUrl || null,
        ollamaBaseUrl,
        model: config.openAiModel,
      },
      cookies: {
        sameSite: config.cookieSameSite,
        secure: config.cookieSecure,
      },
    },
    dependencies: {
      dataStore: dataStoreStatus,
      coreApi: {
        ...core,
        url: `${config.coreApiBaseUrl}/health`,
        optional: true,
      },
      ollama: {
        ...ollama,
        url: `${ollamaBaseUrl}/api/tags`,
        model: config.openAiModel,
        modelAvailable,
        availableModels: modelNames,
        requiredWhenLlmModeIsOn: true,
      },
    },
  };
}

app.get("/health", async (_req, res) => {
  const health = await buildHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

app.get("/api/health", async (_req, res) => {
  const health = await buildHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

async function ensureSeedAdmin() {
  if (config.isProduction || process.env.SEED_DEMO_ADMIN !== "true") {
    return;
  }
  const seedPassword = process.env.SEED_DEMO_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error("SEED_DEMO_ADMIN_PASSWORD must be at least 12 characters when SEED_DEMO_ADMIN=true.");
  }

  const data = readData();
  const existing = data.users.find((u) => u.email === "admin@chembrain.local");
  if (existing) return;

  const timestamp = nowIso();
  const id = createId();
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  data.users.push({
    id,
    email: "admin@chembrain.local",
    passwordHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  data.profiles.push({
    id,
    displayName: "ChemBrain Admin",
    email: "admin@chembrain.local",
    createdAt: timestamp,
  });
  data.userRoles.push({ id: createId(), userId: id, role: "admin", createdAt: timestamp });
  writeData(data);
}

function ensureDemoResearchData() {
  const data = readData();
  if (data.candidates.length > 0) {
    const now = nowIso();
    const addIfMissing = (candidate: Candidate) => {
      const exists = data.candidates.some((row) => row.name.toLowerCase() === candidate.name.toLowerCase());
      if (!exists) data.candidates.push(candidate);
    };

    addIfMissing({
      id: createId(),
      programId: null,
      name: "Beta-lactam Sensitizer",
      target: "Penicillin-binding protein",
      diseaseArea: "Bacterial infection",
      mechanism: "Narrow-spectrum antibacterial peptidoglycan synthesis inhibition with Gram-positive coverage.",
      confidenceScore: 0.71,
      riskLevel: "medium",
      dataSource: "local_seed",
      approvedFor: "Serious bacterial infection",
      ic50: "MIC-range activity",
      evidenceScore: 0.62,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://www.ncbi.nlm.nih.gov/"],
      pathogenContext: { organism_type: "bacteria", example: "Staphylococcus aureus" },
      createdAt: now,
    });
    addIfMissing({
      id: createId(),
      programId: null,
      name: "Artemisinin Derivative Signal",
      target: "Plasmodium falciparum",
      diseaseArea: "Malaria parasitic infection",
      mechanism: "Antiparasitic endoperoxide radical damage to parasite membranes.",
      confidenceScore: 0.79,
      riskLevel: "high",
      dataSource: "local_seed",
      approvedFor: "Uncomplicated malaria",
      ic50: "phenotypic EC50",
      evidenceScore: 0.7,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://www.who.int/"],
      pathogenContext: { organism_type: "parasite", strain: "Plasmodium falciparum" },
      createdAt: now,
    });
    addIfMissing({
      id: createId(),
      programId: null,
      name: "Oseltamivir Viral Repurposing Control",
      target: "Influenza neuraminidase",
      diseaseArea: "Viral infection",
      mechanism: "Neuraminidase inhibition used as a deterministic viral-search control.",
      confidenceScore: 0.76,
      riskLevel: "medium",
      dataSource: "local_seed",
      approvedFor: "Influenza antiviral use",
      ic50: "curated antiviral activity",
      evidenceScore: 0.66,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/"],
      pathogenContext: { organism_type: "virus", example: "Influenza A" },
      createdAt: now,
    });
    writeData(data);
    return;
  }

  const covidCandidateId = createId();
  const oncologyCandidateId = createId();
  const now = nowIso();

  data.candidates.push(
    {
      id: covidCandidateId,
      programId: null,
      name: "Nirmatrelvir Repurposing Signal",
      target: "SARS-CoV-2 Mpro",
      diseaseArea: "COVID-19",
      mechanism: "Protease inhibition with antiviral replication suppression profile.",
      confidenceScore: 0.88,
      riskLevel: "medium",
      dataSource: "local_seed",
      approvedFor: "COVID-19 antiviral use",
      ic50: "measured ChEMBL activity",
      evidenceScore: 0.78,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/", "https://platform.opentargets.org/"],
      createdAt: now,
    },
    {
      id: oncologyCandidateId,
      programId: null,
      name: "KRAS G12C Covalent Lead",
      target: "KRAS G12C",
      diseaseArea: "Oncology",
      mechanism: "Irreversible cysteine-targeted inhibition of mutant KRAS signaling.",
      confidenceScore: 0.92,
      riskLevel: "low",
      dataSource: "local_seed",
      approvedFor: "NSCLC KRAS G12C",
      ic50: "measured ChEMBL activity",
      evidenceScore: 0.81,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://www.ebi.ac.uk/chembl/"],
      createdAt: now,
    },
    {
      id: createId(),
      programId: null,
      name: "Beta-lactam Sensitizer",
      target: "Penicillin-binding protein",
      diseaseArea: "Bacterial infection",
      mechanism: "Narrow-spectrum antibacterial peptidoglycan synthesis inhibition (Gram-positive coverage).",
      confidenceScore: 0.71,
      riskLevel: "medium",
      dataSource: "local_seed",
      approvedFor: "Serious bacterial infection",
      ic50: "MIC-range activity",
      evidenceScore: 0.62,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://www.ncbi.nlm.nih.gov/"],
      pathogenContext: { organism_type: "bacteria", example: "Staphylococcus aureus" },
      createdAt: now,
    },
    {
      id: createId(),
      programId: null,
      name: "Artemisinin Derivative Signal",
      target: "Plasmodium falciparum",
      diseaseArea: "Malaria",
      mechanism: "Antiparasitic endoperoxide radical damage to parasite membranes.",
      confidenceScore: 0.79,
      riskLevel: "high",
      dataSource: "local_seed",
      approvedFor: "Uncomplicated malaria",
      ic50: "phenotypic EC50",
      evidenceScore: 0.7,
      dataConfidence: "Curated local demo evidence.",
      sourceUrls: ["https://www.who.int/"],
      pathogenContext: { organism_type: "parasite", strain: "Plasmodium falciparum" },
      createdAt: now,
    },
  );

  data.evidenceTraces.push(
    {
      id: createId(),
      candidateId: covidCandidateId,
      sourceType: "pubmed",
      citation: "Peer-reviewed antiviral evidence reports reduced SARS-CoV-2 viral replication in vitro.",
      url: "https://pubmed.ncbi.nlm.nih.gov/",
      uncertaintyFlag: false,
      retrievedAt: now,
    },
    {
      id: createId(),
      candidateId: covidCandidateId,
      sourceType: "open_targets",
      citation: "Target-disease linkage supports coronavirus protease inhibition strategy.",
      url: "https://platform.opentargets.org/",
      uncertaintyFlag: false,
      retrievedAt: now,
    },
  );

  data.synthesisOutputs.push({
    id: createId(),
    candidateId: covidCandidateId,
    researchSummary:
      "Signal indicates plausible COVID-19 antiviral repositioning opportunity with moderate translational risk.",
    reactionBrief:
      "Primary value comes from accelerated antiviral pathway confidence and prior safety context.",
    qualityChecks: [
      { check: "Evidence freshness", status: "pass" },
      { check: "Mechanism-target consistency", status: "pass" },
      { check: "Clinical transferability", status: "warn" },
    ],
    createdAt: now,
  });

  writeData(data);
}

function sourceTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("opentargets")) return "open_targets";
  if (lower.includes("chembl")) return "chembl";
  if (lower.includes("pubchem")) return "pubchem";
  if (lower.includes("open.fda")) return "openfda";
  if (lower.includes("rcsb")) return "rcsb";
  if (lower.includes("ncbi")) return "ncbi";
  if (lower.includes("bv-brc")) return "bv_brc";
  if (lower.includes("veupathdb")) return "veupathdb";
  if (lower.includes("uniprot")) return "uniprot";
  return "live_pipeline";
}

function compactNarrative(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .split(/\s+/)
    .slice(0, 95)
    .join(" ")
    .trim();
}

type HydrationResult = {
  inserted: number;
  source: "core_api";
  url: string;
  upstreamStatus?: number;
  error?: string;
};

async function hydrateDiseaseFromCoreApi(disease: string): Promise<HydrationResult> {
  const url = `${config.coreApiBaseUrl}/api/v1/query?disease=${encodeURIComponent(disease)}&live=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(config.coreApiTimeoutMs) });
  if (!response.ok) {
    return {
      inserted: 0,
      source: "core_api",
      url,
      upstreamStatus: response.status,
      error: `Core API returned HTTP ${response.status}.`,
    };
  }
  const payload = (await response.json()) as {
    data?: { disease?: string; candidates?: Array<Record<string, unknown>> };
  };
  const candidates = payload.data?.candidates ?? [];
  if (!candidates.length) return { inserted: 0, source: "core_api", url };

  const data = readData();
  const normalizedDisease = payload.data?.disease ?? disease;
  let inserted = 0;

  for (const item of candidates) {
    const name = String(item.drug ?? "Unknown Candidate");
    const target = String(item.target ?? "Unknown Target");
    const duplicate = data.candidates.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.target.toLowerCase() === target.toLowerCase(),
    );
    if (duplicate) continue;

    const candidateId = createId();
    const score = Number(item.composite_score ?? 0.55);
    const rationale = String(item.rationale ?? "");

    data.candidates.push({
      id: candidateId,
      programId: null,
      name,
      target,
      diseaseArea: normalizedDisease,
      mechanism: rationale || "Live pipeline import.",
      confidenceScore: Number.isFinite(score) ? score : 0.55,
      riskLevel: "medium",
      dataSource: "live_pipeline",
      approvedFor: String(item.approved_for ?? ""),
      ic50: String(item.ic50 ?? ""),
      evidenceScore: Number(item.evidence_score ?? 0),
      safetyDetail: String(item.safety_detail ?? ""),
      structureImageUrl: String(item.structure_image_url ?? ""),
      bindingSite: String(item.binding_site ?? ""),
      dataConfidence: String(item.data_confidence ?? ""),
      sourceUrls: Array.isArray(item.source_urls) ? (item.source_urls as string[]) : [],
      pathogenContext:
        item.raw && typeof item.raw === "object" && "pathogen_context" in (item.raw as Record<string, unknown>)
          ? ((item.raw as Record<string, unknown>).pathogen_context as Record<string, unknown>)
          : null,
      createdAt: nowIso(),
    });

    const sourceUrls = Array.isArray(item.source_urls) ? (item.source_urls as string[]) : [];
    if (sourceUrls.length > 0) {
      for (const sourceUrl of sourceUrls) {
        data.evidenceTraces.push({
          id: createId(),
          candidateId,
          sourceType: sourceTypeFromUrl(sourceUrl),
          citation: `Imported evidence source: ${sourceUrl}`,
          url: sourceUrl,
          uncertaintyFlag: false,
          retrievedAt: nowIso(),
        });
      }
    } else {
      data.evidenceTraces.push({
        id: createId(),
        candidateId,
        sourceType: "live_pipeline",
        citation: String(item.data_confidence ?? "Imported from live biomedical pipeline."),
        url: null,
        uncertaintyFlag: false,
        retrievedAt: nowIso(),
      });
    }

    data.synthesisOutputs.push({
      id: createId(),
      candidateId,
      researchSummary: rationale || null,
      reactionBrief: String(item.reaction_brief ?? ""),
      qualityChecks: [{ check: "Live import", status: "pass" }],
      createdAt: nowIso(),
    });

    inserted += 1;
  }

  if (inserted > 0) {
    writeData(data);
  }
  return { inserted, source: "core_api", url };
}

app.post("/api/auth/signup", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { email, password, displayName } = parsed.data;
  const data = readData();
  const existing = data.users.find((u) => u.email === email);
  if (existing) return res.status(409).json({ error: "Email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const id = createId();
  const timestamp = nowIso();
  data.users.push({ id, email, passwordHash, createdAt: timestamp, updatedAt: timestamp });
  data.profiles.push({ id, displayName, email, createdAt: timestamp });
  data.userRoles.push({
    id: createId(),
    userId: id,
    role: data.userRoles.length === 0 ? "admin" : "scientist",
    createdAt: timestamp,
  });
  writeData(data);

  const payload = await buildPayload(id);
  if (!payload) return res.status(500).json({ error: "Failed to load profile" });
  const token = signToken(payload);
  setAuthCookies(res, token);
  return res.json({ user: { id: payload.sub, email: payload.email }, roles: payload.roles });
});

app.post("/api/auth/signin", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { email, password } = parsed.data;
  const data = readData();
  const user = data.users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const payload = await buildPayload(user.id);
  if (!payload) return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken(payload);
  setAuthCookies(res, token);
  return res.json({ user: { id: payload.sub, email: payload.email }, roles: payload.roles });
});

app.post("/api/auth/signout", (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

app.get("/api/auth/session", requireAuth, async (req, res) => {
  const payload = (req as any).user;
  const data = readData();
  const profile = data.profiles.find((p) => p.id === payload.sub);
  res.json({
    user: { id: payload.sub, email: payload.email, displayName: profile?.displayName ?? null },
    roles: payload.roles,
  });
});

app.post("/api/auth/reset-password", async (_req, res) => {
  // Placeholder for email provider integration in hardening phase.
  res.json({ ok: true });
});

app.post("/api/auth/update-password", requireAuth, async (req, res) => {
  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const payload = (req as any).user;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const data = readData();
  const user = data.users.find((u) => u.id === payload.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.passwordHash = passwordHash;
  user.updatedAt = nowIso();
  writeData(data);
  res.json({ ok: true });
});

app.get("/api/settings/me", requireAuth, async (req, res) => {
  const payload = (req as any).user;
  const data = readData();
  const profile = data.profiles.find((p) => p.id === payload.sub);
  res.json({
    id: payload.sub,
    email: payload.email,
    displayName: profile?.displayName ?? "",
    roles: payload.roles,
  });
});

app.patch("/api/settings/me", requireAuth, async (req, res) => {
  const schema = z.object({ displayName: z.string().min(1).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const payload = (req as any).user;
  const data = readData();
  const profile = data.profiles.find((p) => p.id === payload.sub);
  if (profile) {
    profile.displayName = parsed.data.displayName;
  } else {
    data.profiles.push({ id: payload.sub, displayName: parsed.data.displayName, email: payload.email, createdAt: nowIso() });
  }
  writeData(data);
  res.json({ ok: true });
});

app.get("/api/research/candidates", requireAuth, async (req, res) => {
  const parsed = candidateListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
  const qStr = parsed.data.q ?? "";
  const diseaseStr = parsed.data.disease ?? "";
  const targetStr = parsed.data.target ?? "";
  const mechanismStr = parsed.data.mechanism ?? "";
  const minConfidence = parsed.data.minConfidence;
  const riskLevels = parsed.data.riskLevels?.split(",").map((s) => s.trim()).filter(Boolean);

  let data = readData();
  let rows = filterCandidates(data.candidates, {
    q: qStr,
    disease: diseaseStr,
    target: targetStr,
    mechanism: mechanismStr,
    minConfidence,
    riskLevels,
  });

  const hydrateTerm = (qStr.trim() || diseaseStr.trim()).trim();
  let hydrateStatus: "skipped" | "attempted-success" | "attempted-empty" | "attempted-error" = "skipped";
  let hydrateInserted = 0;
  let hydrateError: string | null = null;
  let hydrateUrl: string | null = null;

  if (!rows.length && hydrateTerm.length >= 2) {
    hydrateStatus = "attempted-empty";
    try {
      const result = await hydrateDiseaseFromCoreApi(hydrateTerm);
      hydrateInserted = result.inserted;
      hydrateUrl = result.url;
      hydrateError = result.error ?? null;
      hydrateStatus = result.inserted > 0 ? "attempted-success" : result.error ? "attempted-error" : "attempted-empty";
    } catch (error) {
      hydrateStatus = "attempted-error";
      hydrateError = error instanceof Error ? error.message : String(error);
    }
    data = readData();
    rows = filterCandidates(data.candidates, {
      q: qStr,
      disease: diseaseStr,
      target: targetStr,
      mechanism: mechanismStr,
      minConfidence,
      riskLevels,
    });
  }

  res.setHeader("X-Chembrain-Core-Hydrate", hydrateStatus);
  res.json({
    candidates: rows.map(candidateForResponse),
    enrichment: {
      status: hydrateStatus,
      attempted: hydrateStatus !== "skipped",
      source: "core_api",
      query: hydrateTerm || null,
      inserted: hydrateInserted,
      error: hydrateError,
      url: hydrateUrl,
      localMatches: rows.filter((row) => (row.dataSource ?? "local_seed") !== "live_pipeline").length,
      liveMatches: rows.filter((row) => row.dataSource === "live_pipeline").length,
    },
  });
});

app.get("/api/research/suggestions", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const data = readData();
  const values = new Map<string, { value: string; kind: "candidate" | "target" | "disease" | "organism"; count: number }>();

  function add(value: string | null | undefined, kind: "candidate" | "target" | "disease" | "organism") {
    const label = (value ?? "").trim();
    if (!label) return;
    if (q && !label.toLowerCase().includes(q)) return;
    const key = `${kind}:${label.toLowerCase()}`;
    const existing = values.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      values.set(key, { value: label, kind, count: 1 });
    }
  }

  for (const candidate of data.candidates) {
    add(candidate.name, "candidate");
    add(candidate.target, "target");
    add(candidate.diseaseArea, "disease");
    const organism = candidate.pathogenContext?.organism_type ?? candidate.pathogenContext?.example ?? candidate.pathogenContext?.strain;
    if (typeof organism === "string") add(organism, "organism");
  }

  res.json({
    suggestions: [...values.values()]
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 12),
  });
});

app.get("/api/research/evidence", requireAuth, async (req, res) => {
  const data = readData();
  const candidateId = req.query.candidateId ? String(req.query.candidateId) : undefined;
  const rows = data.evidenceTraces
    .filter((e) => !candidateId || e.candidateId === candidateId)
    .sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
  res.json(rows);
});

app.get("/api/research/synthesis/:candidateId", requireAuth, async (req, res) => {
  const data = readData();
  const row = data.synthesisOutputs
    .filter((s) => s.candidateId === req.params.candidateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  res.json(row);
});

app.post("/api/research/candidates/:id/program", requireAuth, async (req, res) => {
  const schema = z.object({ programId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const data = readData();
  const candidate = data.candidates.find((c) => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  candidate.programId = parsed.data.programId;
  writeData(data);
  res.json({ ok: true });
});

app.get("/api/programs", requireAuth, async (_req, res) => {
  const data = readData();
  const rows = data.programs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(rows);
});

app.post("/api/programs", requireAuth, async (req, res) => {
  const payload = (req as any).user;
  const schema = z.object({
    name: z.string().min(1),
    diseaseArea: z.string().min(1),
    description: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const data = readData();
  const timestamp = nowIso();
  const row = {
    id: createId(),
    name: parsed.data.name,
    diseaseArea: parsed.data.diseaseArea,
    description: parsed.data.description ?? null,
    ownerId: payload.sub,
    status: "draft" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  data.programs.push(row);
  writeData(data);
  res.json(row);
});

app.patch("/api/programs/:id/status", requireAuth, async (req, res) => {
  const schema = z.object({ status: z.enum(["draft", "in_review", "approved", "archived"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const data = readData();
  const program = data.programs.find((p) => p.id === req.params.id);
  if (!program) return res.status(404).json({ error: "Program not found" });
  program.status = parsed.data.status;
  program.updatedAt = nowIso();
  writeData(data);
  res.json({ ok: true });
});

app.get("/api/simulation/runs", requireAuth, async (_req, res) => {
  const data = readData();
  const rows = data.simulationRuns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(rows);
});

app.get("/api/simulation/demo-html", requireAuth, async (_req, res) => {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    // Running from backend-node/
    path.resolve(process.cwd(), "..", "demo_output", "simulation_demo.html"),
    // Running from repo root
    path.resolve(process.cwd(), "demo_output", "simulation_demo.html"),
    // Fallback based on source file location
    path.resolve(serverDir, "..", "..", "demo_output", "simulation_demo.html"),
  ];
  const demoPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!demoPath) {
    return res.status(404).json({
      error: "simulation_demo.html not found in demo_output",
      searched: candidatePaths,
    });
  }
  const html = fs.readFileSync(demoPath, "utf-8");
  res.json({ html });
});

app.post("/api/simulation/runs", requireAuth, async (req, res) => {
  const schema = z.object({
    candidateId: z.string().uuid().nullable(),
    params: z.record(z.any()).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const data = readData();
  const candidate = parsed.data.candidateId
    ? data.candidates.find((row) => row.id === parsed.data.candidateId) ?? null
    : null;
  const llmMode = parsed.data.params.llmMode !== false;
  const deterministicNarrative = [
    `${candidate?.name ?? "Selected candidate"} previewed against ${candidate?.target ?? "the selected target"} at ${parsed.data.params.temperature ?? 310}K for ${parsed.data.params.steps ?? 10000} configured steps.`,
    "This is a structure visualization record, not a molecular dynamics result.",
  ].join(" ");

  let narrative = deterministicNarrative;
  const llm = {
    requested: llmMode,
    used: false,
    model: config.openAiModel,
    latencyMs: 0,
    error: null as string | null,
  };

  if (llmMode) {
    if (!aiClient) {
      return res.status(503).json({
        error: "LLM narrative is enabled, but no OpenAI-compatible endpoint is configured.",
        code: "LLM_NOT_CONFIGURED",
        remediation: "Set OPENAI_BASE_URL=http://localhost:11434/v1, OPENAI_API_KEY=ollama, and OPENAI_MODEL to an installed Ollama model.",
      });
    }

    const prompt = [
      "Write compact plain text for a drug discovery simulation panel.",
      "No markdown. No asterisks. No headings. No bullets. No hype.",
      "Maximum 75 words, 3 short sentences.",
      "Be explicit that this is a 3D structure preview/demo, not real molecular dynamics.",
      `Candidate: ${candidate?.name ?? "unselected"}`,
      `Target: ${candidate?.target ?? "unselected"}`,
      `Disease: ${candidate?.diseaseArea ?? "unknown"}`,
      `Params: ${JSON.stringify(parsed.data.params)}`,
    ].join("\n");

    const started = performance.now();
    try {
      const completion = await aiClient.chat.completions.create({
        model: config.openAiModel,
        messages: [{ role: "user", content: prompt }],
      });
      narrative = compactNarrative(completion.choices[0]?.message?.content ?? deterministicNarrative);
      llm.used = true;
      llm.latencyMs = Math.round(performance.now() - started);
      console.info(
        JSON.stringify({
          event: "llm.simulation.success",
          model: config.openAiModel,
          latencyMs: llm.latencyMs,
        }),
      );
    } catch (error) {
      llm.latencyMs = Math.round(performance.now() - started);
      llm.error = error instanceof Error ? error.message : String(error);
      console.warn(
        JSON.stringify({
          event: "llm.simulation.error",
          model: config.openAiModel,
          latencyMs: llm.latencyMs,
          error: llm.error,
        }),
      );
      return res.status(502).json({
        error: `LLM narrative failed: ${llm.error}`,
        code: "LLM_REQUEST_FAILED",
        remediation: `Verify Ollama is running at ${ollamaBaseUrl} and model ${config.openAiModel} is installed.`,
      });
    }
  }

  const row = {
    id: createId(),
    candidateId: parsed.data.candidateId,
    baselineId: null,
    params: {
      ...parsed.data.params,
      simulationMode: "demo_visualization",
    },
    narrative: compactNarrative(narrative),
    formula: candidateForResponse(candidate ?? ({} as Candidate)).molecularFormula ?? "C20H22FN5O2",
    validationStatus: "passed" as const,
    mode: "demo_visualization",
    isDemo: true,
    llm,
    createdAt: nowIso(),
  };
  data.simulationRuns.push(row);
  writeData(data);
  res.json(row);
});

app.post("/api/ai/chat", requireAuth, async (req, res) => {
  const schema = z.object({ message: z.string().min(1), context: z.record(z.any()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  if (!aiClient) {
    return res.status(503).json({
      error: "AI provider is not configured.",
      code: "LLM_NOT_CONFIGURED",
      remediation: "Set OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL for the API process.",
    });
  }
  const started = performance.now();
  try {
    const completion = await aiClient.chat.completions.create({
      model: config.openAiModel,
      messages: [
        { role: "system", content: "You are ChemBrain assistant for drug discovery and research operations." },
        { role: "user", content: parsed.data.message },
      ],
    });
    const latencyMs = Math.round(performance.now() - started);
    console.info(JSON.stringify({ event: "llm.chat.success", model: config.openAiModel, latencyMs }));
    return res.json({ answer: completion.choices[0]?.message?.content ?? "No response", degraded: false, latencyMs });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({ event: "llm.chat.error", model: config.openAiModel, latencyMs, error: message }));
    return res.status(502).json({
      error: `AI provider request failed: ${message}`,
      code: "LLM_REQUEST_FAILED",
      remediation: `Verify endpoint ${config.openAiBaseUrl || "OPENAI_BASE_URL"} and model ${config.openAiModel}.`,
    });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const isJsonSyntaxError = err instanceof SyntaxError && "body" in err;
  const status = isJsonSyntaxError ? 400 : err.message.startsWith("CORS origin not allowed") ? 403 : 500;
  res.status(status).json({
    error: isJsonSyntaxError ? "Invalid JSON request body" : status === 403 ? err.message : "Internal API error",
    code: isJsonSyntaxError ? "INVALID_JSON" : status === 403 ? "CORS_FORBIDDEN" : "INTERNAL_ERROR",
    detail: config.isProduction ? undefined : err.message,
  });
});

ensureSeedAdmin().then(() => {
  ensureDemoResearchData();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`backend-node listening on ${config.port}`);
  });
});
