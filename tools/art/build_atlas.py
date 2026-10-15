"""Rebuild A01 assets using only processed original sources (Pillow + numpy).

Run: python3 tools/art/build_atlas.py
UV coordinates are specified by docs/tasks/A01.prompt.md, in original 1024 units.
"""
import colorsys
import hashlib
import json
from pathlib import Path
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art'
NORMAL = ['potion', 'skull', 'coin', 'shield', 'sword']
ENEMIES = ['boss', 'spiky', 'golden', 'healer', 'invisible', 'acidic', 'flaming',
           'freezing', 'poisonous', 'kamikaze', 'overseer', 'corrosive', 'thief',
           'chaotic', 'mage', 'assassin', 'doppelganger', 'alchemist', 'unstable',
           'vampire', 'vengeful', 'trampling', 'greasy', 'alpha', 'magnetic',
           'brute', 'armoured', 'devourer', 'defiler', 'meat_shield', 'fleeing', 'lich']
SPECIAL = [('chain', 512, 459), ('trophy', 618, 459), ('phylactery', 671, 459)]
# Hand-chosen original palette, never sampled from original artwork.
BACKGROUNDS = dict(zip(NORMAL, ['#8b203c', '#959da6', '#b77a19', '#363871', '#535f70']))
BACKGROUNDS.update(dict(zip(ENEMIES, [
    '#4a254e', '#605349', '#765216', '#214f3b', '#315b68', '#575b20', '#6c3025',
    '#24486a', '#512b63', '#70442e', '#345650', '#5d4233', '#384e39', '#332957',
    '#303d70', '#512b3b', '#484459', '#245b58', '#532956', '#5b233c', '#472c32',
    '#5b4936', '#3b5034', '#32485d', '#2d4765', '#505032', '#495967', '#5f363d',
    '#47374e', '#6b474f', '#31575d', '#244b41'])))
BACKGROUNDS.update(chain='#36555c', trophy='#4b3562', phylactery='#512936')
ANGLES = [0, -8, 8, -4, 4, -10, 10, 0]
HUE_SHIFTS = [0, -0.012, .012, -.020, .020, -.008, .008, .025]
BRIGHTNESS = [1, .92, 1.08, 1.06, .95, 1.10, .90, 1.03]


def slots():
    for row, name in enumerate(NORMAL):
        for variant in range(8):
            yield dict(id=f'{name}_{variant}', base=name, kind='normal', type=row,
                       variant=variant, original_xy=[variant * 53, row * 53])
    for value, name in enumerate(ENEMIES, 1):
        yield dict(id=f'enemy_{value:02d}_{name}', base=name, kind='enemy',
                   enemy_type=value, original_xy=[((value - 1) % 8) * 53,
                                                 672 + ((value - 1) // 8) * 53])
    for name, x, y in SPECIAL:
        yield dict(id=name, base=name, kind='special', original_xy=[x, y])


def tint(icon, variant):
    pixels = np.array(icon)
    rgb = pixels[:, :, :3].reshape(-1, 3)
    colors, inverse = np.unique(rgb, axis=0, return_inverse=True)
    changed = []
    for color in colors:
        h, s, v = colorsys.rgb_to_hsv(*(color.astype(float) / 255))
        changed.append([round(c * 255) for c in colorsys.hsv_to_rgb(
            (h + HUE_SHIFTS[variant]) % 1, s, min(1, v * BRIGHTNESS[variant]))])
    pixels[:, :, :3] = np.asarray(changed, dtype='uint8')[inverse].reshape(pixels.shape[:2] + (3,))
    return Image.fromarray(pixels)


def render_tile(slot):
    name = slot['base']
    source = Image.open(ART / 'src/base' / f'{name}.png').convert('RGBA')
    variant = slot.get('variant', 0)
    if slot['kind'] == 'normal':
        source = tint(source, variant)
        source = source.rotate(ANGLES[variant], resample=Image.Resampling.NEAREST, expand=True)
        source = source.crop(source.getbbox())
        if variant == 7:
            source = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    is_enemy = slot['kind'] == 'enemy' or name == 'skull'
    if is_enemy:
        # Fit silhouette above the real UI's 16px health label without clipping.
        # Search largest size, then highest position that clears both top corners.
        original = source
        found = False
        for limit in range(34, 14, -1):
            scale = min(39 / original.width, limit / original.height)
            size = (max(1, round(original.width * scale)), max(1, round(original.height * scale)))
            candidate = original.resize(size, Image.Resampling.NEAREST)
            x = (53 - size[0]) // 2
            for y in range(3, 38-size[1]):
                mask = Image.new('L', (53, 53))
                mask.paste(candidate.getchannel('A'), (x, y))
                a = np.asarray(mask)
                if not a[2:12, 1:13].any() and not a[2:12, 40:52].any():
                    source, found = candidate, True
                    break
            if found:
                break
        if not found:
            raise ValueError(f'Cannot fit portrait {name} without obscuring UI numbers')
    else:
        scale = min(41 / source.width, 41 / source.height)
        size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
        source = source.resize(size, Image.Resampling.NEAREST)
        x, y = (53 - size[0]) // 2, (53 - size[1]) // 2
    tile = Image.new('RGBA', (53, 53), BACKGROUNDS[name])
    draw = ImageDraw.Draw(tile)
    bg = tile.getpixel((0, 0))[:3]
    draw.rectangle((0, 0, 52, 52), outline=tuple(round(c * .55) for c in bg), width=1)
    draw.line((1, 1, 51, 1), fill=tuple(min(255, round(c * 1.22)) for c in bg))
    tile.alpha_composite(source, (x, y))
    return tile.resize((106, 106), Image.Resampling.NEAREST)


def annotated(tile, size, enemy):
    result = tile.resize((size, size), Image.Resampling.NEAREST).convert('RGB')
    if enemy:
        d = ImageDraw.Draw(result)
        k = size / 64
        for xy, text, color, anchor, font_size in [((4*k, 14*k), '7', '#ff6b6b', 'ls', 13),
                                       ((size-4*k, 14*k), '3', '#9fc2ff', 'rs', 13),
                                       ((size/2, size-6*k), '24', '#ffffff', 'ms', 16)]:
            d.text(xy, text, fill=color, anchor=anchor,
                   font=ImageFont.load_default(size=round(font_size*k)),
                   stroke_width=max(1, round(k)), stroke_fill='#11131b')
    return result


def previews(entries, images):
    rng = random.Random(1001)
    chosen = [rng.choice([e for e in entries if e['kind'] == 'normal']) for _ in range(36)]
    for pos, value in zip([2, 8, 16, 21, 27, 34], [1, 4, 8, 13, 24, 32]):
        chosen[pos] = next(e for e in entries if e.get('enemy_type') == value)
    for pos, name in zip([5, 19, 30], ['chain', 'trophy', 'phylactery']):
        chosen[pos] = next(e for e in entries if e['id'] == name)
    canvas = Image.new('RGB', (1064, 702), '#121821')
    d = ImageDraw.Draw(canvas)
    d.text((12, 12), 'ORIGINAL TILE SET / 106 PX', fill='#e4e6ed')
    d.text((668, 12), '64 PX / UI NUMBER CHECK', fill='#e4e6ed')
    for i, entry in enumerate(chosen):
        tile = images[entry['id']]
        enemy = entry['kind'] == 'enemy' or entry['base'] == 'skull'
        canvas.paste(annotated(tile, 106, enemy), (12 + (i % 6)*106, 42 + (i//6)*106))
        canvas.paste(annotated(tile, 64, enemy), (668 + (i % 6)*64, 42 + (i//6)*64))
    canvas.save(ART / 'preview.png')
    # Full audit sheet: every tile at its actual 64px display size and clear labels.
    sheet = Image.new('RGB', (8*122, 10*91 + 32), '#121821')
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), 'ALL 75 TILES / 64 PX', fill='#e4e6ed')
    for i, entry in enumerate(entries):
        x, y = (i % 8)*122, 32 + (i//8)*91
        enemy = entry['kind'] == 'enemy' or entry['base'] == 'skull'
        sheet.paste(annotated(images[entry['id']], 64, enemy), (x + 29, y))
        label = (f"{entry['enemy_type']:02d} " if entry['kind'] == 'enemy' else '') + entry['base']
        if entry['kind'] == 'normal':
            label += f" {entry['variant']}"
        d.text((x + 3, y + 67), label, fill='#e4e6ed')
    sheet.save(ART / 'contact_sheet.png')


def main():
    generations = json.loads((ART / 'generations.json').read_text())
    sources = {g['id']: g for g in generations['generations']}
    entries, images = [], {}
    atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
    for slot in slots():
        source = sources[slot['base']]
        tile = render_tile(slot)
        x, y = [v * 2 for v in slot['original_xy']]
        atlas.paste(tile, (x, y))
        path = ART / 'src' / f"{slot['id']}.png"
        tile.save(path)
        variant = slot.get('variant', 0)
        entry = dict(slot, rect=[x, y, 106, 106], source='openai-built-in-imagegen',
                     prompt=source['prompt'], generation_id=slot['base'],
                     processed_source=f"art/src/base/{slot['base']}.png",
                     file=path.relative_to(ROOT).as_posix(), background=BACKGROUNDS[slot['base']],
                     sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                     transform={'logical_size': 53, 'resize': 'NEAREST x2',
                                'angle_degrees': ANGLES[variant], 'hue_shift': HUE_SHIFTS[variant],
                                'brightness': BRIGHTNESS[variant],
                                'mirror': slot['kind'] == 'normal' and variant == 7})
        entries.append(entry)
        images[slot['id']] = tile
    atlas.save(ART / 'tiles.png')
    manifest = {'schema_version': 1, 'source': 'openai-built-in-imagegen',
                'atlas': 'art/tiles.png', 'size': [2048, 2048], 'tile_size': 106,
                'coordinate_source': 'docs/tasks/A01.prompt.md (original coordinates x2)',
                'art_direction': 'Original dark fantasy pixel icons; 24-color foregrounds, fixed type backgrounds.',
                'enemy_text_evidence': 'data/enums.json: EnemyType; Tile::GetEnemyName @0x62bc8; Tile::GetEnemyDescription @0x62be0',
                'enemy_quiet_rects_106': [[2, 4, 24, 20], [80, 4, 24, 20], [26, 74, 54, 30]],
                'generation_count': len(sources), 'tiles': entries}
    (ART / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    previews(entries, images)
    print(f'Built {len(entries)} tiles, RGBA 2048x2048; manifest + two previews')


if __name__ == '__main__':
    main()
