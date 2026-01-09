#!/usr/bin/env python3
"""Repair a messy Alpaca JSON file into valid JSON.

Supports two common inputs:
1) A JSON array: [{...}, {...}, ...]
2) A messy text file containing many JSON objects (one per line or concatenated)

Strategy:
- Try to load as JSON (optionally after sanitizing escapes/control chars).
- If that fails, extract brace-balanced JSON objects and parse each individually.

Writes a valid JSON array to the output path.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable, List, Optional


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def sanitize_json_text(text: str) -> str:
    """Best-effort cleanup of common JSON breakages.

    - Removes raw control chars (except \t\n\r).
    - Ensures backslashes inside strings only start valid JSON escapes.

    This is intentionally conservative; it does not try to reformat content.
    """

    # Remove control characters that JSON disallows.
    text = _CONTROL_CHARS_RE.sub(" ", text)

    # Fix invalid backslash escapes *inside* JSON strings.
    # We scan string-by-string so we don't mutate outside strings.
    out: List[str] = []
    i = 0
    n = len(text)
    in_str = False
    escape = False
    while i < n:
        ch = text[i]
        out.append(ch)

        if not in_str:
            if ch == '"':
                in_str = True
                escape = False
            i += 1
            continue

        # In string
        if escape:
            escape = False
            i += 1
            continue

        if ch == "\\":
            # Lookahead to validate escape
            if i + 1 >= n:
                # dangling backslash at EOF
                out[-1] = "\\\\"
                i += 1
                continue
            nxt = text[i + 1]
            if nxt in ['"', "\\", "/", "b", "f", "n", "r", "t"]:
                escape = True
                i += 1
                continue
            if nxt == "u":
                # Validate \uXXXX
                if i + 5 < n and re.fullmatch(r"[0-9a-fA-F]{4}", text[i + 2 : i + 6] or ""):
                    escape = True
                    i += 1
                    continue
            # Not a valid escape sequence -> escape the backslash itself
            out[-1] = "\\\\"
            i += 1
            continue

        if ch == '"':
            in_str = False
            escape = False

        i += 1

    return "".join(out)


def _try_load_json(text: str) -> Optional[Any]:
    try:
        return json.loads(text)
    except Exception:
        return None


def extract_json_objects(text: str) -> List[str]:
    """Extract top-level JSON objects by brace balancing.

    This skips any junk outside `{...}` blocks and handles braces in strings.
    """

    objects: List[str] = []
    buf: List[str] = []
    depth = 0
    in_str = False
    escape = False

    for ch in text:
        if depth == 0:
            if ch != "{":
                continue
            depth = 1
            buf = ["{"]
            in_str = False
            escape = False
            continue

        # depth > 0: capturing
        buf.append(ch)

        if in_str:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_str = False
            continue

        # not in string
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                objects.append("".join(buf))
                buf = []
            continue

    return objects


def normalize_to_alpaca_items(data: Any) -> List[dict]:
    """Return a list of dicts (best-effort) from parsed JSON."""

    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        # Sometimes wrapped
        for key in ("data", "items", "examples"):
            v = data.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        return [data]
    return []


def parse_messy_file(text: str) -> List[dict]:
    """Parse a messy alpaca dataset into a list of dict items."""

    # 1) Direct parse
    parsed = _try_load_json(text)
    if parsed is not None:
        return normalize_to_alpaca_items(parsed)

    # 2) Sanitize then parse whole-file
    sanitized = sanitize_json_text(text)
    parsed2 = _try_load_json(sanitized)
    if parsed2 is not None:
        return normalize_to_alpaca_items(parsed2)

    # 3) Extract objects and parse individually (with sanitization per object)
    items: List[dict] = []
    for obj in extract_json_objects(text):
        parsed_obj = _try_load_json(obj)
        if parsed_obj is None:
            parsed_obj = _try_load_json(sanitize_json_text(obj))
        if isinstance(parsed_obj, dict):
            items.append(parsed_obj)

    return items


def main() -> int:
    p = argparse.ArgumentParser(description="Clean/repair Alpaca JSON into a valid JSON array")
    p.add_argument("input", type=Path, help="Input file (messy JSON/JSONL/concatenated objects)")
    p.add_argument("output", type=Path, help="Output file (valid JSON array)")
    p.add_argument("--ensure-ascii", action="store_true", help="Escape non-ASCII characters")
    p.add_argument("--indent", type=int, default=0, help="Pretty-print indent (0 for compact)")
    args = p.parse_args()

    text = args.input.read_text(encoding="utf-8", errors="replace")
    items = parse_messy_file(text)

    args.output.parent.mkdir(parents=True, exist_ok=True)

    if args.indent and args.indent > 0:
        json_text = json.dumps(items, ensure_ascii=args.ensure_ascii, indent=args.indent)
    else:
        json_text = json.dumps(items, ensure_ascii=args.ensure_ascii, separators=(",", ":"))

    args.output.write_text(json_text + "\n", encoding="utf-8")

    alpaca_like = 0
    for it in items:
        if isinstance(it, dict) and all(k in it for k in ("instruction", "input", "output")):
            alpaca_like += 1

    print(f"parsed_items={len(items)} alpaca_items={alpaca_like} output={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
