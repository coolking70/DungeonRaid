#!/usr/bin/env python3
"""Reproducible local-only fontTools/pyftsubset build and actual output cmap export."""
import hashlib
import json
import shutil
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / 'fonts/vendor'
SOURCE = VENDOR / 'fusion-pixel-12px-proportional-zh_hans.otf.woff2'
OUTPUT = ROOT / 'fonts/fusion-pixel-12-subset.woff2'
MANIFEST = OUTPUT.with_suffix('.chars.json')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def required_characters():
    policy = json.loads((ROOT / 'tools/i18n/fixed-symbols.json').read_text())
    chars = set(policy['characters'])
    for locale in ('en', 'zh'):
        data = json.loads((ROOT / f'data/i18n/{locale}.json').read_text())
        chars.update(''.join(data['messages'].values()))
    controls = chars.intersection(policy['nonGlyphControls'])
    chars.difference_update(policy['nonGlyphControls'])
    return sorted(map(ord, chars)), sorted(map(ord, controls))

def main():
    required, controls = required_characters()
    original = TTFont(SOURCE, recalcTimestamp=False)
    missing = set(required).difference(original.getBestCmap())
    if missing:
        raise SystemExit('Vendor font missing: ' + ', '.join(f'U+{c:04X} {chr(c)}' for c in sorted(missing)))
    original_names = {(n.nameID, n.platformID, n.platEncID, n.langID, n.toUnicode()) for n in original['name'].names}
    subset.main([
        str(SOURCE), f'--output-file={OUTPUT}', '--flavor=woff2',
        '--unicodes=' + ','.join(f'U+{c:X}' for c in required),
        '--name-IDs=*', '--name-languages=*', '--name-legacy',
        '--notdef-glyph', '--notdef-outline', '--recommended-glyphs',
        '--layout-features=*', '--no-recalc-timestamp',
    ])
    font = TTFont(OUTPUT, recalcTimestamp=False)
    cmap = font.getBestCmap()
    missing = set(required).difference(cmap)
    if missing:
        raise SystemExit(f'Subset lost required codepoints: {sorted(missing)}')
    output_names = {(n.nameID, n.platformID, n.platEncID, n.langID, n.toUnicode()) for n in font['name'].names}
    if not original_names.issubset(output_names):
        raise SystemExit('Subset lost name records (including copyright/license).')
    shutil.copyfile(VENDOR / 'OFL.txt', ROOT / 'fonts/OFL.txt')
    shutil.copytree(VENDOR / 'LICENSES', ROOT / 'fonts/LICENSES', dirs_exist_ok=True)
    upem = font['head'].unitsPerEm
    manifest = {
        '_source': 'fontTools TTFont cmap/hmtx read back from the generated WOFF2; not a copy of requested characters.',
        'source': str(SOURCE.relative_to(ROOT)), 'font': str(OUTPUT.relative_to(ROOT)),
        'sourceSha256': digest(SOURCE), 'fontSha256': digest(OUTPUT),
        'sourceBytes': SOURCE.stat().st_size, 'subsetBytes': OUTPUT.stat().st_size,
        'requiredCodepoints': required, 'codepoints': sorted(cmap), 'nonGlyphControls': controls,
        'requiredCharacters': len(required), 'coveredCharacters': len(cmap),
        'hanCharacters': sum(0x3400 <= c <= 0x9FFF or 0x20000 <= c <= 0x3134F for c in required),
        'unitsPerEm': upem, 'fontSizePx': 12,
        'advanceWidths': {str(c): font['hmtx'].metrics[glyph][0] for c, glyph in sorted(cmap.items())},
        'nameRecords': [{'nameID': n.nameID, 'platformID': n.platformID, 'encodingID': n.platEncID,
                         'languageID': n.langID, 'value': n.toUnicode()} for n in font['name'].names],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['requiredCharacters', 'coveredCharacters', 'hanCharacters', 'sourceBytes', 'subsetBytes']}, ensure_ascii=False))

if __name__ == '__main__':
    main()
