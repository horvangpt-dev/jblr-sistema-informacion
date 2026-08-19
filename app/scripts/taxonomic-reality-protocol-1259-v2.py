#!/usr/bin/env python3
import csv
import hashlib
import importlib.util
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

BASE = Path(__file__).with_name("taxonomic-reality-protocol-1259.py")
SPEC = importlib.util.spec_from_file_location("taxonomic_reality_v1", BASE)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

ANTHOS_ARCHIVE_URL = "https://ipt.gbif.es/archive.do?r=rjb-anthos"
ANTHOS_DATASET_URL = "https://www.gbif.org/dataset/4cf3eec1-b902-40c9-b15b-05c5fe5928b6"
ANTHOS_SOURCE = "ANTHOS_RJB_CSIC_DWCA_VIA_GBIF_SPAIN_IPT"


def _norm(s):
    s = (s or "").replace("×", "x")
    return re.sub(r"\s+", " ", s.strip()).casefold()


def _decode_sep(value, default="\t"):
    if value is None:
        return default
    if value == "\\t":
        return "\t"
    if value == "\\n":
        return "\n"
    if value == "\\r\\n":
        return "\r\n"
    return value


def _term_tail(term):
    return (term or "").rsplit("/", 1)[-1].rsplit("#", 1)[-1]


class AnthosArchive:
    """Exact-name lookup against the official ANTHOS DwC-A published by RJB-CSIC.

    This changes only the transport/access route. It does not substitute another
    taxonomic source and does not infer synonymy when the exact JBLR string is absent.
    """

    def __init__(self):
        self.index = None
        self.archive_sha256 = ""
        self.archive_bytes = 0
        self.location = ""
        self.scientific_name_field = ""
        self.accepted_field = ""
        self.status_field = ""
        self.debug = {}

    def start(self):
        if self.index is not None:
            return
        r = requests.get(
            ANTHOS_ARCHIVE_URL,
            timeout=180,
            allow_redirects=True,
            headers={"User-Agent": mod.UA, "Accept": "application/zip,*/*"},
        )
        r.raise_for_status()
        payload = r.content
        if len(payload) < 100000:
            raise RuntimeError(f"ANTHOS_ARCHIVE_TOO_SMALL bytes={len(payload)}")
        self.archive_bytes = len(payload)
        self.archive_sha256 = hashlib.sha256(payload).hexdigest()

        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            names = set(zf.namelist())
            if "meta.xml" not in names:
                raise RuntimeError("ANTHOS_DWCA_META_XML_NOT_FOUND")
            root = ET.fromstring(zf.read("meta.xml"))
            core = root.find("{*}core")
            if core is None:
                raise RuntimeError("ANTHOS_DWCA_CORE_NOT_FOUND")
            loc = core.find("{*}files/{*}location")
            if loc is None or not (loc.text or "").strip():
                raise RuntimeError("ANTHOS_DWCA_CORE_LOCATION_NOT_FOUND")
            self.location = loc.text.strip()
            if self.location not in names:
                raise RuntimeError(f"ANTHOS_DWCA_CORE_FILE_MISSING {self.location}")

            encoding = core.attrib.get("encoding", "UTF-8")
            delimiter = _decode_sep(core.attrib.get("fieldsTerminatedBy"), "\t")
            quotechar = _decode_sep(core.attrib.get("fieldsEnclosedBy"), '"') or '"'
            ignore_headers = int(core.attrib.get("ignoreHeaderLines", "0") or 0)
            fields = {}
            for f in core.findall("{*}field"):
                try:
                    idx = int(f.attrib["index"])
                except Exception:
                    continue
                fields[_term_tail(f.attrib.get("term", ""))] = idx

            sci_idx = fields.get("scientificName")
            if sci_idx is None:
                raise RuntimeError("ANTHOS_DWCA_SCIENTIFIC_NAME_FIELD_NOT_FOUND")
            accepted_idx = fields.get("acceptedNameUsage")
            status_idx = fields.get("taxonomicStatus")
            self.scientific_name_field = "scientificName"
            self.accepted_field = "acceptedNameUsage" if accepted_idx is not None else ""
            self.status_field = "taxonomicStatus" if status_idx is not None else ""

            index = {}
            total_rows = 0
            with zf.open(self.location) as raw:
                text = io.TextIOWrapper(raw, encoding=encoding, errors="replace", newline="")
                reader = csv.reader(text, delimiter=delimiter, quotechar=quotechar)
                for _ in range(ignore_headers):
                    next(reader, None)
                for row in reader:
                    total_rows += 1
                    if sci_idx >= len(row):
                        continue
                    raw_name = row[sci_idx].strip()
                    key = _norm(raw_name)
                    if not key:
                        continue
                    if key not in index:
                        index[key] = {
                            "scientific_name": raw_name,
                            "accepted_name": row[accepted_idx].strip() if accepted_idx is not None and accepted_idx < len(row) else "",
                            "taxonomic_status": row[status_idx].strip() if status_idx is not None and status_idx < len(row) else "",
                        }
            if total_rows < 100000:
                raise RuntimeError(f"ANTHOS_DWCA_UNEXPECTED_ROW_COUNT rows={total_rows}")
            self.index = index
            self.debug = {
                "source": ANTHOS_SOURCE,
                "archive_url": ANTHOS_ARCHIVE_URL,
                "dataset_url": ANTHOS_DATASET_URL,
                "archive_sha256": self.archive_sha256,
                "archive_bytes": self.archive_bytes,
                "core_location": self.location,
                "core_rows": total_rows,
                "unique_scientific_names": len(index),
                "scientific_name_field": self.scientific_name_field,
                "accepted_field": self.accepted_field,
                "status_field": self.status_field,
            }

    def search(self, target):
        try:
            if self.index is None:
                self.start()
            rec = self.index.get(_norm(target))
            if rec is None:
                return {
                    "state": "EXACT_QUERY_NOT_FOUND",
                    "http_status": "DWCA",
                    "search_url": ANTHOS_DATASET_URL,
                    "detail_url": "",
                    "matched_label": "",
                    "taxonomic_status": "",
                    "accepted_name": "",
                    "threat_reference": "",
                    "page_sha256": self.archive_sha256,
                    "error": "",
                }
            return {
                "state": "EXACT_QUERY_FOUND",
                "http_status": "DWCA",
                "search_url": ANTHOS_DATASET_URL,
                "detail_url": "",
                "matched_label": rec["scientific_name"],
                "taxonomic_status": rec["taxonomic_status"],
                "accepted_name": rec["accepted_name"],
                "threat_reference": "",
                "page_sha256": self.archive_sha256,
                "error": "",
            }
        except Exception as ex:
            return {
                "state": "SOURCE_ERROR",
                "http_status": "DWCA",
                "search_url": ANTHOS_DATASET_URL,
                "detail_url": "",
                "matched_label": "",
                "taxonomic_status": "",
                "accepted_name": "",
                "threat_reference": "",
                "page_sha256": self.archive_sha256,
                "error": str(ex)[:500],
            }

    def close(self):
        return None


mod.Anthos = AnthosArchive

if __name__ == "__main__":
    if "--preflight" in sys.argv:
        mod.preflight()
    elif "--run" in sys.argv:
        mod.run()
    else:
        raise SystemExit("Use --preflight or --run")
