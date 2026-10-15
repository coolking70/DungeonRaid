"""Independent A03 validation. Original artwork is read ONLY with --copyright.

python3 tools/art/items_check.py
python3 tools/art/items_check.py --copyright
python3 tools/art/items_check.py --rebuild

Copyright mode exports numbers only, never original pixels/crops/previews.
Thresholds are fixed before original-image comparisons. Requires Pillow/numpy.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/items'
MIN_MAE_49 = 3.0
MIN_FOREGROUND_MAE_49 = 12.0
MAX_SIMILARITY = .90
MAX_SSIM = .80


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def flat(image, bg, size=49):
    result = Image.new('RGBA', image.size, (bg, bg, bg, 255))
    result.alpha_composite(image.convert('RGBA'))
    return np.asarray(result.convert('RGB').resize((size, size), Image.Resampling.NEAREST)).astype(float)


def ssim(a, b):
    a, b = a @ np.array([.299, .587, .114]), b @ np.array([.299, .587, .114])
    def mean(x):
        return np.lib.stride_tricks.sliding_window_view(x, (7, 7)).mean(axis=(-1, -2))
    ma, mb = mean(a), mean(b)
    va, vb, cov = mean(a*a)-ma*ma, mean(b*b)-mb*mb, mean(a*b)-ma*mb
    c1, c2 = (255*.01)**2, (255*.03)**2
    return float(np.mean(((2*ma*mb+c1)*(2*cov+c2))/
                         ((ma*ma+mb*mb+c1)*(va+vb+c2))))


def check(copyright=False):
    atlas = Image.open(ART / 'items.png')
    require(atlas.mode == 'RGBA' and atlas.size == (1960, 1960), 'Expected RGBA 1960x1960')
    manifest = json.loads((ART / 'manifest.json').read_text())
    spec = json.loads((ROOT / 'data/items.json').read_text())
    require(sha(ART / 'items.png') == manifest['atlas_sha256'], 'Atlas hash mismatch')
    entries = manifest['slots']
    require(len(entries) == 400 and [e['slot'] for e in entries] == list(range(400)), 'Need ordered slots 0..399')
    bases = {b['id']: b for b in manifest['bases']}
    require(len(bases) == len(manifest['bases']) == 80, 'Need 80 unique bases')
    require(len({b['raw_sha256'] for b in bases.values()}) == 80, 'Need 80 independent generated sources')
    require(manifest['original_image_inputs'] == [], 'Original image input forbidden')
    for base in bases.values():
        require(base['source'] == 'openai-built-in-imagegen' and bool(base['prompt'].strip()), 'Missing base provenance')
        require('generated_images' in Path(base['generated_path']).parts, 'Unexpected generator path')
        require(sha(ROOT / base['file']) == base['sha256'], f"Base hash mismatch: {base['id']}")
        require(Image.open(ROOT / base['file']).size == (49, 49), 'Wrong base dimensions')
    groups, crops, coverages, usage = {}, {}, [], {}
    for e in entries:
        slot = e['slot']
        mappings = [m for m in spec['nameMappings'] if m['iconStart'] <= slot < m['iconEndExclusive']]
        types = [s for s in spec['slots'] if s['iconRangeInclusive'][0] <= slot <= s['iconRangeInclusive'][1]]
        require(len(mappings) == len(types) == 1, f'Ambiguous range: {slot}')
        require(e['group'] == mappings[0]['pool'], f'Wrong group: {slot}')
        require(e['itemType'] == types[0]['itemType'], f'Wrong equipment category: {slot}')
        base = bases[e['base_id']]
        require(base['group'] == e['group'] and base['prompt'] == e['prompt'] and e['source'] == base['source'],
                f'Provenance mismatch: {slot}')
        require(e['base_file'] == base['file'] and e['base_sha256'] == base['sha256'], f'Base reference mismatch: {slot}')
        usage.setdefault(e['base_id'], []).append(e['variant_index'])
        require(bool(e['variant']) and e['variant']['material'], f'Missing variant parameters: {slot}')
        x, y = slot%20*98, slot//20*98
        require(e['rect'] == [x, y, 98, 98], f'Wrong row-major UV: {slot}')
        crop = atlas.crop((x, y, x+98, y+98))
        a = np.asarray(crop)
        require(hashlib.sha256(crop.tobytes()).hexdigest() == e['rgba_sha256'], f'Crop hash mismatch: {slot}')
        coverage = float((a[:, :, 3] > 0).mean())
        require(.06 < coverage < .85, f'Empty or filled background: {slot}: {coverage}')
        require(not a[:4, :, 3].any() and not a[-4:, :, 3].any() and
                not a[:, :4, 3].any() and not a[:, -4:, 3].any(), f'Clipped edge: {slot}')
        small = crop.resize((49, 49), Image.Resampling.NEAREST)
        require(np.array_equal(np.asarray(small.resize((98, 98), Image.Resampling.NEAREST)), a), f'Not exact 2x pixels: {slot}')
        coverages.append(coverage)
        crops[slot] = crop
        groups.setdefault(e['group'], []).append((slot, flat(small, 0), flat(small, 255),
                                                np.asarray(small)[:, :, 3] > 0))
    require(set(usage) == set(bases) and all(sorted(v) == list(range(5)) for v in usage.values()), 'Each base must have exactly five variants')
    statistics = []
    failures = []
    for name, members in groups.items():
        pairs = []
        for a, b in itertools.combinations(members, 2):
            union = a[3] | b[3]
            diffs = [np.abs(a[1]-b[1]), np.abs(a[2]-b[2])]
            whole = min(float(d.mean()) for d in diffs)
            foreground = min(float(d[union].mean()) for d in diffs)
            pairs.append(dict(pair=[a[0], b[0]], mae_49=whole, foreground_mae_49=foreground))
            if whole <= MIN_MAE_49 or foreground <= MIN_FOREGROUND_MAE_49:
                failures.append(pairs[-1])
        statistics.append(dict(group=name, slots=len(members), bases=len(members)//5, pairs=len(pairs),
                               closest=min(pairs, key=lambda p: p['mae_49']),
                               minimum_foreground_mae_49=min(p['foreground_mae_49'] for p in pairs)))
    require(len(statistics) == 13 and sum(g['pairs'] for g in statistics) == 10800,
            'Must compare all 10800 within-group pairs')
    result = dict(status='FAIL' if failures else 'PASS', slots=400, bases=80, groups=13,
                  size=list(atlas.size), alpha_coverage=[min(coverages), max(coverages)],
                  pair_count=sum(g['pairs'] for g in statistics),
                  mae_threshold=MIN_MAE_49, foreground_mae_threshold=MIN_FOREGROUND_MAE_49,
                  minimum_mae_49=min(g['closest']['mae_49'] for g in statistics),
                  minimum_foreground_mae_49=min(g['minimum_foreground_mae_49'] for g in statistics),
                  group_statistics=statistics, similar_pairs=failures, atlas_sha256=sha(ART / 'items.png'))
    if copyright:
        path = ROOT / 'reverse/apktool/res/drawable-nodpi-v4/icons.png'
        original = Image.open(path).convert('RGBA')
        require(original.size == (1024, 1024), 'Unexpected original atlas dimensions')
        measurements = []
        for slot, crop in crops.items():
            # Native origin: (1+50.03*c,1+50.03*r); nearest sampling at pixel centers.
            x = int(np.floor(1 + 50.03*(slot%20) + .5))
            y = int(np.floor(1 + 50.03*(slot//20) + .5))
            old = original.crop((x, y, x+49, y+49)).resize((98, 98), Image.Resampling.NEAREST)
            similarities, structures = [], []
            for bg in (0, 255):
                a, b = flat(crop, bg, 64), flat(old, bg, 64)
                similarities.append(float(1-np.abs(a-b).mean()/255))
                structures.append(ssim(a, b))
            measurements.append(dict(slot=slot, similarity=max(similarities), ssim=max(structures)))
        high = max(measurements, key=lambda m: m['similarity'])
        high_ssim = max(measurements, key=lambda m: m['ssim'])
        result['copyright'] = dict(method='A01: corresponding native crop -> nearest 98 -> nearest 64; max over black/white RGB (1-MAE/255) and 7x7 luminance SSIM',
                                   original_sha256=sha(path), maximum_similarity=high,
                                   maximum_ssim=high_ssim, similarity_threshold=MAX_SIMILARITY,
                                   ssim_threshold=MAX_SSIM, measurements=measurements,
                                   limitation='Engineering similarity screen only; not a legal assessment.')
        if high['similarity'] >= MAX_SIMILARITY or high_ssim['ssim'] >= MAX_SSIM:
            result['status'] = 'FAIL'
    return result


def rebuild():
    paths = [ART / n for n in ['items.png', 'manifest.json', 'contact_sheet.png', 'base_contact_sheet.png']]
    before = {p.name: sha(p) for p in paths}
    subprocess.run([sys.executable, str(ROOT / 'tools/art/items_build.py')], check=True, cwd=ROOT)
    after = {p.name: sha(p) for p in paths}
    result = dict(status='PASS' if before == after else 'FAIL', files=after, byte_identical=before == after)
    (ART / 'rebuild_check.json').write_text(json.dumps(result, indent=2) + '\n')
    require(before == after, 'Non-deterministic build')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--copyright', action='store_true')
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    result = check(args.copyright)
    if args.rebuild:
        result['rebuild'] = rebuild()
    dest = ART / ('check_copyright.json' if args.copyright else 'check_result.json')
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    compact = {k: v for k, v in result.items() if k not in ('group_statistics', 'similar_pairs')}
    if args.copyright:
        compact['copyright'] = {k: v for k, v in result['copyright'].items() if k != 'measurements'}
    print(json.dumps(compact, indent=2))
    if result['status'] != 'PASS':
        print(f'Failed; inspect {dest.relative_to(ROOT)}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
