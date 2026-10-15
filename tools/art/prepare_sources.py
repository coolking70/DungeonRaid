"""Import only built-in imagegen outputs; never reads original game artwork.

Raw files stay in generated_images. This optional import step is not needed to
rebuild the atlas from the checked-in, processed art/src/base/*.png sources.
"""
from collections import deque
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def prepare(record):
    path = Path(record['raw_path']).resolve()
    if 'generated_images' not in path.parts or 'reverse' in path.parts:
        raise ValueError('Only generated_images inputs are permitted')
    with Image.open(path) as raw:
        w, h = raw.size
        # Discard the generated outer frame; preserve the complete icon.
        crop = (round(w * .025), round(h * .025), round(w * .975), round(h * .975))
        small = raw.convert('RGB').crop(crop).resize((106, 106), Image.Resampling.BOX)
    rgb = np.asarray(small).astype(np.int16)
    # Background candidates sampled only from this NEW image's outer perimeter.
    samples = np.concatenate((rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3),
                              rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3)))
    bg = np.median(samples, axis=0)
    eligible = np.max(np.abs(rgb - bg), axis=2) < record.get('background_tolerance', 18)
    outside = np.zeros((106, 106), dtype=bool)
    queue = deque((y, x) for y in range(106) for x in range(106)
                  if (y in (0, 105) or x in (0, 105)) and eligible[y, x])
    while queue:
        y, x = queue.popleft()
        if outside[y, x]:
            continue
        outside[y, x] = True
        for yy, xx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= yy < 106 and 0 <= xx < 106 and eligible[yy, xx] and not outside[yy, xx]:
                queue.append((yy, xx))
    # MAXCOVERAGE preserves sparse accent colors (e.g. the Overseer's amber iris).
    icon = small.quantize(colors=24, method=Image.Quantize.MAXCOVERAGE,
                          dither=Image.Dither.NONE).convert('RGBA')
    icon.putalpha(Image.fromarray(np.where(outside, 0, 255).astype('uint8')))
    bounds = icon.getbbox()
    if not bounds:
        raise ValueError(f"Empty icon: {record['id']}")
    icon = icon.crop(bounds)
    # Processed foreground is portable, cropped, quantized, not a raw generation.
    dest = ROOT / 'art/src/base' / f"{record['id']}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    icon.save(dest)
    record['raw_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    record['processed_path'] = dest.relative_to(ROOT).as_posix()
    record['processing'] = {'crop_fraction': .025, 'sampling': 'BOX to 106',
                            'colors': 24, 'quantizer': 'MAXCOVERAGE',
                            'background_tolerance': record.get('background_tolerance', 18),
                            'foreground_bounds': list(bounds)}


def main():
    path = ROOT / 'art/generations.json'
    data = json.loads(path.read_text())
    for record in data['generations']:
        prepare(record)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f"Prepared {len(data['generations'])} original imagegen sources")


if __name__ == '__main__':
    main()
