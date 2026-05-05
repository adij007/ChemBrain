# ChemBrain Drug Repurposing Inference Layer

This workspace contains the AI/ML inference layer for the hackathon Drug Repurposing Intelligence Engine.

## Runtime

Use the bundled Python runtime that passed setup:

```powershell
$env:PYTHONPATH = "$PWD\.runtime_packages;$PWD\.python_packages"
C:\Users\adian\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest discover -s tests
```

The host `python` launcher is currently broken, and `py` points at Python 3.14.3. The installed dependency set targets Python 3.12.13.

## Backend Entrypoint

```python
from drug_repurposing_engine import generate_drug_explanations

output = generate_drug_explanations(context)
```

`context` must include the locked schema field `pdb_id`; missing `pdb_id` raises `ValueError("Missing required field: pdb_id")`.

By default the function also verifies that every requested binding residue exists in the fetched PDB coordinates. Set `CHEMBRAIN_STRICT_PDB_RESIDUES=0` only for debugging; the demo path should leave strict validation on.

## Model Behavior

- BioMedLM is loaded lazily, only when text generation is invoked.
- IPEX/XPU is attempted first at runtime.
- If IPEX or XPU is unavailable, CPU `torch.float32` is used.
- `device_map="auto"` and `torch.float16` are not used.
- If BioMedLM fails or fails the prompt-repeat/pathway smoke heuristic, BioGPT is loaded as fallback.
- Set `CHEMBRAIN_FORCE_BIOGPT=1` to exercise the fallback path directly after a failed or too-slow BioMedLM warmup.
- Set `CHEMBRAIN_MODEL_TEST_TOKENS` to tune the BioMedLM self-test generation length; the required default is `200`.

## Formula Note

For the sample Metformin context, the code computes:

```text
ΔG = RT ln(Kd)
Kd ≈ IC50 = 8.3 µM = 8.3e-6 M
T = 310 K
ΔG ≈ -7.21 kcal/mol
```

This value is computed directly from the input IC50, so it supersedes any illustrative mockup value.

## Run The Interactive Demo

Generate a browser-viewable py3Dmol simulation page:

```powershell
$env:PYTHONPATH = "$PWD\.runtime_packages;$PWD\.python_packages"
C:\Users\adian\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe run_demo.py
```

Then open:

```text
D:\ChemBrain\demo_output\simulation_demo.html
```

The generated page is interactive: rotate, zoom, pan, and inspect the 3D drug and protein. It is a real-time 3D molecular visualization, not a full molecular dynamics trajectory.
