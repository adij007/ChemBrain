export type RiskLevel = 'low' | 'medium' | 'high';
export type CandidateDataSource = 'local_seed' | 'live_pipeline' | 'user_import' | 'local';
export type ProgramStatus = 'draft' | 'in_review' | 'approved' | 'archived';
export type SourceType =
  | 'open_targets'
  | 'uniprot'
  | 'chembl'
  | 'pubmed'
  | 'pubchem'
  | 'openfda'
  | 'rcsb'
  | 'ncbi'
  | 'bv_brc'
  | 'veupathdb'
  | 'live_pipeline';
export type ValidationStatus = 'pending' | 'passed' | 'failed';

export interface Candidate {
  id: string;
  programId: string | null;
  name: string;
  target: string;
  diseaseArea: string | null;
  mechanism: string | null;
  confidenceScore: number;
  riskLevel: RiskLevel;
  dataSource?: CandidateDataSource;
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
}

export interface EvidenceTrace {
  id: string;
  candidateId: string;
  sourceType: SourceType;
  citation: string;
  url: string | null;
  uncertaintyFlag: boolean;
  retrievedAt: string;
}

export interface Program {
  id: string;
  name: string;
  diseaseArea: string;
  status: ProgramStatus;
  ownerId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationRun {
  id: string;
  candidateId: string | null;
  params: Record<string, unknown>;
  narrative: string | null;
  formula: string | null;
  validationStatus: ValidationStatus;
  baselineId: string | null;
  mode?: 'demo_visualization' | 'real_simulation';
  isDemo?: boolean;
  llm?: {
    requested: boolean;
    used: boolean;
    model: string;
    latencyMs: number;
    error: string | null;
  };
  createdAt: string;
}

export interface SynthesisOutput {
  id: string;
  candidateId: string;
  researchSummary: string | null;
  reactionBrief: string | null;
  qualityChecks: Array<{ check: string; status: 'pass' | 'warn' | 'fail' }>;
  createdAt: string;
}
