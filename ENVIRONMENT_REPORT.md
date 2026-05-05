# Environment Report

Date: 2026-05-05

## Required Checks

| Check | Result |
|---|---|
| `lspci | grep -i "display\|vga\|intel"` | Not available on this Windows host: `lspci` is not recognized. |
| Windows GPU equivalent | `Intel(R) Arc(TM) 140V GPU (16GB)`, driver `32.0.101.6987`. |
| `free -h` | Not available on this Windows host. |
| Windows RAM equivalent | Total physical memory: `33,630,724,096 bytes` (~31.3 GiB usable); free physical memory at check time: `12,729,692 KiB` (~12.1 GiB). |
| `df -h` | Not available on this Windows host. |
| Windows disk equivalent | Drive `D:` size `1,024,191,361,024 bytes`; free `672,527,642,624 bytes` (~626 GiB). |
| `python --version` | Broken host launcher: unable to create `C:\Users\adian\AppData\Local\Programs\Python\Python312\python.exe`. |
| `py --version` | `Python 3.14.3`, but too new for a reliable PyTorch/RDKit install path. |
| Bundled runtime | `Python 3.12.13`, used for this workspace. |

## Hardware Decision

- Total RAM is above 16 GiB, so Intel IPEX acceleration was attempted.
- `pip install intel-extension-for-pytorch` failed with no compatible distribution for this Windows/Python 3.12 environment.
- Active runtime decision: CPU inference with `torch.float32`.
- `torch` import check: `2.11.0+cpu`; `torch.xpu` exists, but `torch.xpu.is_available()` is `False`.

## Dependency Install Notes

- Core AI dependencies installed into `D:\ChemBrain\.python_packages`.
- `rdkit-pypi` had no compatible Python 3.12 wheel here.
- Installed compatible `rdkit` package instead; it provides the same `from rdkit import Chem` API used by the code.
- Installed molecular/scientific dependencies: `rdkit`, `py3Dmol`, `scipy`, `numpy`, `matplotlib`, `biopython`, `requests`.
- Added `sacremoses` after fallback validation showed it is required by `BioGptTokenizer`.
- Added `chardet` to suppress `requests` character detector warnings in this sandbox.

## Model Loading Outcome

- BioMedLM was attempted with the Hugging Face cache pinned to `D:\ChemBrain\.hf_cache`.
- The BioMedLM CPU warmup did not complete within a 30-minute timeout and left a long-running Python process using ~12 GB RAM; the process was stopped.
- BioGPT fallback was then forced with `CHEMBRAIN_FORCE_BIOGPT=1` and successfully loaded on CPU.
- Fallback smoke output: `metformin inhibits pancreatic cancer cell growth by targeting the mTOR pathway.`
- Live inference status for this machine: BioGPT fallback is demo-ready; BioMedLM should be pre-warmed well before the demo if it remains the preferred primary model.
