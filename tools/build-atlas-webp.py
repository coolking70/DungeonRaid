#!/usr/bin/env python3
"""Build lossless atlas derivatives; keep source PNGs untouched, verify decoded RGBA."""
from pathlib import Path
import json
from PIL import Image, features
ROOT = Path(__file__).resolve().parents[1]
if not features.check('webp'):
    raise SystemExit('Pillow WebP support is required for this build (no package install attempted).')
out = ROOT / 'ui/generated'
out.mkdir(exist_ok=True, parents=True)
report = []
for name in ('items', 'ui'):
    source = ROOT / f'art/{name}/{name}.png'
    target = out / f'{name}.webp'
    with Image.open(source) as image:
        image = image.convert('RGBA')
        image.save(target, 'WEBP', lossless=True, exact=True, method=6)
        with Image.open(target) as decoded:
            assert decoded.convert('RGBA').tobytes() == image.tobytes(), f'{name}: pixel mismatch'
    report.append({'atlas': name, 'pngBytes': source.stat().st_size, 'webpBytes': target.stat().st_size, 'rgbaExact': True})
print(json.dumps(report))
