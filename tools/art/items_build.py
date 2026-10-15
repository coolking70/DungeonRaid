"""A03: deterministic, original-only equipment atlas builder.

python3 tools/art/items_build.py --prepare  # import cached imagegen outputs
python3 tools/art/items_build.py            # offline rebuild from src/base
Only the optional import needs the local generated_images cache.
Dependencies: Pillow, numpy. Never reads reverse/ or writes outside A03 paths.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/items'
SRC = ART / 'src'
NEAREST = Image.Resampling.NEAREST
VARIANTS = [
    dict(material='original', mirror=False, rotation=0, width_scale=1., palette=None),
    dict(material='copper', mirror=True, rotation=0, width_scale=1.,
         palette=['#231723', '#763d32', '#c57a49', '#ffda9c']),
    dict(material='gold', mirror=False, rotation=-10, width_scale=.94,
         palette=['#292036', '#9a6b27', '#e6bc52', '#fff0aa']),
    dict(material='mithril', mirror=False, rotation=10, width_scale=1.,
         palette=['#151d35', '#287f94', '#67c7d4', '#d4ffff']),
    dict(material='ivory', mirror=True, rotation=-6, width_scale=.86,
         palette=['#242035', '#a99d8b', '#ded8bf', '#fff6dc']),
]
# The brown leather vest and copper recolor need a stronger silhouette change.
VARIANT_OVERRIDES = {'armour_01': {1: dict(rotation=-14, width_scale=.92)}}
# Keep the redrawn swords facing consistently across their material variants.
for _base in ('sword1_03', 'sword2_01', 'sword2_02', 'sword2_04'):
    VARIANT_OVERRIDES[_base] = {
        1: dict(mirror=False, rotation=6),
        4: dict(mirror=False, rotation=-6, width_scale=1.),
    }


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recipes():
    data = json.loads((SRC / 'recipes.json').read_text())
    for base in data['bases']:
        record = SRC / (base['id'] + '.generation.json')
        if record.exists():
            base.update(json.loads(record.read_text()))
    return data


def fit(image, side=43):
    image = image.crop(image.getbbox())
    scale = min(side / image.width, side / image.height)
    image = image.resize((max(1, round(image.width*scale)),
                          max(1, round(image.height*scale))), NEAREST)
    result = Image.new('RGBA', (49, 49))
    result.alpha_composite(image, ((49-image.width)//2, (49-image.height)//2))
    return result


def prepare(data):
    (SRC / 'base').mkdir(parents=True, exist_ok=True)
    for base in data['bases']:
        raw_path = Path(base['generated_path']).resolve()
        if 'generated_images' not in raw_path.parts or 'reverse' in raw_path.parts:
            raise ValueError('Import accepts only built-in imagegen cache paths')
        raw = Image.open(raw_path).convert('RGBA')
        # Preserve generated transparency; threshold only faint edge alpha.
        alpha = np.asarray(raw.getchannel('A'))
        if not (alpha == 0).any():
            raise ValueError(f"Missing generated transparency: {base['id']}")
        bounds = Image.fromarray(np.uint8(alpha >= 96)*255).getbbox()
        cut = raw.crop(bounds)
        scale = 43 / max(cut.size)
        small = cut.resize((max(1, round(cut.width*scale)),
                            max(1, round(cut.height*scale))), Image.Resampling.BOX)
        rgba = np.array(small)
        rgb = small.convert('RGB').quantize(colors=24, method=Image.Quantize.MAXCOVERAGE,
                                           dither=Image.Dither.NONE).convert('RGBA')
        rgb.putalpha(Image.fromarray(np.uint8(rgba[:, :, 3] >= 128)*255))
        pixels = np.array(rgb)
        pixels[pixels[:, :, 3] == 0] = 0
        icon = fit(Image.fromarray(pixels))
        target = SRC / 'base' / (base['id'] + '.png')
        icon.save(target)
        base.update(file=target.relative_to(ROOT).as_posix(), sha256=sha(target),
                    raw_sha256=sha(raw_path), raw_size=list(raw.size),
                    processing=dict(alpha_bbox=list(bounds), alpha_threshold=128,
                                    colors=24, quantizer='MAXCOVERAGE',
                                    downsample='BOX', logical_size=49, fit_max=43))
    write_json(SRC / 'bases.json', data)
    print(f"Prepared {len(data['bases'])} imagegen bases")


def variant(base, params):
    im = base.copy()
    if params['palette']:
        from PIL import ImageColor
        pixels = np.array(im)
        luminance = pixels[:, :, :3] @ np.array([.299, .587, .114])
        palette = np.array([ImageColor.getrgb(c) for c in params['palette']])
        recolor = np.stack([np.interp(luminance, [0, 85, 170, 255], palette[:, c])
                            for c in range(3)], axis=-1)
        # Retain a trace of original material differences, preserve dark outline.
        active = (pixels[:, :, 3] > 0) & (luminance > 35)
        pixels[active, :3] = np.uint8(.9*recolor[active] + .1*pixels[active, :3])
        im = Image.fromarray(pixels)
    if params['mirror']:
        im = ImageOps.mirror(im)
    im = im.crop(im.getbbox())
    im = im.resize((max(1, round(im.width*params['width_scale'])), im.height), NEAREST)
    im = im.rotate(params['rotation'], resample=NEAREST, expand=True)
    return fit(im, 43)


def build():
    data = json.loads((SRC / 'bases.json').read_text())
    items = json.loads((ROOT / 'data/items.json').read_text())
    atlas = Image.new('RGBA', (1960, 1960))
    # Actual 49px icons with numbered cells, two backgrounds for edge QA.
    contact = Image.new('RGB', (20*65, 20*72+36), '#10121b')
    draw = ImageDraw.Draw(contact)
    draw.text((10, 10), 'A03 / 400 ORIGINAL ITEMS / ACTUAL 49px / SLOT ORDER 0-399', fill='#ecdfc8')
    bases_by_group = {}
    for base in data['bases']:
        if sha(ROOT / base['file']) != base['sha256']:
            raise ValueError(f"Base hash mismatch: {base['id']}")
        bases_by_group.setdefault(base['group'], []).append(base)
    slots = []
    for mapping in items['nameMappings']:
        start, end = mapping['iconStart'], mapping['iconEndExclusive']
        group = bases_by_group[mapping['pool']]
        if len(group)*5 != end-start:
            raise ValueError(f"Wrong base count: {mapping['pool']}")
        for offset, slot in enumerate(range(start, end)):
            base, v = group[offset//5], offset%5
            params = {**VARIANTS[v], **VARIANT_OVERRIDES.get(base['id'], {}).get(v, {})}
            logical = variant(Image.open(ROOT / base['file']).convert('RGBA'), params)
            icon = logical.resize((98, 98), NEAREST)
            x, y = slot%20*98, slot//20*98
            atlas.alpha_composite(icon, (x, y))
            item_type = next(s['itemType'] for s in items['slots']
                             if s['iconRangeInclusive'][0] <= slot <= s['iconRangeInclusive'][1])
            slots.append(dict(slot=slot, group=mapping['pool'], itemType=item_type,
                              base_id=base['id'], variant_index=v, variant=params,
                              rect=[x, y, 98, 98], source=base['source'], prompt=base['prompt'],
                              base_file=base['file'], base_sha256=base['sha256'],
                              rgba_sha256=hashlib.sha256(icon.tobytes()).hexdigest()))
            cx, cy = slot%20*65, slot//20*72+36
            color = '#252938' if (slot//5)%2 == 0 else '#d5cbb8'
            draw.rectangle((cx+1, cy, cx+63, cy+69), fill=color)
            contact.paste(logical, (cx+8, cy+3), logical)
            draw.text((cx+21, cy+54), str(slot), fill='#eee4cd' if color=='#252938' else '#262538')
    atlas.save(ART / 'items.png')
    contact.save(ART / 'contact_sheet.png')
    # All base silhouettes on one sheet for visual category inspection.
    sheet = Image.new('RGB', (10*108, 8*124), '#252938')
    d = ImageDraw.Draw(sheet)
    for i, base in enumerate(data['bases']):
        icon = Image.open(ROOT / base['file']).resize((98, 98), NEAREST)
        x, y = i%10*108, i//10*124
        sheet.paste(icon, (x+5, y), icon)
        d.text((x+4, y+101), base['id'], fill='#ecdfc8')
    sheet.save(ART / 'base_contact_sheet.png')
    manifest = dict(schema_version=1, source='openai-built-in-imagegen',
                    size=[1960, 1960], cell_size=98, logical_cell_size=49, columns=20,
                    original_image_inputs=[],
                    evidence=dict(groups=items['nameMappingEvidence'],
                                  categories='data/items.json.slots.iconRangeInclusive; Item::Initialise @0x4c0ec',
                                  original_uv='Upgrade::GetIconUVs @0x67440: (1+50.03*c,1+50.03*r), span49',
                                  new_layout='docs/tasks/A03.prompt.md: 20x20 row-major 98px'),
                    groups=[dict(**m, base_count=len(bases_by_group[m['pool']])) for m in items['nameMappings']],
                    bases=data['bases'], slots=slots, atlas_sha256=sha(ART / 'items.png'))
    write_json(ART / 'manifest.json', manifest)
    print('Built 80 bases / 400 slots / RGBA 1960x1960; manifest and contact sheets')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args()
    if args.prepare:
        prepare(recipes())
    build()


if __name__ == '__main__':
    main()
