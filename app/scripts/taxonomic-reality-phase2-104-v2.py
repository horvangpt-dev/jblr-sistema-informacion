#!/usr/bin/env python3
import importlib.util
from pathlib import Path

BASE = Path(__file__).with_name("taxonomic-reality-phase2-104-v1.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_phase2_v1", BASE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# v1 reuses the validated v4 reader through the v6 module; expose the alias explicitly.
mod.v4 = mod.v6.v4

if __name__ == "__main__":
    mod.main()
