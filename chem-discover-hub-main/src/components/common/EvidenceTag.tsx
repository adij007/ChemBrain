import { cn } from '@/lib/utils';
import type { SourceType } from '@/types';

const LABELS: Record<SourceType, string> = {
  open_targets: 'Open Targets',
  uniprot: 'UniProt',
  chembl: 'ChEMBL',
  pubmed: 'PubMed',
  pubchem: 'PubChem',
  openfda: 'OpenFDA',
  rcsb: 'RCSB',
  ncbi: 'NCBI',
  bv_brc: 'BV-BRC',
  veupathdb: 'VEuPathDB',
  live_pipeline: 'Live Pipeline',
};

export function EvidenceTag({ source, className }: { source: SourceType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md bg-evidence-tag/12 text-evidence-tag px-2 py-0.5 text-xs font-medium border border-evidence-tag/20', className)}>
      {LABELS[source]}
    </span>
  );
}
