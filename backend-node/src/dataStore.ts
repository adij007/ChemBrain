import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Role = "admin" | "scientist" | "analyst" | "educator" | "student" | "viewer";

type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type Profile = {
  id: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
};

type UserRole = {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
};

type Program = {
  id: string;
  name: string;
  diseaseArea: string;
  description: string | null;
  status: "draft" | "in_review" | "approved" | "archived";
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Candidate = {
  id: string;
  programId: string | null;
  name: string;
  target: string;
  diseaseArea: string | null;
  mechanism: string | null;
  confidenceScore: number;
  riskLevel: "low" | "medium" | "high";
  dataSource?: "local_seed" | "live_pipeline" | "user_import";
  approvedFor?: string | null;
  ic50?: string | null;
  evidenceScore?: number | null;
  safetyDetail?: string | null;
  structureImageUrl?: string | null;
  smiles?: string | null;
  pdbId?: string | null;
  molecularFormula?: string | null;
  uniprotId?: string | null;
  bindingSite?: string | null;
  dataConfidence?: string | null;
  sourceUrls?: string[];
  pathogenContext?: Record<string, unknown> | null;
  createdAt: string;
};

type EvidenceTrace = {
  id: string;
  candidateId: string;
  sourceType: string;
  citation: string;
  url: string | null;
  uncertaintyFlag: boolean;
  retrievedAt: string;
};

type SynthesisOutput = {
  id: string;
  candidateId: string;
  researchSummary: string | null;
  reactionBrief: string | null;
  qualityChecks: Array<{ check: string; status: "pass" | "warn" | "fail" }>;
  createdAt: string;
};

type SimulationRun = {
  id: string;
  candidateId: string | null;
  baselineId: string | null;
  params: Record<string, unknown>;
  narrative: string | null;
  formula: string | null;
  validationStatus: "pending" | "passed" | "failed";
  createdAt: string;
};

type DataFile = {
  users: User[];
  profiles: Profile[];
  userRoles: UserRole[];
  programs: Program[];
  candidates: Candidate[];
  evidenceTraces: EvidenceTrace[];
  synthesisOutputs: SynthesisOutput[];
  simulationRuns: SimulationRun[];
};

const dataDir = path.resolve(process.cwd(), "data");
const dataPath = path.join(dataDir, "store.json");

const emptyData = (): DataFile => ({
  users: [],
  profiles: [],
  userRoles: [],
  programs: [],
  candidates: [],
  evidenceTraces: [],
  synthesisOutputs: [],
  simulationRuns: [],
});

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(emptyData(), null, 2), "utf-8");
  }
}

export function readData(): DataFile {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataPath, "utf-8")) as DataFile;
}

export function writeData(data: DataFile) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  return crypto.randomUUID();
}
