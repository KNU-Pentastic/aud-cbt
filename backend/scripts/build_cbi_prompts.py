"""Build CBI prompt source files from the verified catalog xlsx.

Reads `docs/CBI_검증_재분류_정제_검수완료 (2).xlsx`, groups the verified instruction
items by their `라우팅대상` (routing target), drops items that are not usable as an
LLM patient-coach system prompt (page artifacts, therapist admin/form tasks), and
writes one JSON per routing target under:

    backend/app/prompts/cbi/v3/_source/<target>.json   (machine-generated, traceable)

These `_source` files are the raw material. The *curated* Korean assets that the app
actually loads at runtime live next to them as `<target>.json` and are hand-authored
(1차 Claude 정제 + 임상 검토) — this script never overwrites those.

Run:  python backend/scripts/build_cbi_prompts.py
Deps: openpyxl  (dev-only; not a runtime dependency)
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl required: pip install openpyxl")

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "docs" / "CBI_검증_재분류_정제_검수완료 (2).xlsx"
OUT_DIR = ROOT / "backend" / "app" / "prompts" / "cbi" / "v3" / "_source"
CATALOG_VERSION = "v3"

# Sheets that feed patient-facing system prompts. EXAMPLE_CORPUS is excluded on
# purpose (분류기준 v3: vignette/quote 주입 금지). The non-MVP / clinician / data
# layers are not used by the patient app.
INCLUDED_SHEETS = ["COMMON", "PHASE_LLM", "PULLOUT", "OUTPUT_GUARD"]

# PULLOUT sublabels active in the MVP (명세서 v3.0). CRIS is kept but flagged off;
# MISS is dropped.
PULLOUT_ACTIVE = {"RESU", "SOMA", "CRIS"}

# Column indices in every sheet: ID | 원본카테고리 | 원본Ch | Sublabel | 라우팅대상 | 검수상태 | 지시문_정제후
C_ID, C_CAT, C_CH, C_SUB, C_ROUTE, C_REVIEW, C_TEXT = range(7)

# Heuristic junk filters — items that are page artifacts or therapist-only admin and
# must not become coaching instructions. Matched against the instruction text.
_JUNK_PATTERNS = [
    re.compile(r"\bForm\s+[A-Za-z0-9]{1,3}\b"),          # "Form A", "Form oo", "Form 4a"
    re.compile(r"Session Record Form|Working Alliance Inventory|Therapist Form"),
    re.compile(r"questionnaire", re.I),
    re.compile(r"\bCA or NS codes\b|check Yes or No"),
    re.compile(r"\btable\s+\d|\bfigure\s+\d", re.I),       # cross-references to manual tables/figures
    re.compile(r"^\s*[\d.]+[a-z]?\.?\s*$"),                # pure page markers e.g. "2.6l."
]
# Trailing page-number / section-marker pollution to strip from otherwise-good text.
_TRAILING_NOISE = re.compile(r"\s*(?:\d{1,3}\s+)?\d{1,2}\.\d+[a-z]?\.?\s*$")


def _norm_target(raw: str, sublabel: str) -> str | None:
    """Normalise the 라우팅대상 cell into a single canonical asset key."""
    if not raw:
        return None
    r = raw.strip().lower()
    # "output_guard (active in phase_1+)" → "output_guard"  (strip parens first:
    # the '+' inside them must not trigger the split below)
    r = re.sub(r"\s*\(.*?\)\s*", "", r).strip()
    # "pullout_cris_prompt + output_guard" → take the primary (first) target
    r = r.split("+")[0].strip()
    return r or None


def _is_junk(text: str) -> bool:
    if len(text.strip()) < 12:
        return True
    return any(p.search(text) for p in _JUNK_PATTERNS)


def _clean(text: str) -> str:
    t = " ".join(text.split())
    t = _TRAILING_NOISE.sub("", t).strip()
    return t


def main() -> None:
    if not XLSX.exists():
        sys.exit(f"catalog not found: {XLSX}")
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)

    groups: dict[str, list[dict]] = defaultdict(list)
    stats_total: dict[str, int] = defaultdict(int)
    stats_kept: dict[str, int] = defaultdict(int)

    for sheet in INCLUDED_SHEETS:
        ws = wb[sheet]
        for row in list(ws.iter_rows(values_only=True))[1:]:
            if not row or row[C_ID] is None:
                continue
            sub = (str(row[C_SUB]).strip() if row[C_SUB] else "")
            if sheet == "PULLOUT" and sub not in PULLOUT_ACTIVE:
                continue
            target = _norm_target(str(row[C_ROUTE]) if row[C_ROUTE] else "", sub)
            if not target:
                continue
            stats_total[target] += 1
            text = _clean(str(row[C_TEXT]) if row[C_TEXT] else "")
            if _is_junk(text):
                continue
            stats_kept[target] += 1
            groups[target].append(
                {
                    "id": int(row[C_ID]),
                    "category": str(row[C_CAT]).strip() if row[C_CAT] else "",
                    "sublabel": sub,
                    "text": text,
                }
            )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for target, items in sorted(groups.items()):
        items.sort(key=lambda x: x["id"])
        payload = {
            "routing_target": target,
            "catalog_version": CATALOG_VERSION,
            "source_count": len(items),
            "source_items": items,
        }
        (OUT_DIR / f"{target}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    print(f"wrote {len(groups)} source files → {OUT_DIR}")
    print(f"{'target':<32} kept/total")
    for target in sorted(stats_total):
        print(f"  {target:<30} {stats_kept[target]:>3}/{stats_total[target]:<3}")


if __name__ == "__main__":
    main()
