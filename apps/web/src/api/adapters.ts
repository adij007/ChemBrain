import type { Candidate, EvidenceTrace, Program, SimulationRun, SynthesisOutput, RiskLevel, SourceType, ProgramStatus, ValidationStatus } from '@/types';

export const toCandidate = (r: any): Candidate => ({
  id: r.id, programId: r.program_id ?? r.programId ?? null, name: r.name, target: r.target,
  diseaseArea: r.disease_area ?? r.diseaseArea ?? null, mechanism: r.mechanism ?? null,
  confidenceScore: Number(r.confidence_score ?? r.confidenceScore ?? 0), riskLevel: (r.risk_level ?? r.riskLevel ?? 'medium') as RiskLevel,
  dataSource: r.data_source ?? r.dataSource ?? 'local',
  approvedFor: r.approved_for ?? r.approvedFor ?? null,
  ic50: r.ic50 ?? null,
  evidenceScore: r.evidence_score ?? r.evidenceScore ?? null,
  safetyDetail: r.safety_detail ?? r.safetyDetail ?? null,
  structureImageUrl: r.structure_image_url ?? r.structureImageUrl ?? null,
  smiles: r.smiles ?? null,
  pdbId: r.pdb_id ?? r.pdbId ?? null,
  molecularFormula: r.molecular_formula ?? r.molecularFormula ?? null,
  uniprotId: r.uniprot_id ?? r.uniprotId ?? null,
  bindingSite: r.binding_site ?? r.bindingSite ?? null,
  dataConfidence: r.data_confidence ?? r.dataConfidence ?? null,
  sourceUrls: r.source_urls ?? r.sourceUrls ?? [],
  pathogenContext: r.pathogen_context ?? r.pathogenContext ?? null,
  createdAt: r.created_at ?? r.createdAt,
});

export const toEvidence = (r: any): EvidenceTrace => ({
  id: r.id, candidateId: r.candidate_id ?? r.candidateId, sourceType: (r.source_type ?? r.sourceType) as SourceType,
  citation: r.citation, url: r.url, uncertaintyFlag: r.uncertainty_flag ?? r.uncertaintyFlag, retrievedAt: r.retrieved_at ?? r.retrievedAt,
});

export const toProgram = (r: any): Program => ({
  id: r.id,
  name: r.name,
  diseaseArea: r.disease_area ?? r.diseaseArea ?? '',
  status: r.status as ProgramStatus,
  ownerId: r.owner_id ?? r.ownerId ?? null,
  description: r.description ?? null,
  createdAt: r.created_at ?? r.createdAt ?? '',
  updatedAt: r.updated_at ?? r.updatedAt ?? '',
});

export const toSimulation = (r: any): SimulationRun => ({
  id: r.id, candidateId: r.candidate_id ?? r.candidateId ?? null, params: r.params || {},
  narrative: r.narrative, formula: r.formula,
  validationStatus: (r.validation_status ?? r.validationStatus ?? 'pending') as ValidationStatus,
  baselineId: r.baseline_id ?? r.baselineId ?? null,
  mode: r.mode,
  isDemo: r.is_demo ?? r.isDemo,
  llm: r.llm,
  createdAt: r.created_at ?? r.createdAt,
});

export const toSynthesis = (r: any): SynthesisOutput => ({
  id: r.id,
  candidateId: r.candidate_id ?? r.candidateId,
  researchSummary: r.research_summary ?? r.researchSummary ?? null,
  reactionBrief: r.reaction_brief ?? r.reactionBrief ?? null,
  qualityChecks: r.quality_checks ?? r.qualityChecks ?? [],
  createdAt: r.created_at ?? r.createdAt ?? '',
});
