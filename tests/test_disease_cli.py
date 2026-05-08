import os
import shutil
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DiseaseCliSmokeTests(unittest.TestCase):
    def test_disease_mode_writes_index(self) -> None:
        out_base = ROOT / "demo_output" / "_cli_smoke_tmp"
        shutil.rmtree(out_base, ignore_errors=True)
        slug_dir = out_base / "disease_nsclc_kras_g12c"

        env = os.environ.copy()
        sep = ";" if sys.platform.startswith("win") else ":"
        extra = sep.join(
            str(p)
            for p in (ROOT / ".python_packages", ROOT / ".runtime_packages")
            if p.exists()
        )
        env["PYTHONPATH"] = sep.join(x for x in (extra, env.get("PYTHONPATH", "")) if x)
        env["CHEMBRAIN_STRICT_PDB_RESIDUES"] = "0"

        cmd = [
            sys.executable,
            str(ROOT / "run_demo.py"),
            "--disease",
            "nsclc_kras_g12c",
            "--top",
            "1",
            "--skip-llm",
            "--allow-missing-residues",
            "--out-dir",
            str(out_base),
        ]
        subprocess.check_call(cmd, cwd=str(ROOT), env=env)

        self.assertTrue((slug_dir / "index.html").is_file())
        self.assertTrue(list(slug_dir.glob("drug_*.html")))
        shutil.rmtree(out_base, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
