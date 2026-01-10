#!/usr/bin/env python3
"""Convert a directory of Markdown files into LLaMA-Factory text dataset (.txt).

Default behavior:
- Recursively finds *.md under --root
- Reads each file as UTF-8 (errors ignored)
- Normalizes whitespace and writes ONE LINE per file to output .txt
- Also writes a matching .paths.txt file: one source path per output line

This matches the local dataset loader for .txt in LLaMA-Factory (HF datasets "text").
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable


_WS_RE = re.compile(r"\s+")


def _normalize_one_line(text: str) -> str:
    return _WS_RE.sub(" ", text).strip()


def _strip_markdown_basic(text: str, *, drop_code_blocks: bool) -> str:
    """A lightweight markdown-to-text cleanup with no external deps.

    Intentionally conservative; you can disable it by not passing --strip-markdown.
    """
    # Remove YAML front matter
    text = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", text, flags=re.DOTALL)

    if drop_code_blocks:
        # Remove fenced code blocks
        text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
        text = re.sub(r"~~~.*?~~~", " ", text, flags=re.DOTALL)

    # Inline code
    text = re.sub(r"`([^`]*)`", r"\\1", text)

    # Images: ![alt](url) -> alt
    #text = re.sub(r"!\[([^\]]*)\]\([^\)]*\)", r"\\1", text)

    # Links: [text](url) -> text
    #text = re.sub(r"\[([^\]]+)\]\([^\)]*\)", r"\\1", text)

    # Headings / list markers / blockquotes
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^\s*>\s?", "", text)
    text = re.sub(r"(?m)^\s*([-*+]\s+)", "", text)
    text = re.sub(r"(?m)^\s*(\d+\.)\s+", "", text)

    # Horizontal rules
    text = re.sub(r"(?m)^\s*([-*_])\1\1+\s*$", " ", text)

    # Basic HTML tags
    text = re.sub(r"<[^>]+>", " ", text)

    return text


def iter_md_files(root: Path, *, follow_symlinks: bool) -> Iterable[Path]:
    if not root.exists():
        raise FileNotFoundError(f"Root path does not exist: {root}")

    # Path.rglob follows symlinks to files but not to directories by default.
    # We'll explicitly skip symlinked files if follow_symlinks is False.
    for p in root.rglob("*.md"):
        if not follow_symlinks and p.is_symlink():
            continue
        if p.is_file():
            yield p


def open_block_files(output_prefix: Path, block: int):
    out_txt = output_prefix.with_suffix("")
    txt_path = out_txt.parent / f"{out_txt.name}.{block}.txt"
    paths_path = out_txt.parent / f"{out_txt.name}.{block}.paths.txt"
    txt_f = txt_path.open("a", encoding="utf-8")
    paths_f = paths_path.open("a", encoding="utf-8")
    return txt_path, paths_path, txt_f, paths_f


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Convert many .md files to one-line-per-doc .txt dataset.")
    ap.add_argument("--root", type=Path, required=True, help="Root directory to scan for *.md")
    ap.add_argument(
        "--output-prefix",
        type=Path,
        required=True,
        help="Output prefix path, e.g. data/wiki_from_md -> writes wiki_from_md.0.txt, .paths.txt",
    )
    ap.add_argument("--max-files-per-block", type=int, default=0, help="Split outputs every N files (0 = no split)")
    ap.add_argument("--max-chars", type=int, default=0, help="Truncate each document to N chars (0 = no truncation)")
    ap.add_argument("--min-chars", type=int, default=0, help="Skip documents shorter than N chars after processing")
    ap.add_argument("--strip-markdown", action="store_true", help="Apply basic markdown cleanup")
    ap.add_argument("--drop-code-blocks", action="store_true", help="When stripping markdown, remove fenced code blocks")
    ap.add_argument("--follow-symlinks", action="store_true", help="Include symlinked markdown files")
    args = ap.parse_args(argv)

    root: Path = args.root
    output_prefix: Path = args.output_prefix
    output_prefix.parent.mkdir(parents=True, exist_ok=True)

    block = 0
    files_in_block = 0
    processed = 0
    skipped = 0
    errors = 0

    txt_path, paths_path, txt_f, paths_f = open_block_files(output_prefix, block)

    try:
        for md_path in iter_md_files(root, follow_symlinks=args.follow_symlinks):
            try:
                raw = md_path.read_text(encoding="utf-8", errors="ignore")

                if args.strip_markdown:
                    raw = _strip_markdown_basic(raw, drop_code_blocks=args.drop_code_blocks)

                if args.max_chars and args.max_chars > 0:
                    raw = raw[: args.max_chars]

                line = _normalize_one_line(raw)

                if args.min_chars and args.min_chars > 0 and len(line) < args.min_chars:
                    skipped += 1
                    continue

                if not line:
                    skipped += 1
                    continue

                txt_f.write(line)
                if not line.endswith("\n"):
                    txt_f.write("\n")

                paths_f.write(str(md_path))
                if not str(md_path).endswith("\n"):
                    paths_f.write("\n")

                processed += 1
                files_in_block += 1

                if args.max_files_per_block and args.max_files_per_block > 0:
                    if files_in_block >= args.max_files_per_block:
                        txt_f.close()
                        paths_f.close()
                        block += 1
                        files_in_block = 0
                        txt_path, paths_path, txt_f, paths_f = open_block_files(output_prefix, block)

                if processed % 1000 == 0:
                    print(f"processed={processed} skipped={skipped} errors={errors} (current={md_path})")

            except Exception as e:  # noqa: BLE001
                errors += 1
                print(f"ERROR processing {md_path}: {e}", file=sys.stderr)

    finally:
        try:
            txt_f.close()
        except Exception:
            pass
        try:
            paths_f.close()
        except Exception:
            pass

    print(
        f"Done. processed={processed} skipped={skipped} errors={errors}. Last block={block}.\n"
        f"Example outputs: {txt_path} and {paths_path}"
    )
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
