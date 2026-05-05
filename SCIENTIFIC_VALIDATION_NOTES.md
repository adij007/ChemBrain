# Scientific Validation Notes

Validation date: 2026-05-05

## Sample Context Findings

- `pdb_id: 6OIM` is valid and downloads from RCSB, but RCSB identifies it as the crystal structure of human `KRAS G12C` covalently bound to `AMG 510`, not a KRAS G12D/metformin complex. Source: [RCSB 6OIM](https://www.rcsb.org/structure/6OIM).
- Because 6OIM is a G12C structure, a requested `Gly12` highlight is scientifically suspect for this exact PDB; residue 12 is expected to be mutated in the coordinate file. The inference layer now validates requested residue names/numbers against fetched PDB coordinates and raises before rendering if strict mode is enabled.
- Live residue check against the downloaded 6OIM PDB: `Val14` and `Lys16` matched; `Gly12` was missing.
- `P01116` correctly maps to human GTPase KRas, a GDP/GTP-binding small GTPase involved in cell proliferation and Ras/MAPK signaling. Sources: [DrugBank P01116](https://go.drugbank.com/polypeptides/P01116), [RCSB P01116 group](https://www.rcsb.org/groups/summary/polymer_entity/P01116).
- PubMed supports a metformin pancreatic-cancer rationale through mTOR/Ras or PI3K/Akt/mTOR modulation, but this is pathway-level biology, not evidence that metformin directly occupies the 6OIM AMG 510 covalent pocket. Sources: [PMID 25143389](https://pubmed.ncbi.nlm.nih.gov/25143389/), [PMID 31841183](https://pubmed.ncbi.nlm.nih.gov/31841183/).

## Demo Implication

The sample JSON is useful for schema and rendering tests, but it should not be used as an approved scientific demo output without correction. For a defensible KRAS G12D simulation, replace `6OIM` with a KRAS G12D-relevant PDB entry and update `binding_residues` to residues that exist in that structure. RCSB search results show examples such as `6ZLI` for KRAS-G12D in complex with a small molecule, but the exact PDB should be selected and reviewed by the science owner before demo approval.

The backend entrypoint now fails fast on this sample before model generation:

```text
ValueError: PDB residue validation failed for 6OIM: missing binding residues Gly12
```
