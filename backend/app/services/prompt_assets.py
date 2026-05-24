"""Loader for the curated CBI prompt assets under app/prompts/cbi/<version>/.

Assets are produced by `scripts/build_cbi_prompts.py` (raw `_source/`) and then
hand-curated into Korean coaching principles (`<routing_target>.json`). This module
loads and renders them; it never touches the `_source/` files at runtime.

Asset shape (curated):
    {
      "routing_target": "...",
      "title_ko": "...",
      "principles_ko": ["...", ...]   # or "rules_ko" for output_guard
    }
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CATALOG_VERSION = "v3"
PROMPT_VERSION = f"cbi-{CATALOG_VERSION}"

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "prompts" / "cbi" / CATALOG_VERSION


@lru_cache(maxsize=64)
def load_asset(routing_target: str) -> dict | None:
    """Load one curated asset by routing target, or None if absent."""
    path = _ASSETS_DIR / f"{routing_target}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_modules() -> list[dict]:
    """Phase 3 module manifest (code, name_ko, routing_target, signal_ko)."""
    path = _ASSETS_DIR / "modules.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("modules", [])


def render_block(routing_target: str) -> str:
    """Render a curated asset into a system-prompt text block. '' if missing."""
    asset = load_asset(routing_target)
    if not asset:
        return ""
    lines = asset.get("principles_ko") or asset.get("rules_ko") or []
    if not lines:
        return ""
    title = asset.get("title_ko", routing_target)
    body = "\n".join(f"- {line}" for line in lines)
    return f"[{title}]\n{body}"


def module_routing_target(code: str) -> str:
    """Map a module code (e.g. 'CRAV') to its phase_3 routing target."""
    for m in load_modules():
        if m.get("code") == code:
            return m.get("routing_target", "")
    return ""
