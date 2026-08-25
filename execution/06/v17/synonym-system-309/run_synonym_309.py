#!/usr/bin/env python3
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

RUN_ID = "06_SYNONYM_SYSTEM_309_V17_20260825_001"
SOURCE_BATCH_ID = "CORPUS_B_NEW_309_v17"
SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_NEW_309_v17"
AUTHORIZATION_EVENT = "JBLR-EVT-0000-20260825-EXECUTE-SYNONYM-SYSTEM-309-V17-001"
EXPECTED_INPUT_BLOB = "9d0f0711854e4af785535cb0289c20d5ac47dd11"
TARGET_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"

def must_replace(text, old, new, expected=1):
    n = text.count(old)
    if n != expected:
        raise RuntimeError(f"PATCH_PRECONDITION_FAILED count={n} expected={expected} old={old!r}")
    return text.replace(old, new)

def expected_rank_from_verbatim(name):
    n = " " + re.sub(r"\s+", " ", (name or "").casefold()).strip() + " "
    if re.search(r"\b(?:nothosubsp|subsp|ssp)\.?(?=\s)", n):
        return "subspecies"
    if re.search(r"\bvar\.?(?=\s)", n):
        return "variety"
    if re.search(r"\bf\.?(?=\s)", n):
        return "form"
    return "species"

def explicit_hybrid_formula(name):
    n = " " + re.sub(r"\s+", " ", (name or "").replace("Ã—", " x ").casefold()).strip() + " "
    return bool(re.search(r"\s+x\s+", n))

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def save_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def main():
    if len(sys.argv) != 6:
        raise SystemExit("usage: run_synonym_309.py ORIGINAL_ENGINE SOURCE_309_JSON EIDOS_TTL OUT_DIR REQUEST_JSON")
    engine_path, group_path, eidos_path, out_dir, request_path = map(Path, sys.argv[1:])
    req = load_json(request_path)

    assert req["enabled"] is True
    assert req["actor"] == "06"
    assert req["runId"] == RUN_ID
    assert req["sourceBatchId"] == SOURCE_BATCH_ID
    assert req["scope"] == 309
    assert req["authorizationEvent"] == AUTHORIZATION_EVENT
    assert req["inputBlobSha"] == EXPECTED_INPUT_BLOB
    assert req["crossWithA"] is False
    assert req["corpusBFreeze"] is False
    assert req["neonWrites"] == 0 and req["databaseWrites"] == 0
    assert req["noFuzzy"] is True
    assert req["noParentIdInheritance"] is True
    assert req["noRankCollapse"] is True
    assert req["downstreamStimesAuthorized"] is False
    assert req["guards"]["sameSpeciesNotSameInfraspecificTaxon"] is True
    assert req["guards"]["hybridGuard"] is True
    assert req["guards"]["sourceVerbatimPreserved"] is True
    assert req["guards"]["closed1953Untouched"] is True
    assert req["engineReuse"]["reuseType"] == "TECHNICAL_ENGINE_ONLY"
    assert req["engineReuse"]["priorResultsImported"] is False

    source = load_json(group_path)
    rows = source["groups"][TARGET_GROUP]
    assert len(rows) == 309
    ids = [str(x["B_SOURCE_RECORD_ID"]) for x in rows]
    assert len(set(ids)) == 309
    assert all((x.get("name") or "").strip() for x in rows)

    original = engine_path.read_text(encoding="utf-8")
    patched = original
    patched = must_replace(
        patched,
        'RUN_ID = "06_CORPUS_B_UNRESOLVED_185_TAXONOMY_20260824_001"',
        f'RUN_ID = "{RUN_ID}"'
    )
    patched = must_replace(
        patched,
        'SOURCE_BATCH_ID = "CORPUS_B_UNRESOLVED_185_v1"',
        f'SOURCE_BATCH_ID = "{SOURCE_BATCH_ID}"'
    )
    patched = must_replace(
        patched,
        'SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_185_v1"',
        f'SNAPSHOT_VERSION = "{SNAPSHOT_VERSION}"'
    )
    patched = must_replace(
        patched,
        'EXPECTED_INPUT_BLOB = "ef5192304fa22c2ca8a9daffd67f58aa9c4827de!Ëˆ‰ÑVPÕQÒS”UĞ“ĞˆHÑVPÕQÒS”UĞ“ĞŸH‰Âˆ
Bˆ]ÚYH]\İÜ™\XÙJˆ]ÚYˆ	Ø\ÜÙ\™\VÈœØÛÜH—HOHNH[™™\VÈ˜Ü›ÜÜÕÚ]H—H\È˜[ÙIËˆ	Ø\ÜÙ\™\VÈœØÛÜH—HOHÌH[™™\VÈ˜Ü›ÜÜÕÚ]H—H\È˜[ÙIÂˆ
Bˆ]ÚYH]\İÜ™\XÙJ]ÚY	Ø\ÜÙ\[Š›İÜÊHOHNK[Š›İÜÊIË	Ø\ÜÙ\[Š›İÜÊHOHÌK[Š›İÜÊIÊBˆ]ÚYH]\İÜ™\XÙJ]ÚY	Ø\ÜÙ\[ŠÙ]
YÊJHOHNIË	Ø\ÜÙ\[ŠÙ]
YÊJHOHÌIÊBˆ]ÚYH]\İÜ™\XÙJ]ÚY	Èš[œ]Ûİ[NHˆ[Š[ZÙJHOHNK	Ë	Èš[œ]Ûİ[ÌHˆ[Š[ZÙJHOHÌK	ÊBˆ]ÚYH]\İÜ™\XÙJˆ]ÚYˆ	È[š\]YTÛİ\˜ÙT™XÛÜ™YÌNHˆ[ŠŞÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—H›Üˆ[ˆ[ZÙ_JHOHNK	Ëˆ	È[š\]YTÛİ\˜ÙT™XÛÜ™YÌÌHˆ[ŠŞÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—H›Üˆ[ˆ[ZÙ_JHOHÌK	Âˆ
Bˆ]ÚYH]\İÜ™\XÙJ]ÚY	ÈšY[]PÛİ[NHˆ[ŠY[]Y\ÊHOHNK	Ë	ÈšY[]PÛİ[ÌHˆ[ŠY[]Y\ÊHOHÌK	ÊBˆ]ÚYH]\İÜ™\XÙJ]ÚY	ÈšYİ]PÛİ[NHˆ[ŠYİ]\ÊHOHNK	Ë	ÈšYİ]PÛİ[ÌHˆ[ŠYİ]\ÊHOHÌK	ÊBˆ]ÚYH]\İÜ™\XÙJ]ÚY	ÈœÛ˜\ÚİÛİ[NHˆ[ŠÛ˜\ÚİÊHOHNK	Ë	ÈœÛ˜\ÚİÛİ[ÌHˆ[ŠÛ˜\ÚİÊHOHÌK	ÊBˆ]ÚYH]\İÜ™\XÙJˆ]ÚYˆ	Èš[œ]›İÜÈˆNKœ›ØÙ\ÜÙY›İÜÈˆ[ŠYİ]\ÊK	Ëˆ	Èš[œ]›İÜÈˆÌKœ›ØÙ\ÜÙY›İÜÈˆ[ŠYİ]\ÊK	Âˆ
B‚ˆÛÙ]XİH	ÉÉÙYˆ]XİÜ˜[šÊ˜[YJN‚ˆˆH›Ü›J˜[YJBˆYˆˆ›İÜİXœÜˆ[ˆˆÜˆˆİXœÜˆ[ˆˆÜˆˆÜÜˆ[ˆ‚ˆ™]\›ˆœİXœÜXÚY\È‚ˆYˆˆ˜\ˆˆ[ˆ‚ˆ™]\›ˆ˜\šY]H‚ˆYˆˆˆˆ[ˆ‚ˆ™]\›ˆ™›Ü›H‚ˆ™]\›ˆœÜXÚY\È‚‰ÉÉÂˆ™]×Ù]XİH	ÉÉÙYˆ]XİÜ˜[šÊ˜[YJN‚ˆˆHˆˆ
È™KœİXŠˆ—ÊÈ‹ˆ‹
˜[YHÜˆˆŠK˜Ø\ÙY›Û

JKœİš\

H
Èˆ‚ˆYˆ™KœÙX\˜Ú
ˆ—ŠÎ››İÜİXœÜİXœÜÜÜ
WÊÏWÊH‹ŠN‚ˆ™]\›ˆœİXœÜXÚY\È‚ˆYˆ™KœÙX\˜Ú
ˆ—˜\—ÊÏWÊH‹ŠN‚ˆ™]\›ˆ˜\šY]H‚ˆYˆ™KœÙX\˜Ú
ˆ—™—ÊÏWÊH‹ŠN‚ˆ™]\›ˆ™›Ü›H‚ˆ™]\›ˆœÜXÚY\È‚‰ÉÉÂˆ]ÚYH]\İÜ™\XÙJ]ÚYÛÙ]Xİ™]×Ù]Xİ
B‚ˆÛÛX\šÙ\œÈH	ÉÉÈÈH™KœİXŠˆ—œÜÜ×ˆ‹œİXœÜˆ‹ÊBˆÈH™KœİXŠˆ—œİXœÜˆ‹œİXœÜˆ‹ÊBˆÈH™KœİXŠˆ—˜\—ˆ‹˜\‹ˆ‹ÊBˆÈH™KœİXŠˆ—™—ˆ‹™‹ˆ‹ÊB‰ÉÉÂˆ™]×ÛX\šÙ\œÈH	ÉÉÈÈH™KœİXŠˆ—œÜÜÊÏWÊH‹œİXœÜˆ‹ÊBˆÈH™KœİXŠˆ—œİXœÜÊÏWÊH‹œİXœÜˆ‹ÊBˆÈH™KœİXŠˆ—˜\—ÊÏWÊH‹˜\‹ˆ‹ÊBˆÈH™KœİXŠˆ—™—ÊÏWÊH‹™‹ˆ‹ÊB‰ÉÉÂˆ]ÚYH]\İÜ™\XÙJ]ÚYÛÛX\šÙ\œË™]×ÛX\šÙ\œÊB‚ˆİ]Ù\‹›ZÙ\Š\™[ÏUYK^\İÛÚÏUYJBˆÚ][\š[K•[\Ü˜\Q\™XİÜJ™Yš^Hš˜›Œ‹\Ş[›Û[LÌKHŠH\È‚ˆ]ÚYÙ[™Ú[™HH]

HÈ^Û›Û^WÜŞ[›Û[WÌÌKœH‚ˆ]ÚYÙ[™Ú[™KÜš]Wİ^
]ÚY[˜ÛÙ[™ÏH]‹NŠB‚ˆÜXÈH[\ÜX‹][œÜX×Ùœ›ÛWÙš[WÛØØ][ÛŠš˜›Œ—ÜŞ[›Û[LÌWÙ[™Ú[™H‹]ÚYÙ[™Ú[™JBˆ[ÙH[\ÜX‹][›[Ù[WÙœ›ÛWÜÜXÊÜXÊBˆÜXË›ØY\‹™^X×Û[Ù[J[Ù
Bˆ˜[š×ØØ\Ù\ÈHÂˆ]™[[HÙ[™[œÚ\ÈİXœÜˆ›ÛY\›Ë^˜\˜ÛÚHˆœİXœÜXÚY\È‹ˆ[\š[Ü˜Ú\ÈÛÜš[ÜÜ˜H˜\‹ˆØ\œ][˜Hˆ˜\šY]H‹ˆ’Y\˜XÚ][HXİXÙ[HİXœÜˆXİXÙ[HˆœİXœÜXÚY\È‹ˆš\Øİ][H˜[[[˜H˜\‹ˆ˜\šYYØ]Hˆ˜\šY]H‹ˆY[›ØØ\œ\È\Ü[šXİ\ÈİXœÜˆ™Z[[œÙHˆœİXœÜXÚY\È‹ˆ“]Ü™[H[šY›Ü˜HˆœÜXÚY\È‹ˆBˆ›Üˆ˜[YK^XİY[ˆ˜[š×ØØ\Ù\Ëš][\Ê
N‚ˆXİX[H[Ù™]XİÜ˜[šÊ˜[YJBˆYˆXİX[OH^XİY‚ˆ˜Z\ÙH[[YQ\œ›ÜŠˆ”S’×ÕS’UÕTÕÑRSQÛ˜[Y_NÙ^XİYNØXİX[HŠBˆYˆ‹‹ˆˆ[ˆ[Ù˜Ø[›ÛšXØ[
˜[YJN‚ˆ˜Z\ÙH[[YQ\œ›ÜŠˆ‘ÕP“WÔT’SÑÕS’UÕTÕÑRSQÛ˜[Y_HŠB‚ˆİXœ›ØÙ\ÜËœ[ŠˆÜŞ\Ë™^Xİ]X›KİŠ]ÚYÙ[™Ú[™JKİŠÜ›İ\Ü]
KİŠZYÜ×Ü]
KİŠİ]Ù\ŠKİŠ™\]Y\İÜ]
WKˆÚXÚÏUYBˆ
B‚ˆ™XÙZ\Ü]Hİ]Ù\ˆÈ”•S—Ô‘PÑRTšœÛÛˆ‚ˆYˆ›İ™XÙZ\Ü]™^\İÊ
N‚ˆ˜Z\ÙH[[YQ\œ›ÜŠ”•S—Ô‘PÑRTÓRTÔÒS‘ÈŠBˆ™XÙZ\HØYÚœÛÛŠ™XÙZ\Ü]
BˆYˆ™XÙZ\™Ù]
œİÜ™\]Z\™YŠN‚ˆ™]\›‚‚ˆ[ZÙWÙØÈHØYÚœÛÛŠİ]Ù\ˆÈ”ÓÕTÑWÒS•RÑWÔ‘PÑRTËšœÛÛˆŠBˆY[]Y\×ÙØÈHØYÚœÛÛŠİ]Ù\ˆÈ•VÓ“ÓRP×ÒQS•UWÔ‘TÕSËšœÛÛˆŠBˆY×ÙØÈHØYÚœÛÛŠİ]Ù\ˆÈ’QÕVÓ—ÔÕUWÔ‘TÕSËšœÛÛˆŠBˆÛ˜\×ÙØÈHØYÚœÛÛŠİ]Ù\ˆÈ•VÓ“ÓRP×ÔÓTÒÕËšœÛÛˆŠBˆ›İ—ÙØÈHØYÚœÛÛŠİ]Ù\ˆÈ”UQT–WÔ“Õ‘SSÑWÓQÑT‹šœÛÛˆŠB‚ˆ[ZÙHH[ZÙWÙØÖÈœ›İÜÈ—BˆY[]Y\ÈHY[]Y\×ÙØÖÈœ›İÜÈ—BˆYİ]\ÈHY×ÙØÖÈœ›İÜÈ—BˆÛ˜\ÚİÈHÛ˜\×ÙØÖÈœ›İÜÈ—Bˆ\ÜÙ\[Š[ZÙJHOH[ŠY[]Y\ÊHOH[ŠYİ]\ÊHOH[ŠÛ˜\ÚİÊHOHÌB‚ˆY[]WØWÚYHÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JNˆ›Üˆ[ˆY[]Y\ßBˆYİ]WØWÚYHÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JNˆ›Üˆ[ˆYİ]\ßBˆÛ˜\ØWÚYHÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JNˆ›Üˆ[ˆÛ˜\ÚİßBˆXœšYÙİX\™YH×B‚ˆ›ÜˆÜ˜È[ˆ[ZÙN‚ˆšYHİŠÜ˜ÖÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JBˆ™\˜˜][HHÜ˜ÖÈ““ÓP”‘WĞ’SÑU‘T”ÒQQÔ’SÒSWÕ‘TUSH—Bˆ^XİYÜ˜[šÈH^XİYÜ˜[š×Ùœ›ÛWİ™\˜˜][J™\˜˜][JBˆYˆÜ˜ÖÈœ™\]Z\™Y˜[šÈ—HOH^XİYÜ˜[šÎ‚ˆ˜Z\ÙH[[YQ\œ›ÜŠˆ”S’×ÑÕPT‘ÑRSQÜšYNİ™\˜˜][_NÜÜ˜ÖÉÜ™\]Z\™Y˜[šÉ×_NÙ^XİYÜ˜[šßHŠBˆYˆ‹‹ˆˆ[ˆ
Ü˜Ë™Ù]
œ\œÙYØÚY[YšXÓ˜[YHŠHÜˆˆŠN‚ˆ˜Z\ÙH[[YQ\œ›ÜŠˆ‘ÕP“WÔT’SÑÔT”ÑQÓSQNÜšYNÜÜ˜Ë™Ù]
	Ü\œÙYØÚY[YšXÓ˜[YIÊ_HŠB‚ˆYˆ^XÚ]ÚXœšYÙ›Ü›][J™\˜˜][JN‚ˆY[HY[]WØWÚYÜšYBˆYÜ›İÈHYİ]WØWÚYÜšYBˆÛ˜\HÛ˜\ØWÚYÜšYBˆYÜ›İÖÈ’QÕVÓ—ÑVPÕ—HH›Û™BˆYÜ›İÖÈ’QÕVÓ—ÔÕUH—HHÓÓ‘“PÕÒP”’QÑ“Ô“USWÔ‘TURT‘T×ÑVPÒUÒQS•UWÑU’QSÑH‚ˆY[ÈšY[]Tİ]H—HHYÜ›İÖÈ’QÕVÓ—ÔÕUH—BˆY[È›˜[YT™XÛÛ˜Ú[Y—HH™\˜˜][BˆÛ˜\È’QÕVÓ—ÑVPÕ—HH›Û™BˆÛ˜\È’QÕVÓ—ÔÕUH—HHYÜ›İÖÈ’QÕVÓ—ÔÕUH—BˆÛ˜\È›˜[YT™XÛÛ˜Ú[Y—HH™\˜˜][BˆÛ˜\È™ZYÜĞXØÙ\Y™XÛÜ™—HH›Û™BˆXœšYÙİX\™Y˜\[™
È—ÔÓÕTÑWÔ‘PÓÔ‘ÒQˆšY›˜[YU™\˜˜][Hˆ™\˜˜][_JB‚ˆ[œ™\ÛÛ™YH×Bˆ›ÜˆÜ˜È[ˆ[ZÙN‚ˆšYHİŠÜ˜ÖÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JBˆYÜ›İÈHYİ]WØWÚYÜšYBˆYˆYÜ›İÖÈ’QÕVÓ—ÑVPÕ—H\È›Û™N‚ˆY[HY[]WØWÚYÜšYBˆ[œ™\ÛÛ™Y˜\[™
Âˆ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQˆšYˆ›˜[YU™\˜˜][HˆÜ˜ÖÈ““ÓP”‘WĞ’SÑU‘T”ÒQQÔ’SÒSWÕ‘TUSH—Kˆœİ]HˆYÜ›İÖÈ’QÕVÓ—ÔÕUH—Kˆ™Øİ[Y[Y]Y\S˜[Y\ÈˆY[™Ù]
™Øİ[Y[Y]Y\S˜[Y\È‹×JKˆJB‚ˆ™\ÛÛ™YØÛİ[Hİ[JH›Üˆ[ˆYİ]\ÈYˆÈ’QÕVÓ—ÑVPÕ—H\È›İ›Û™JBˆÛÛ™›XİØÛİ[Hİ[JH›Üˆ[ˆYİ]\ÈYˆİŠÈ’QÕVÓ—ÔÕUH—JKœİ\İÚ]
ÓÓ‘“PÕÈŠJBˆ\™Wİ[œ™\ÛÛ™YHÌHH™\ÛÛ™YØÛİ[HÛÛ™›XİØÛİ[‚ˆØ]™WÚœÛÛŠİ]Ù\ˆÈ•VÓ“ÓRP×ÒQS•UWÔ‘TÕSËšœÛÛˆ‹Y[]Y\×ÙØÊBˆØ]™WÚœÛÛŠİ]Ù\ˆÈ’QÕVÓ—ÔÕUWÔ‘TÕSËšœÛÛˆ‹Y×ÙØÊBˆØ]™WÚœÛÛŠİ]Ù\ˆÈ•VÓ“ÓRP×ÔÓTÒÕËšœÛÛˆ‹Û˜\×ÙØÊBˆØ]™WÚœÛÛŠİ]Ù\ˆÈ•S”‘TÓÓ‘QÓÔ—ĞÓÓ‘“PÕËšœÛÛˆ‹Èœ[’Yˆ•S—ÒQœ›İÜÈˆ[œ™\ÛÛ™YJBˆØ]™WÚœÛÛŠİ]Ù\ˆÈ’P”’QÑ“Ô“USWÑÕPT‘šœÛÛˆ‹Èœ[’Yˆ•S—ÒQ™İX\™Y›İÜÈˆXœšYÙİX\™YJB‚ˆXHHØYÚœÛÛŠİ]Ù\ˆÈ”PWÔ‘TÔ•šœÛÛˆŠBˆÚXÚÜÈHXKœÙ]Y˜][
˜ÚXÚÜÈ‹ßJBˆÚXÚÜÖÈš[œ]Ûİ[ÌH—HH[Š[ZÙJHOHÌBˆÚXÚÜÖÈ[š\]YTÛİ\˜ÙT™XÛÜ™YÌÌH—HH[ŠÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JH›Üˆ[ˆ[ZÙ_JHOHÌBˆÚXÚÜÖÈœ˜[šÑİX\™ÌH—HH[
ˆÈœ™\]Z\™Y˜[šÈ—HOH^XİYÜ˜[š×Ùœ›ÛWİ™\˜˜][JÈ““ÓP”‘WĞ’SÑU‘T”ÒQQÔ’SÒSWÕ‘TUSH—JBˆ›Üˆ[ˆ[ZÙBˆ
BˆÚXÚÜÖÈ››ÑİX›T\š[ÙÌH—HH[
‹‹ˆˆ›İ[ˆ
™Ù]
œ\œÙYØÚY[YšXÓ˜[YHŠHÜˆˆŠH›Üˆ[ˆ[ZÙJBˆÚXÚÜÖÈšXœšY›Ü›][QİX\™\YY—HH[
ˆYİ]WØWÚYÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JWVÈ’QÕVÓ—ÑVPÕ—H\È›Û™Bˆ[™Yİ]WØWÚYÜİŠÈ—ÔÓÕTÑWÔ‘PÓÔ‘ÒQ—JWVÈ’QÕVÓ—ÔÕUH—BˆOHÓÓ‘“PÕÒP”’QÑ“Ô“USWÔ‘TURT‘T×ÑVPÒUÒQS•UWÑU’QSÑH‚ˆ›Üˆ[ˆXœšYÙİX\™Yˆ
BˆÚXÚÜÖÈ˜ÛÜÙYNMLÕ[İXÚY—HHYBˆXVÈœ\ÜÈ—HH›ÛÛ
XK™Ù]
œ\ÜÈŠJH[™[
›ÛÛ
ŠH›Üˆˆ[ˆÚXÚÜË˜[Y\Ê
JBˆXVÈšXœšY›Ü›][QİX\™YÛİ[—HH[ŠXœšYÙİX\™Y
BˆØ]™WÚœÛÛŠİ]Ù\ˆÈ”PWÔ‘TÔ•šœÛÛˆ‹XJB‚ˆ™XÙZ\\]JÂˆš[œ]›İÜÈˆÌKˆœ›ØÙ\ÜÙY›İÜÈˆÌKˆœ™\ÛÛ™YÛİ[ˆ™\ÛÛ™YØÛİ[ˆ[œ™\ÛÛ™YÜÛÛ™›XİÛİ[ˆ[Š[œ™\ÛÛ™Y
Kˆ˜ÛÛ™›XİÛİ[ˆÛÛ™›XİØÛİ[ˆœ\™U[œ™\ÛÛ™YÛİ[ˆ\™Wİ[œ™\ÛÛ™YˆšXœšY›Ü›][QİX\™YÛİ[ˆ[ŠXœšYÙİX\™Y
Kˆ™^\İ[™ĞÛÜœ\Óİ™\Üš][ˆˆ˜[ÙKˆ™İÛœİ™X[Tİ[Y\Ñ^Xİ]Yˆ˜[ÙKˆœİ]Hˆ”TÑLWÕVÓ“ÓRP×ĞÓÓTUWÔÕÔĞ‘Q“Ô‘WÑÕÓ”Õ‘PSWÔÕSQTÈˆYˆXVÈœ\ÜÈ—H[ÙH”ÕÔÔ‘TURT‘QÔPWÑRST‘H‹ˆœİÜ™\]Z\™Yˆ›İXVÈœ\ÜÈ—KˆœİÜ™X\ÛÛˆˆ›Û™HYˆXVÈœ\ÜÈ—H[ÙH”PWÑRST‘WĞQ•T—ÌÌWÑÕPT‘È‹ˆJBˆØ]™WÚœÛÛŠ™XÙZ\Ü]™XÙZ\
B‚ˆ™\ÜÜ]Hİ]Ù\ˆÈ”‘TÔ•Õ×ÌšœÛÛˆ‚ˆ™\ÜHØYÚœÛÛŠ™\ÜÜ]
HYˆ™\ÜÜ]™^\İÊ
H[ÙHßBˆ™\Ü\]J™XÙZ\
Bˆ™\ÜÈ˜]]Üš^˜][Û‘]™[—HHUUÔ’VUSÓ—ÑU‘S•ˆ™\ÜÈ™İX\™YXœšY›Ü›][T›İÜÈ—HHXœšYÙİX\™Yˆ™\ÜÈœÙ[X[XÜÌÌH—HHÂˆ”‘PSUWÑ’T”Õ‹”T”ÒTÕQÑU’QSÑWÑ’T”Õ‹““×ÔÒSS•ÒS‘‘T‘SÑH‹ˆ““×Ñ•V––H‹““×ÔS’×ĞÓÓTÑH‹““×ÔT‘S•ÒQÒS’T’USÑH‹ˆ”ĞSQWÔÔPÒQTÈOTĞSQWÒS‘”TÔPÒQ’P×ÕVÓˆ‹ˆ”ÓÕTÑWÑRST‘HOS“ÕÑ“ÕS‘‹•S”‘TÓÓ‘QOPP”ÑSÑH‚ˆBˆØ]™WÚœÛÛŠ™\ÜÜ]™\Ü
B‚ˆ›İ—ÙØÖÈšXœšY›Ü›][QİX\™—HHÈœİ]HˆTQQ‹™İX\™Y›İÜÈˆXœšYÙİX\™YBˆØ]™WÚœÛÛŠİ]Ù\ˆÈ”UQT–WÔ“Õ‘SSÑWÓQÑT‹šœÛÛˆ‹›İ—ÙØÊB‚ˆYˆ›İXVÈœ\ÜÈ—N‚ˆ˜Z\ÙH[[YQ\œ›ÜŠ”PWÑRST‘WĞQ•T—ÌÌWÑÕPT‘ÈŠB‚šYˆ×Û˜[YW×ÈOH—×ÛXZ[—×È‚ˆXZ[Š
B