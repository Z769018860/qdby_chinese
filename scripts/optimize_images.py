#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert oversized PNG/JPG/GIF assets to WebP and rewrite every reference.

Idempotent: files already converted are gone, so a second run is a no-op.
Requires ffmpeg (libwebp / libwebp_anim).  Usage: python3 scripts/optimize_images.py [--min-kb 250]
"""
from __future__ import annotations
import argparse, re, subprocess, sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "node_modules", ".data"}
TEXT_EXT = {".html", ".js", ".css", ".json", ".md", ".mjs", ".py"}
IMG_EXT = {".png", ".jpg", ".jpeg", ".gif"}
MAX_DIM, MAX_GIF = 2048, 320


def convert(src: Path, dst: Path) -> bool:
    if src.suffix.lower() == ".gif":
        vf = f"scale='min({MAX_GIF},iw)':-2:flags=lanczos"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", vf, "-loop", "0",
               "-c:v", "libwebp_anim", "-quality", "70", "-compression_level", "6", str(dst)]
    else:
        vf = f"scale='min({MAX_DIM},iw)':'min({MAX_DIM},ih)':force_original_aspect_ratio=decrease:flags=lanczos"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", vf,
               "-c:v", "libwebp", "-quality", "85", "-compression_level", "6", str(dst)]
    return subprocess.run(cmd).returncode == 0 and dst.exists()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-kb", type=int, default=250)
    args = ap.parse_args()
    imgs = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXT
            and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS) and p.stat().st_size >= args.min_kb * 1024]
    done = []
    for src in sorted(imgs):
        dst = src.with_suffix(".webp")
        if not convert(src, dst):
            dst.unlink(missing_ok=True); print("skip (convert failed)", src); continue
        if dst.stat().st_size > src.stat().st_size * 0.8:
            dst.unlink(); print("skip (not smaller)", src); continue
        done.append((src, dst)); print(f"{src.relative_to(ROOT)}: {src.stat().st_size//1024}KB -> {dst.stat().st_size//1024}KB")
    if not done:
        return 0
    texts = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in TEXT_EXT
             and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS) and p.stat().st_size < 30_000_000]
    for t in texts:
        try:
            with open(t, encoding="utf-8", newline="") as fh:  # keep CRLF/LF untouched
                s = fh.read()
        except Exception:
            continue
        o = s
        for src, dst in done:
            rel = src.relative_to(ROOT).as_posix()
            variants = {rel: rel[:-len(src.suffix)] + ".webp", quote(rel): quote(rel[:-len(src.suffix)] + ".webp")}
            # references written relative to the file's own directory (e.g. catdogcase-main/*.html -> "man.png")
            if t.parent == src.parent:
                variants[src.name] = dst.name; variants[quote(src.name)] = quote(dst.name)
            for a, b in variants.items():
                # match whole file names only: '2.jpeg' must not hit '12.jpeg'
                s = re.sub(r"(?<![\w.%/$\[\]{}-])" + re.escape(a) + r"(?![\w])", lambda _m, b=b: b, s)
        if s != o:
            with open(t, "w", encoding="utf-8", newline="") as fh:
                fh.write(s)
            print("rewrote refs in", t.relative_to(ROOT))
    for src, _ in done:
        src.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
