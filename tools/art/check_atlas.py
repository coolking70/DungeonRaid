"""Validate A01 atlas; original pixels are used ONLY in optional comparison.

python3 tools/art/check_atlas.py
python3 tools/art/check_atlas.py --copyright

The second command reads original pixels into memory, outputs only numbers and
hashes, never exports original crops, and never feeds generation/build scripts.
Similarity is an engineering screen, not a legal assessment of originality.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art'
# Fixed acceptance thresholds, chosen before comparing any original pixels.
MIN_ENEMY_MAE = 12.0  # RGB intensity units, range 0..255, at 64px
MAX_ORIGINAL_SIMILARITY = .90  # 1 - RGB MAE/255
MAX_ORIGINAL_SSIM = .80  # local luminance SSIM, 7x7 box windows


def require(condition, message):
    if not condition:
        raise ValueError(message)


def expected_slots():
    # Independent of the builder and manifest so coordinate mistakes cannot pass.
    result = {}
    names = ['potion', 'skull', 'coin', 'shield', 'sword']
    for t, name in enumerate(names):
        for v in range(8):
            result[f'{name}_{v}'] = [v*106, t*106, 106, 106]
    enemies = ['boss', 'spiky', 'golden', 'healer', 'invisible', 'acidic', 'flaming',
               'freezing', 'poisonous', 'kamikaze', 'overseer', 'corrosive', 'thief',
               'chaotic', 'mage', 'assassin', 'doppelganger', 'alchemist', 'unstable',
               'vampire', 'vengeful', 'trampling', 'greasy', 'alpha', 'magnetic',
               'brute', 'armoured', 'devourer', 'defiler', 'meat_shield', 'fleeing', 'lich']
    for e, name in enumerate(enemies, 1):
        result[f'enemy_{e:02d}_{name}'] = [((e-1)%8)*106, 1344+((e-1)//8)*106, 106, 106]
    result.update(chain=[1024, 918, 106, 106], trophy=[1236, 918, 106, 106],
                  phylactery=[1342, 918, 106, 106])
    return result


def flat_rgb(image, background):
    bg = Image.new('RGBA', image.size, (background, background, background, 255))
    bg.alpha_composite(image.convert('RGBA'))
    return np.asarray(bg.convert('RGB').resize((64, 64), Image.Resampling.NEAREST)).astype(float)


def ssim(a, b):
    a, b = a @ np.array([.299, .587, .114]), b @ np.array([.299, .587, .114])
    def mean(x):
        return np.lib.stride_tricks.sliding_window_view(x, (7, 7)).mean(axis=(-1, -2))
    ma, mb = mean(a), mean(b)
    va, vb, cov = mean(a*a)-ma*ma, mean(b*b)-mb*mb, mean(a*b)-ma*mb
    c1, c2 = (255*.01)**2, (255*.03)**2
    return float(np.mean(((2*ma*mb+c1)*(2*cov+c2)) /
                         ((ma*ma+mb*mb+c1)*(va+vb+c2))))


def check(copyright=False, atlas_path=None, manifest_path=None):
    atlas_path = atlas_path or ART / 'tiles.png'
    manifest_path = manifest_path or ART / 'manifest.json'
    atlas = Image.open(atlas_path)
    require(atlas.mode == 'RGBA' and atlas.size == (2048, 2048), 'Atlas must be RGBA 2048x2048')
    pixels = np.asarray(atlas)
    manifest = json.loads(manifest_path.read_text())
    expected = expected_slots()
    entries = manifest['tiles']
    require(len(entries) == 75 and {e['id'] for e in entries} == set(expected), 'Expected 75 unique slots')
    occupied = np.zeros((2048, 2048), dtype=bool)
    crops, coverage, enemy_pixels, quiet_count = {}, [], {}, 0
    for e in entries:
        require(e['rect'] == expected[e['id']], f"Wrong UV: {e['id']}")
        require(e['source'] == 'openai-built-in-imagegen' and bool(e['prompt'].strip()), f"Missing provenance: {e['id']}")
        x, y, w, h = e['rect']
        require(not occupied[y:y+h, x:x+w].any(), 'Overlapping tiles')
        occupied[y:y+h, x:x+w] = True
        crop = atlas.crop((x, y, x+w, y+h))
        crops[e['id']] = crop
        cover = float((np.asarray(crop)[:, :, 3] > 0).mean())
        coverage.append(cover)
        require(cover > .9, f"Empty/underfilled: {e['id']}")
        source = ROOT / e['file']
        require(hashlib.sha256(source.read_bytes()).hexdigest() == e['sha256'], f"Wrong tile hash: {e['id']}")
        require(np.array_equal(np.asarray(Image.open(source)), np.asarray(crop)), f"Source/atlas mismatch: {e['id']}")
        if e['kind'] == 'enemy' or e['base'] == 'skull':
            bg = ImageColor.getrgb(e['background'])
            # Independent fixed rectangles, not trusting manifest to reduce them.
            for xx, yy, ww, hh in [[2, 4, 24, 20], [80, 4, 24, 20], [26, 74, 54, 30]]:
                require(np.all(np.asarray(crop)[yy:yy+hh, xx:xx+ww, :3] == bg), f"Number area not quiet: {e['id']}")
            quiet_count += 1
        if e['kind'] == 'enemy':
            enemy_pixels[e['id']] = flat_rgb(crop, 0)
    require(not pixels[~occupied, 3].any(), 'Unused atlas pixels must be transparent')
    comparisons = []
    for (ida, a), (idb, b) in itertools.combinations(enemy_pixels.items(), 2):
        whole, center = float(np.abs(a-b).mean()), float(np.abs(a[12:52, 12:52]-b[12:52, 12:52]).mean())
        require(min(whole, center) > MIN_ENEMY_MAE, f"Similar enemies: {ida}, {idb}: {whole}, {center}")
        comparisons.append({'pair': [ida, idb], 'mae_64': whole, 'center_mae_64': center})
    require(len(comparisons) == 496, 'Must compare all 496 enemy pairs')
    variant_min = 255.
    for name in ['potion', 'skull', 'coin', 'shield', 'sword']:
        for i, j in itertools.combinations(range(8), 2):
            diff = float(np.abs(flat_rgb(crops[f'{name}_{i}'], 0)-flat_rgb(crops[f'{name}_{j}'], 0)).mean())
            require(diff > 1., f"Duplicate normal variants: {name} {i} {j}")
            variant_min = min(diff, variant_min)
    result = {'status': 'PASS', 'size': [2048, 2048], 'mode': atlas.mode, 'slots': 75,
              'minimum_alpha_coverage': min(coverage), 'unused_nontransparent_pixels': 0,
              'manifest_provenance_count': len(entries), 'quiet_portraits': quiet_count,
              'enemy_pairs': len(comparisons), 'enemy_mae_threshold': MIN_ENEMY_MAE,
              'closest_enemy_pair': min(comparisons, key=lambda p: p['mae_64']),
              'minimum_enemy_center_mae': min(p['center_mae_64'] for p in comparisons),
              'minimum_normal_variant_mae': variant_min,
              'atlas_sha256': hashlib.sha256(atlas_path.read_bytes()).hexdigest()}
    if copyright:
        original_path = ROOT / 'reverse/apktool/res/drawable-nodpi-v4/tiles.png'
        original = Image.open(original_path).convert('RGBA')
        require(original.size == (1024, 1024), 'Unexpected original size; do not guess UV scale')
        measurements = []
        for e in entries:
            x, y, _, _ = e['rect']
            old = original.crop((x//2, y//2, x//2+53, y//2+53)).resize((106, 106), Image.Resampling.NEAREST)
            similarities, structures = [], []
            for bg in (0, 255):
                a, b = flat_rgb(crops[e['id']], bg), flat_rgb(old, bg)
                similarities.append(float(1-np.abs(a-b).mean()/255))
                structures.append(ssim(a, b))
            measurements.append({'id': e['id'], 'similarity': max(similarities), 'ssim': max(structures)})
        high = max(measurements, key=lambda p: p['similarity'])
        high_ssim = max(measurements, key=lambda p: p['ssim'])
        result['copyright_comparison'] = {
            'original_sha256': hashlib.sha256(original_path.read_bytes()).hexdigest(),
            'method': 'Corresponding 53px crop -> nearest 106 -> nearest 64; RGB MAE and 7x7 local luminance SSIM; max over black/white compositing.',
            'maximum_similarity': high, 'maximum_ssim': high_ssim,
            'similarity_threshold': MAX_ORIGINAL_SIMILARITY, 'ssim_threshold': MAX_ORIGINAL_SSIM,
            'measurements': measurements,
            'limitation': 'Pixel similarity screen only; no legal conclusion.'}
        require(high['similarity'] < MAX_ORIGINAL_SIMILARITY and high_ssim['ssim'] < MAX_ORIGINAL_SSIM,
                f'Original similarity threshold exceeded: {high}, {high_ssim}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--copyright', action='store_true')
    args = parser.parse_args()
    result = check(args.copyright)
    (ART / ('check_copyright.json' if args.copyright else 'check_result.json')).write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    compact = dict(result)
    if args.copyright:
        compact['copyright_comparison'] = {k: v for k, v in result['copyright_comparison'].items() if k != 'measurements'}
    print(json.dumps(compact, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
