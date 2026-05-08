"""AI inference, formula, and 3D visualization layer.

The backend-facing entrypoint is `generate_drug_explanations(context)`.
It validates the locked schema, runs local Ollama inference, and returns:

- mechanistic_rationale
- reaction_brief
- simulation.narrative
- simulation.formula_block
- simulation.visualization_html
- bond_summary
"""

from __future__ import annotations

import html
import json
import math
import os
import re
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any

import requests


def _ensure_workspace_packages() -> None:
    """Prefer project-local packages when this workspace installed them."""

    root = Path(__file__).resolve().parents[1]
    package_dirs = (
        root / ".python_packages",
        root / ".runtime_packages",
    )
    for package_dir in package_dirs:
        if not package_dir.exists():
            continue
        package_path = str(package_dir)
        if package_path not in sys.path:
            sys.path.insert(0, package_path)


_ensure_workspace_packages()

_OLLAMA_MODEL = os.getenv("CHEMBRAIN_OLLAMA_MODEL", "llama3").strip() or "llama3"
_OLLAMA_URL = (
    os.getenv("CHEMBRAIN_OLLAMA_URL", "http://localhost:11434/api/generate").strip()
    or "http://localhost:11434/api/generate"
)
_OLLAMA_PROMPT_TIMESTAMPS: deque[float] = deque()


REQUIRED_CONTEXT_FIELDS = (
    "drug_name",
    "approved_indication",
    "target_name",
    "uniprot_id",
    "target_pathway",
    "ic50_value",
    "ic50_unit",
    "interaction_type",
    "binding_residues",
    "smiles",
    "molecular_formula",
    "functional_groups",
    "genetic_evidence_score",
    "adverse_effects",
    "pdb_id",
)

AMINO_ACID_3_TO_1 = {
    "ALA": "A",
    "ARG": "R",
    "ASN": "N",
    "ASP": "D",
    "CYS": "C",
    "GLN": "Q",
    "GLU": "E",
    "GLY": "G",
    "HIS": "H",
    "ILE": "I",
    "LEU": "L",
    "LYS": "K",
    "MET": "M",
    "PHE": "F",
    "PRO": "P",
    "SER": "S",
    "THR": "T",
    "TRP": "W",
    "TYR": "Y",
    "VAL": "V",
}

AMINO_ACID_LABELS = {
    "A": "ALA",
    "ALA": "ALA",
    "ALANINE": "ALA",
    "R": "ARG",
    "ARG": "ARG",
    "ARGININE": "ARG",
    "N": "ASN",
    "ASN": "ASN",
    "ASPARAGINE": "ASN",
    "D": "ASP",
    "ASP": "ASP",
    "ASPARTATE": "ASP",
    "ASPARTICACID": "ASP",
    "C": "CYS",
    "CYS": "CYS",
    "CYSTEINE": "CYS",
    "Q": "GLN",
    "GLN": "GLN",
    "GLUTAMINE": "GLN",
    "E": "GLU",
    "GLU": "GLU",
    "GLUTAMATE": "GLU",
    "GLUTAMICACID": "GLU",
    "G": "GLY",
    "GLY": "GLY",
    "GLYCINE": "GLY",
    "H": "HIS",
    "HIS": "HIS",
    "HISTIDINE": "HIS",
    "I": "ILE",
    "ILE": "ILE",
    "ISOLEUCINE": "ILE",
    "L": "LEU",
    "LEU": "LEU",
    "LEUCINE": "LEU",
    "K": "LYS",
    "LYS": "LYS",
    "LYSINE": "LYS",
    "M": "MET",
    "MET": "MET",
    "METHIONINE": "MET",
    "F": "PHE",
    "PHE": "PHE",
    "PHENYLALANINE": "PHE",
    "P": "PRO",
    "PRO": "PRO",
    "PROLINE": "PRO",
    "S": "SER",
    "SER": "SER",
    "SERINE": "SER",
    "T": "THR",
    "THR": "THR",
    "THREONINE": "THR",
    "W": "TRP",
    "TRP": "TRP",
    "TRYPTOPHAN": "TRP",
    "Y": "TYR",
    "TYR": "TYR",
    "TYROSINE": "TYR",
    "V": "VAL",
    "VAL": "VAL",
    "VALINE": "VAL",
}

APPROVED_OUTPUTS: dict[str, dict[str, dict[str, Any]]] = {}


def validate_context(context: dict[str, Any]) -> None:
    """Validate the locked backend schema before any model or 3D work."""

    missing = [field for field in REQUIRED_CONTEXT_FIELDS if field not in context]
    if missing:
        raise ValueError(f"Missing required field: {missing[0]}")

    if not context["pdb_id"]:
        raise ValueError("Missing required field: pdb_id")

    if not isinstance(context["binding_residues"], list) or not context["binding_residues"]:
        raise ValueError("binding_residues must be a non-empty list")

    if not isinstance(context["functional_groups"], list) or not context["functional_groups"]:
        raise ValueError("functional_groups must be a non-empty list")

    if not isinstance(context["adverse_effects"], list) or not context["adverse_effects"]:
        raise ValueError("adverse_effects must be a non-empty list")

    try:
        ic50_value = float(context["ic50_value"])
    except (TypeError, ValueError) as exc:
        raise ValueError("ic50_value must be numeric") from exc

    if ic50_value <= 0:
        raise ValueError("ic50_value must be greater than zero")


def build_rationale_prompt(context: dict[str, Any]) -> str:
    return f"""You are a biomedical researcher specializing in drug repurposing.

Drug Information:
- Drug name: {context['drug_name']}
- Currently approved for: {context['approved_indication']}
- Binding target: {context['target_name']} ({context['uniprot_id']})
- Target pathway: {context['target_pathway']}
- Measured IC50: {context['ic50_value']} {context['ic50_unit']}
- Genetic evidence score: {context['genetic_evidence_score']}
- Known adverse effects: {', '.join(context['adverse_effects'])}

Task: Generate a mechanistic repurposing rationale for {context['drug_name']}
against the disease associated with {context['target_name']} in exactly 3-4 sentences.

Your rationale must:
1. Explain the mechanism of action relevant to the new disease
2. Reference why the IC50 value and genetic evidence score support this hypothesis
3. Note one key clinical risk or limitation
4. Do not repeat the drug information listed above
5. Do not mention clinical trials unless they appear in the data provided
6. Be specific — name the exact pathway, exact evidence score, exact risk

Rationale:"""


def build_reaction_prompt(context: dict[str, Any]) -> str:
    return f"""You are a medicinal chemist explaining molecular interactions.

Molecular Data:
- Drug: {context['drug_name']}
- SMILES: {context['smiles']}
- Chemical formula: {context['molecular_formula']}
- Key functional groups: {', '.join(context['functional_groups'])}
- Target protein: {context['target_name']}
- Binding site residues: {', '.join(context['binding_residues'])}
- Interaction type: {context['interaction_type']}
- IC50: {context['ic50_value']} {context['ic50_unit']}

Task: Explain step by step how {context['drug_name']} physically interacts
with the binding site of {context['target_name']} in exactly 4-5 sentences.

Your explanation must:
1. Identify which specific bond types form (hydrogen bonds, van der Waals, hydrophobic contacts, electrostatic)
2. Name the specific binding residues involved
3. Explain how this disrupts the target protein's normal function
4. Describe the downstream biological consequence in the disease context
5. Do not repeat the molecular data listed above
6. Be chemically specific — do not use vague language like 'the drug binds the protein'

Reaction Brief:"""


def build_simulation_prompt(context: dict[str, Any]) -> str:
    return f"""You are a computational chemist writing a step-by-step molecular reaction simulation.

Reaction Inputs:
- Drug molecule: {context['drug_name']}
- Chemical formula: {context['molecular_formula']}
- SMILES: {context['smiles']}
- Functional groups: {', '.join(context['functional_groups'])}
- Target protein: {context['target_name']}
- Binding residues: {', '.join(context['binding_residues'])}
- Interaction type: {context['interaction_type']}
- IC50: {context['ic50_value']} {context['ic50_unit']}
- Target pathway: {context['target_pathway']}

Task: Write a molecular reaction simulation in exactly 5 steps.

Each step must follow this exact format:
STEP [N]: [Step title]
Formula: [Write the relevant chemical equation, binding energy expression,
          or equilibrium expression for this step using standard notation]
Explanation: [1-2 sentences explaining what physically happens at this step
              in plain scientific language]

Steps must cover:
Step 1 — Drug approach and electrostatic orientation toward the binding pocket
Step 2 — Initial contact and formation of the first bond type
Step 3 — Full binding complex formation with all bond types established
Step 4 — Conformational change or allosteric effect on the protein
Step 5 — Downstream biological consequence in the disease pathway

Rules:
- Every formula must use real chemical notation (ΔG, Kd, IC50, H-bond donors/acceptors)
- Do not invent binding energies — use the IC50 value provided to anchor energy estimates
- Do not mention clinical trials
- Be specific about which residues are involved at each step
- Every step MUST include a Formula: line before the Explanation: line.

Simulation:"""


def build_research_synthesis_prompt(context: dict[str, Any]) -> str:
    return f"""You are a biomedical research scientist writing for a scientifically literate audience.

Candidate Context:
- Drug name: {context['drug_name']}
- Approved indication: {context['approved_indication']}
- Target name: {context['target_name']} ({context['uniprot_id']})
- Target pathway: {context['target_pathway']}
- Measured IC50: {context['ic50_value']} {context['ic50_unit']}
- Genetic evidence score: {context['genetic_evidence_score']}
- Interaction type: {context['interaction_type']}
- Known adverse effects: {', '.join(context['adverse_effects'])}

Task: Write exactly 5 sentences that are critical and evidence-based (not promotional):
1) The strongest scientific argument FOR repurposing this drug for the target biology
2) The most significant evidence gap or uncertainty
3) One specific in vitro experiment that could confirm or refute the mechanism
4) How the safety profile impacts clinical feasibility
5) Confidence rating: HIGH, MODERATE, or LOW, with a one-sentence justification

Output exactly five sentences and include a confidence label in sentence 5.
Research Synthesis:"""


def build_target_inference_prompt(mechanism_description: str) -> str:
    return f"""You are a translational bioinformatics expert.

Input disease mechanism description:
{mechanism_description}

Identify exactly 3 candidate protein targets that are mechanistically plausible and have known approved drugs in ChEMBL.
Use specific HGNC gene symbols and include UniProt accession IDs.

Return output in this exact structure:
TARGET 1:
Gene: [HGNC gene symbol]
UniProt: [UniProt accession ID]
Rationale: [1 sentence]

TARGET 2:
Gene: [HGNC gene symbol]
UniProt: [UniProt accession ID]
Rationale: [1 sentence]

TARGET 3:
Gene: [HGNC gene symbol]
UniProt: [UniProt accession ID]
Rationale: [1 sentence]

Also return strict JSON with this shape:
{{
  "targets": [
    {{"gene":"...", "uniprot_id":"...", "rationale":"..."}},
    {{"gene":"...", "uniprot_id":"...", "rationale":"..."}},
    {{"gene":"...", "uniprot_id":"...", "rationale":"..."}}
  ]
}}
"""


def parse_target_inference_output(raw_output: str) -> list[dict]:
    # Prefer strict JSON when available.
    try:
        parsed = json.loads(raw_output)
        targets = parsed.get("targets", []) if isinstance(parsed, dict) else []
        if isinstance(targets, list):
            normalized = []
            for target in targets:
                if not isinstance(target, dict):
                    continue
                gene = str(target.get("gene", "")).strip()
                uniprot_id = str(target.get("uniprot_id", "")).strip()
                rationale = str(target.get("rationale", "")).strip()
                if gene and uniprot_id and rationale:
                    normalized.append(
                        {"gene": gene, "uniprot_id": uniprot_id, "rationale": rationale}
                    )
            if normalized:
                return normalized
    except Exception:
        pass

    targets: list[dict] = []
    blocks = re.split(r"(?im)^\s*TARGET\s+\d+\s*:\s*$", raw_output)
    for block in blocks:
        segment = block.strip()
        if not segment:
            continue

        gene_match = re.search(r"(?im)^\s*Gene\s*:\s*(.+?)\s*$", segment)
        uniprot_match = re.search(r"(?im)^\s*UniProt\s*:\s*(.+?)\s*$", segment)
        rationale_match = re.search(r"(?im)^\s*Rationale\s*:\s*(.+?)\s*$", segment)

        if not (gene_match and uniprot_match and rationale_match):
            continue

        gene = gene_match.group(1).strip()
        uniprot_id = uniprot_match.group(1).strip()
        rationale = rationale_match.group(1).strip()
        if not (gene and uniprot_id and rationale):
            continue

        targets.append(
            {
                "gene": gene,
                "uniprot_id": uniprot_id,
                "rationale": rationale,
            }
        )

    return targets


def generate_text(prompt: str) -> str:
    prompt_budget = int(os.getenv("CHEMBRAIN_OLLAMA_MAX_PROMPTS_PER_MIN", "0"))
    if prompt_budget > 0:
        now = time.time()
        while _OLLAMA_PROMPT_TIMESTAMPS and now - _OLLAMA_PROMPT_TIMESTAMPS[0] > 60:
            _OLLAMA_PROMPT_TIMESTAMPS.popleft()
        if len(_OLLAMA_PROMPT_TIMESTAMPS) >= prompt_budget:
            raise RuntimeError(
                f"Ollama prompt budget exceeded ({prompt_budget}/min). Retry later."
            )
        _OLLAMA_PROMPT_TIMESTAMPS.append(now)

    timeout_seconds = int(os.getenv("CHEMBRAIN_OLLAMA_TIMEOUT_SEC", "300"))
    payload = {
        "model": _OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_predict": 350,
            "repeat_penalty": 1.2,
        },
    }
    attempts = max(1, int(os.getenv("CHEMBRAIN_OLLAMA_RETRIES", "2")))
    backoff_seconds = float(os.getenv("CHEMBRAIN_OLLAMA_BACKOFF_SEC", "1.2"))
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            response = requests.post(_OLLAMA_URL, json=payload, timeout=timeout_seconds)
            response.raise_for_status()
            data = response.json()
            return str(data.get("response", "")).strip()
        except requests.exceptions.ConnectionError as exc:
            last_error = exc
            if attempt == attempts:
                raise RuntimeError(
                    "Could not connect to Ollama at "
                    f"{_OLLAMA_URL}. Start Ollama with `ollama serve` and verify the model "
                    f"`{_OLLAMA_MODEL}` is available via `ollama pull {_OLLAMA_MODEL}`."
                ) from exc
        except requests.exceptions.Timeout as exc:
            last_error = exc
            if attempt == attempts:
                raise RuntimeError(
                    "Ollama request timed out. Ensure Ollama is running, reduce load, or increase "
                    "the timeout via `CHEMBRAIN_OLLAMA_TIMEOUT_SEC`."
                ) from exc
        except requests.exceptions.RequestException as exc:
            last_error = exc
            if attempt == attempts:
                raise RuntimeError(f"Ollama request failed: {exc}") from exc

        time.sleep(backoff_seconds * attempt)

    raise RuntimeError(f"Ollama request failed after retries: {last_error}")


def clean_output(text: str) -> str:
    """Trim incomplete trailing fragments without mangling decimal values."""

    stripped = text.strip()
    if not stripped:
        return stripped

    sentence_endings = [match.end() for match in re.finditer(r"(?<!\d)[.!?](?:\s|$)", stripped)]
    if sentence_endings:
        return stripped[: sentence_endings[-1]].strip()

    return stripped


def generate_drug_3d(smiles: str, drug_name: str) -> dict[str, Any]:
    """Convert SMILES to optimized 3D coordinates and computed descriptors."""

    from rdkit import Chem
    from rdkit.Chem import AllChem, Crippen, rdMolDescriptors

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES string for {drug_name}: {smiles}")

    mol = Chem.AddHs(mol)
    embed_status = AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
    if embed_status != 0:
        embed_status = AllChem.EmbedMolecule(mol, useRandomCoords=True)
    if embed_status != 0:
        raise ValueError(f"Could not generate 3D coordinates for {drug_name}")

    if AllChem.MMFFHasAllMoleculeParams(mol):
        AllChem.MMFFOptimizeMolecule(mol)
    else:
        AllChem.UFFOptimizeMolecule(mol)

    mol_block = Chem.MolToMolBlock(mol)

    descriptors = {
        "molecular_weight": round(rdMolDescriptors.CalcExactMolWt(mol), 2),
        "h_bond_donors": rdMolDescriptors.CalcNumHBD(mol),
        "h_bond_acceptors": rdMolDescriptors.CalcNumHBA(mol),
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "logp": round(Crippen.MolLogP(mol), 2),
    }

    return {
        "mol_block": mol_block,
        "descriptors": descriptors,
        "smiles": smiles,
    }


def fetch_protein_structure(
    pdb_id: str,
    target_name: str,
    *,
    uniprot_id: str | None = None,
    timeout: int = 10,
) -> dict[str, str]:
    """Fetch a PDB file for py3Dmol rendering, with UniProt fallback search."""

    import requests

    normalized_pdb_id = str(pdb_id).strip().upper()
    url = f"https://files.rcsb.org/download/{normalized_pdb_id}.pdb"
    response = requests.get(url, timeout=timeout)

    if response.status_code == 200 and response.text.startswith(("HEADER", "TITLE", "ATOM")):
        return {
            "pdb_content": response.text,
            "pdb_id": normalized_pdb_id,
            "target_name": target_name,
        }

    if uniprot_id:
        fallback_pdb_id = _search_pdb_by_uniprot(uniprot_id, timeout=timeout)
        if fallback_pdb_id and fallback_pdb_id != normalized_pdb_id:
            return fetch_protein_structure(
                fallback_pdb_id,
                target_name,
                uniprot_id=None,
                timeout=timeout,
            )

    raise ValueError(
        f"Could not fetch PDB structure for {target_name} "
        f"(PDB ID: {normalized_pdb_id}). Status: {response.status_code}"
    )


def _search_pdb_by_uniprot(uniprot_id: str, *, timeout: int = 10) -> str | None:
    import requests

    query = {
        "query": {
            "type": "terminal",
            "service": "text",
            "parameters": {
                "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
                "operator": "exact_match",
                "value": uniprot_id,
            },
        },
        "request_options": {"paginate": {"start": 0, "rows": 1}},
        "return_type": "entry",
    }

    response = requests.post("https://search.rcsb.org/rcsbsearch/v2/query", json=query, timeout=timeout)
    if response.status_code != 200:
        return None

    results = response.json().get("result_set", [])
    if not results:
        return None

    return str(results[0]["identifier"]).upper()


def parse_residue_label(residue: str) -> dict[str, str]:
    """Normalize labels like Gly12, GLY 12, K16, or Lys16 for 3Dmol."""

    residue_text = str(residue).strip()
    match = re.match(r"^\s*([A-Za-z]+)\s*[-:]?\s*([0-9]+[A-Za-z]?)\s*$", residue_text)
    if not match:
        return {"label": residue_text, "resn": "", "resi": ""}

    raw_name, raw_number = match.groups()
    key = re.sub(r"[^A-Za-z]", "", raw_name).upper()
    resn = AMINO_ACID_LABELS.get(key, key[:3])

    return {
        "label": residue_text,
        "resn": resn,
        "resi": raw_number.upper(),
    }


def generate_visualization_html(
    drug_3d: dict[str, Any],
    protein_3d: dict[str, str],
    context: dict[str, Any],
) -> str:
    """Generate a two-panel py3Dmol HTML block for frontend embedding."""

    binding_residues = [parse_residue_label(residue) for residue in context["binding_residues"]]
    binding_residues_js = json.dumps(binding_residues)
    mol_block_js = json.dumps(drug_3d["mol_block"])
    pdb_content_js = json.dumps(protein_3d["pdb_content"])

    drug_name = html.escape(str(context["drug_name"]))
    target_name = html.escape(str(context["target_name"]))
    formula = html.escape(str(context["molecular_formula"]))
    pdb_id = html.escape(str(protein_3d["pdb_id"]))
    residue_text = html.escape(", ".join(context["binding_residues"]))
    descriptors = drug_3d["descriptors"]

    return f"""
<div style="display:flex; gap:20px; justify-content:center; align-items:flex-start; padding:16px;">
  <div style="flex:1; text-align:center;">
    <h4 style="font-family:monospace; color:#00ff99;">{drug_name} — {formula}</h4>
    <div id="drug-viewer" style="width:100%; height:400px; border:1px solid #333; border-radius:8px; position:relative; overflow:hidden;"></div>
    <p style="font-size:11px; color:#888; margin-top:6px;">
      MW: {descriptors['molecular_weight']} Da &nbsp;|&nbsp;
      H-Bond Donors: {descriptors['h_bond_donors']} &nbsp;|&nbsp;
      H-Bond Acceptors: {descriptors['h_bond_acceptors']} &nbsp;|&nbsp;
      LogP: {descriptors['logp']}
    </p>
  </div>

  <div style="flex:1; text-align:center;">
    <h4 style="font-family:monospace; color:#ff6699;">{target_name} — PDB: {pdb_id}</h4>
    <div id="protein-viewer" style="width:100%; height:400px; border:1px solid #333; border-radius:8px; position:relative; overflow:hidden;"></div>
    <p style="font-size:11px; color:#888; margin-top:6px;">
      Binding residues highlighted: {residue_text}
    </p>
  </div>
</div>

<script src="https://3dmol.org/build/3Dmol-min.js"></script>
<script>
  const drugViewer = $3Dmol.createViewer(
    document.getElementById('drug-viewer'),
    {{ backgroundColor: '#0a0a0a' }}
  );
  drugViewer.addModel({mol_block_js}, 'mol');
  drugViewer.setStyle({{}}, {{
    stick: {{ colorscheme: 'Jmol', radius: 0.15 }},
    sphere: {{ colorscheme: 'Jmol', scale: 0.3 }}
  }});
  drugViewer.center();
  drugViewer.zoomTo();
  drugViewer.resize();
  drugViewer.spin('y', 0.5);
  drugViewer.render();

  const proteinViewer = $3Dmol.createViewer(
    document.getElementById('protein-viewer'),
    {{ backgroundColor: '#0a0a0a' }}
  );
  proteinViewer.addModel({pdb_content_js}, 'pdb');
  proteinViewer.setStyle({{}}, {{
    cartoon: {{ color: 'spectrum' }}
  }});

  const bindingResidues = {binding_residues_js};
  bindingResidues.forEach(function(residue) {{
    if (!residue.resn || !residue.resi) return;
    proteinViewer.addStyle(
      {{ resn: residue.resn, resi: residue.resi }},
      {{
        stick: {{ color: '#ff3333', radius: 0.3 }},
        sphere: {{ color: '#ff3333', scale: 0.4 }}
      }}
    );
  }});

  proteinViewer.center();
  proteinViewer.zoomTo();
  proteinViewer.resize();
  proteinViewer.spin('y', 0.3);
  proteinViewer.render();
</script>
""".strip()


def _pdb_residue_set(pdb_content: str) -> set[tuple[str, str]]:
    residues: set[tuple[str, str]] = set()
    for line in pdb_content.splitlines():
        if not line.startswith(("ATOM  ", "HETATM")) or len(line) < 26:
            continue
        resn = line[17:20].strip().upper()
        resi = line[22:27].strip().upper()
        if resn and resi:
            residues.add((resn, resi))
    return residues


def validate_binding_residues_against_pdb(
    pdb_content: str,
    binding_residues: list[str],
) -> dict[str, Any]:
    """Confirm requested binding residues exist in the PDB coordinates."""

    observed_residues = _pdb_residue_set(pdb_content)
    requested = [parse_residue_label(residue) for residue in binding_residues]
    matched = []
    missing = []

    for residue in requested:
        key = (residue["resn"], residue["resi"])
        if key in observed_residues:
            matched.append(residue["label"])
        else:
            missing.append(
                {
                    "label": residue["label"],
                    "expected_resn": residue["resn"],
                    "expected_resi": residue["resi"],
                }
            )

    return {
        "matched": matched,
        "missing": missing,
        "all_found": not missing,
    }


def ic50_to_molar(value: float, unit: str) -> float:
    normalized_unit = str(unit).replace("μ", "µ").strip().lower()
    factors = {
        "m": 1.0,
        "mol": 1.0,
        "molar": 1.0,
        "mm": 1e-3,
        "millimolar": 1e-3,
        "µm": 1e-6,
        "um": 1e-6,
        "micromolar": 1e-6,
        "nm": 1e-9,
        "nanomolar": 1e-9,
        "pm": 1e-12,
        "picomolar": 1e-12,
    }

    if normalized_unit not in factors:
        raise ValueError(f"Unsupported IC50 unit: {unit}")

    return float(value) * factors[normalized_unit]


def generate_formula_block(context: dict[str, Any], drug_descriptors: dict[str, Any]) -> dict[str, Any]:
    """Generate computed formulas anchored to IC50 and RDKit descriptors."""

    ic50_molar = ic50_to_molar(float(context["ic50_value"]), str(context["ic50_unit"]))
    gas_constant = 1.987e-3
    body_temperature = 310
    delta_g = round(gas_constant * body_temperature * math.log(ic50_molar), 2)

    equilibrium = (
        f"[{context['drug_name']}] + [{context['target_name']}] "
        f"⇌ [{context['drug_name']}·{context['target_name']}]"
    )
    kd_expression = f"Kd = k_off / k_on ≈ {context['ic50_value']} {context['ic50_unit']}"

    return {
        "binding_free_energy": {
            "formula": "ΔG = RT ln(Kd)",
            "value": f"ΔG ≈ {delta_g} kcal/mol",
            "note": "Estimated at physiological temperature (310K), using Kd ≈ IC50",
        },
        "equilibrium_expression": {
            "formula": equilibrium,
            "kd": kd_expression,
        },
        "dose_response": {
            "formula": "Effect = Emax × [D] / (IC50 + [D])",
            "ic50_anchor": f"IC50 = {context['ic50_value']} {context['ic50_unit']}",
        },
        "drug_properties": {
            "molecular_weight": f"{drug_descriptors['molecular_weight']} Da",
            "h_bond_donors": drug_descriptors["h_bond_donors"],
            "h_bond_acceptors": drug_descriptors["h_bond_acceptors"],
            "rotatable_bonds": drug_descriptors.get("rotatable_bonds"),
            "logp": drug_descriptors["logp"],
            "lipinski_compliant": (
                drug_descriptors["molecular_weight"] <= 500
                and drug_descriptors["h_bond_donors"] <= 5
                and drug_descriptors["h_bond_acceptors"] <= 10
                and drug_descriptors["logp"] <= 5
            ),
        },
        "interaction_type": context["interaction_type"],
        "binding_residues": context["binding_residues"],
    }


def extract_bond_summary(reaction_brief: str) -> str:
    bond_types = []
    text_lower = reaction_brief.lower()
    if "hydrogen bond" in text_lower or "h-bond" in text_lower:
        bond_types.append("hydrogen bonds")
    if "van der waals" in text_lower:
        bond_types.append("van der Waals forces")
    if "hydrophobic" in text_lower:
        bond_types.append("hydrophobic contacts")
    if "electrostatic" in text_lower or "ionic" in text_lower or "salt bridge" in text_lower:
        bond_types.append("electrostatic interactions")
    return " · ".join(bond_types) if bond_types else "molecular binding interactions"


def validate_simulation_narrative(simulation_narrative: str) -> dict[str, Any]:
    """Structural validation for the generated 5-step simulation text."""

    step_numbers = re.findall(r"(?im)^STEP\s+([1-5])\s*:", simulation_narrative)
    formula_lines = re.findall(r"(?im)^Formula\s*:", simulation_narrative)
    explanation_lines = re.findall(r"(?im)^Explanation\s*:", simulation_narrative)

    return {
        "has_five_steps": step_numbers == ["1", "2", "3", "4", "5"],
        "formula_line_count": len(formula_lines),
        "explanation_line_count": len(explanation_lines),
        "has_required_formula_lines": len(formula_lines) == 5,
        "has_required_explanation_lines": len(explanation_lines) == 5,
    }


def validate_rationale_quality(rationale: str, context: dict) -> dict:
    rationale_lower = rationale.lower()
    target_pathway_segment = str(context.get("target_pathway", "")).split("→")[0].split("->")[0].strip().lower()
    drug_name = str(context.get("drug_name", "")).strip().lower()

    return {
        "mentions_target_pathway": bool(target_pathway_segment and target_pathway_segment in rationale_lower),
        "mentions_drug_name": bool(drug_name and drug_name in rationale_lower),
        "mentions_binding_signal": any(token in rationale_lower for token in ["ic50", "binding", "affinity", "µm", "nm", "ki"]),
        "mentions_risk": any(token in rationale_lower for token in ["risk", "adverse", "toxicity", "caution", "limit"]),
        "appropriate_length": 100 <= len(rationale) <= 800,
    }


def generate_drug_explanations(context: dict[str, Any]) -> dict[str, Any]:
    """Master inference function for one structured drug candidate."""

    validate_context(context)

    drug_3d = generate_drug_3d(context["smiles"], context["drug_name"])
    protein_3d = fetch_protein_structure(
        context["pdb_id"],
        context["target_name"],
        uniprot_id=context.get("uniprot_id"),
    )
    residue_validation = validate_binding_residues_against_pdb(
        protein_3d["pdb_content"],
        context["binding_residues"],
    )
    if (
        os.getenv("CHEMBRAIN_STRICT_PDB_RESIDUES", "1").strip() == "1"
        and not residue_validation["all_found"]
    ):
        missing_labels = ", ".join(item["label"] for item in residue_validation["missing"])
        raise ValueError(
            f"PDB residue validation failed for {context['pdb_id']}: "
            f"missing binding residues {missing_labels}"
        )

    formula_block = generate_formula_block(context, drug_3d["descriptors"])
    visualization_html = generate_visualization_html(drug_3d, protein_3d, context)

    rationale = clean_output(generate_text(build_rationale_prompt(context)))
    reaction_brief = clean_output(generate_text(build_reaction_prompt(context)))
    simulation_narrative = clean_output(generate_text(build_simulation_prompt(context)))
    bond_summary = extract_bond_summary(reaction_brief)

    output = {
        "mechanistic_rationale": rationale,
        "reaction_brief": reaction_brief,
        "simulation": {
            "narrative": simulation_narrative,
            "formula_block": formula_block,
            "visualization_html": visualization_html,
            "validation": validate_simulation_narrative(simulation_narrative),
            "pdb_residue_validation": residue_validation,
        },
        "bond_summary": bond_summary,
        "model": {
            "name": _OLLAMA_MODEL,
            "device": "Intel Arc GPU (via Ollama)",
            "acceleration_status": "Ollama local inference — Intel Arc OneAPI backend",
        },
    }

    if bool(context.get("ai_mode")):
        output["research_synthesis"] = clean_output(generate_text(build_research_synthesis_prompt(context)))

    return output
