#!/usr/bin/env python3
import importlib.util
import json
import os
import re
from pathlib import Path

V7_PATH = Path(__file__).with_name("taxonomic-reality-effective-2739-v7.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_effective_v7", V7_PATH)
v7 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v7)

BASE_DWC = v7.v6.v4.RobustDwcIndex
BASE_WFO = v7.v6.WfoStatic
OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_effective_2739_v8"))


def strip_authorship(scientific_name, authorship):
    sci = re.sub(r"\s+", " ", (scientific_name or "").strip())
    auth = re.sub(r"\s+", " ", (authorship or "").strip())
    if auth and sci.endswith(auth):
        sci = sci[:-len(auth)].strip()
    return sci


def has_hybrid_marker(name):
    s = name or ""
    return "×" in s or bool(re.search(r"(^|\s)[xX](?=\s|[A-Za-zÀ-ÖØ-öø-ÿ])", s))


def remove_hybrid_marker(name):
    s = (name or "").replace("×", " x ")
    s = re.sub(r"\s+[xX]\s*", " ", s, count=1)
    return re.sub(r"\s+", " ", s).strip()


def hybrid_alias_from_record(rec, norm_fn):
    scientific = rec.get("scientific_name", "")
    if not has_hybrid_marker(scientific):
        return ""
    canonical = strip_authorship(scientific, rec.get("authorship", ""))
    return norm_fn(canonical)


class HybridAwareDwcIndex(BASE_DWC):
    """Preserve the hybrid marker from scientificName when genus/epithet canonicalization drops it."""

    def start(self):
        super().start()
        aliases = 0
        additions = {}
        for rec in list(self.index.values()):
            alias = hybrid_alias_from_record(rec, v7.v6.v4.mod.norm)
            if alias and alias not in self.index and alias not in additions:
                additions[alias] = rec
                aliases += 1
        self.index.update(additions)
        self.meta = dict(self.meta)
        self.meta["hybrid_marker_aliases_added"] = aliases
        self.meta["hybrid_parser_patch"] = "SCIENTIFIC_NAME_HYBRID_MARKER_ALIAS_v8"


class HybridAwareWfoStatic(BASE_WFO):
    """Expand target keys so WFO rows are captured even if reconstructed canonical names omit ×/x."""

    def __init__(self, targets):
        expanded = list(targets)
        for target in targets:
            if has_hybrid_marker(target):
                expanded.append(remove_hybrid_marker(target))
        super().__init__(expanded)
        self.requested_target_count_before_hybrid_expansion = len({v7.v6.norm(t) for t in targets if v7.v6.norm(t)})

    def start(self):
        super().start()
        aliases = 0
        additions = {}
        for rec in list(self.index.values()):
            alias = hybrid_alias_from_record(rec, v7.v6.norm)
            if alias and alias not in self.index and alias not in additions:
                additions[alias] = rec
                aliases += 1
        self.index.update(additions)
        self.meta = dict(self.meta)
        self.meta["requested_targets_before_hybrid_expansion"] = self.requested_target_count_before_hybrid_expansion
        self.meta["hybrid_marker_aliases_added"] = aliases
        self.meta["hybrid_parser_patch"] = "SCIENTIFIC_NAME_HYBRID_MARKER_ALIAS_v8"


def postprocess_v8():
    # v7 is retained untouched as historical evidence. This wrapper only versions the new outputs.
    for path in list(OUT.glob("*V7*")):
        new_path = path.with_name(path.name.replace("V7", "V8"))
        path.rename(new_path)

    for path in OUT.glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            execution = data.get("execution")
            if isinstance(execution, str):
                data["execution"] = execution.replace("V7", "V8").replace("v7", "v8")
            data["hybrid_marker_reconciliation_patch"] = "SCIENTIFIC_NAME_HYBRID_MARKER_ALIAS_v8"
            data["supersedes_execution_for_exact_matching"] = "TAXONOMIC_REALITY_EFFECTIVE_2739_V7"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def execute():
    v7.OUT = OUT
    v7.v6.v4.RobustDwcIndex = HybridAwareDwcIndex
    v7.v6.WfoStatic = HybridAwareWfoStatic
    v7.execute()
    postprocess_v8()


if __name__ == "__main__":
    execute()
