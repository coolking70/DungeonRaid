#!/usr/bin/env python3
"""T01: read-only extraction of SWIG enums and fixed-width native text tables."""
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
WRAPPERS = ROOT / 'reverse/jadx/sources/com/fireflame/dungeonraid/wrappers'
binary = (ROOT / 'reverse/native/libDungeonRaidJni.so').read_bytes()
header = struct.unpack_from('<16sHHIIIIIHHHHHH', binary)
assert header[0][:6] == b'\x7fELF\x01\x01'
sections = [struct.unpack_from('<IIIIIIIIII', binary, header[6] + i * header[11])
            for i in range(header[12])]
symbols = {}
for section in sections:
    if section[1] not in (2, 11):
        continue
    table = sections[section[6]]
    names = binary[table[4]:table[4] + table[5]]
    for pos in range(section[4], section[4] + section[5], section[9]):
        name, address, size, _, _, _ = struct.unpack_from('<IIIBBH', binary, pos)
        symbols[names[name:names.find(b'\0', name)].decode()] = (address, size)

def file_offset(address):
    for section in sections:
        if section[1] != 8 and section[3] <= address < section[3] + section[5]:
            return section[4] + address - section[3]
    raise ValueError(hex(address))

def native_text(symbol, stride, index, function):
    address, size = symbols[symbol]
    assert 0 <= index * stride < size
    address += index * stride
    offset = file_offset(address)
    raw = binary[offset:offset + stride]
    assert b'\0' in raw
    return {
        'text': raw.split(b'\0')[0].decode('utf-8'),
        'source': function,
        'symbol': symbol,
        'index': index,
        'stride': stride,
        'elfAddress': hex(address),
        'ghidraAddress': hex(address + 0x10000),
        'stringFileOffset': hex(offset),
    }

# Limits exclude COUNT/NONE sentinels. RacialBonus getters accept RaceType;
# RaceType and RacialBonusType values align, but remain distinct enums.
TABLES = {
    'EnemyType': (33, ('g_enemyNames', 13, 'Tile::GetEnemyName @0x62bc8'),
                  ('g_enemyText', 150, 'Tile::GetEnemyDescription @0x62be0')),
    'SkillType': (40, ('g_skillNames', 18, 'Skill::GetSkillName @0x5ff18'),
                  ('g_skillDescriptions', 120, 'Skill::GetSkillDescription @0x5ff2c')),
    'ClassType': (10, ('g_classNames', 32, 'CharacterClass::GetClassName @0x35e94'),
                  ('g_classUnlockDescriptions', 256, 'CharacterClass::GetUnlockDescription @0x35f24')),
    'RaceType': (10, ('g_raceNames', 32, 'CharacterClass::GetRaceName @0x35ea4'), None),
    'PerkType': (10, ('g_perkNames', 32, 'CharacterClass::GetPerkName @0x35eb4'),
                 ('g_perkDescriptions', 128, 'CharacterClass::GetPerkDescription @0x35ed4')),
    'FlawType': (10, ('g_flawNames', 32, 'CharacterClass::GetFlawName @0x35ec4'),
                 ('g_flawDescriptions', 128, 'CharacterClass::GetFlawDescription @0x35ee4')),
    'RacialBonusType': (10, ('g_racialBonusNames', 128, 'CharacterClass::GetRacialBonusName @0x35ef4'),
                        ('g_racialBonusDescriptions', 256, 'CharacterClass::GetRacialBonusDescription @0x35f04')),
    'StatType': (8, ('g_statNames', 12, 'Skill::Initialise(StatType) @0x606a4'), None),
}
strings = []
for line in (ROOT / 'reverse/native/strings.txt').read_text().splitlines():
    match = re.match(r'^([0-9a-f]+) (.*)$', line)
    if match:
        strings.append((int(match[1], 16), match[2]))

def literal_text(literal, function):
    offsets = [hex(offset) for offset, text in strings if text == literal]
    if not offsets:
        # strings.txt omits short strings such as "up" and "xp".
        needle = literal.encode() + b'\0'
        offsets = [hex(m.start()) for m in re.finditer(re.escape(needle), binary)]
    assert offsets, literal
    return {'text': literal, 'stringFileOffsets': offsets, 'source': function}

resources = {}
for enum, filename, function in [
    ('Sound', '0006770c_GetSoundName.c', 'GetSoundName @0x6770c'),
    ('Texture', '0006751c_GetTextureName.c', 'GetTextureName @0x6751c')]:
    source = (ROOT / 'reverse/native/ghidra' / filename).read_text()
    resources[enum] = {
        int(value, 0): literal_text(literal, function)
        for value, literal in re.findall(r'case (0x[0-9a-f]+|[0-9]+):\s*pcVar1 = "([^"]+)";', source)
    }

result = {
    '_source': {
        'wrappers': str(WRAPPERS.relative_to(ROOT)),
        'native': 'reverse/native/libDungeonRaidJni.so',
        'functions': [entry[2] for spec in TABLES.values() for entry in spec[1:] if entry]
                     + ['Game::GetDifficultyName @0x24938', 'Game::GetModeName @0x24978',
                        'GetSoundName @0x6770c', 'GetTextureName @0x6751c'],
        'generator': 'tools/extract-enums.py',
        'addressConvention': 'Ghidra = ELF virtual address + 0x10000; stringFileOffset is a file offset, not a virtual address.',
        'nullMeaning': 'No proven static display text mapping (or sentinel); never synthesize display names from enum identifiers.',
        'classDescriptionMeaning': 'Unlock condition text, not a general class description.',
        'raceDescriptionMeaning': 'Race bonus and mortal enemy text are in separate fields.',
    },
    'enums': {},
    'nativeOnlySkillSlots': [
        {'value': i,
         'displayName': native_text('g_skillNames', 18, i, 'Skill::GetSkillName @0x5ff18'),
         'description': native_text('g_skillDescriptions', 120, i, 'Skill::GetSkillDescription @0x5ff2c'),
         'evidence': 'Skill::Activate @0x60210 cases 0x28/0x29; Skill::Initialise(StatType) @0x606a4 uses stat + 0x2a',
         'conflict': 'Wrapper SKILL_COUNT=40; no wrapper name for native skill 40/41. Preserve wrapper values; do not invent enum members.'}
        for i in (40, 41)
    ],
}
for path in sorted(WRAPPERS.glob('*.java')):
    source = path.read_text()
    if 'private static ' + path.stem + '[] swigValues' not in source:
        continue
    entries, values, next_value = [], {}, 0
    pattern = re.compile(r'public static final ' + path.stem + r' (\w+) = new ' + path.stem + r'\("([^\"]+)"(?:, ([^;]+))?\);')
    for match in pattern.finditer(source):
        name, swig_name, argument = match.groups()
        assert name == swig_name
        native_evidence = None
        if argument is None:
            value = next_value
        elif argument in values:
            value = values[argument]
        elif argument.startswith('DungeonRaidJNI.'):
            getter = argument.removeprefix('DungeonRaidJNI.').removesuffix('()').replace('_', '_1')
            matches = list((ROOT / 'reverse/native/ghidra').glob(f'*_DungeonRaidJNI_{getter}.c'))
            assert len(matches) == 1, getter
            native_source = matches[0].read_text()
            value = int(re.search(r'return (0x[0-9a-f]+|[0-9]+);', native_source)[1], 0)
            native_evidence = str(matches[0].relative_to(ROOT))
        else:
            value = int(argument, 0)
        next_value = value + 1
        values[name] = value
        item = {'name': name, 'value': value,
                'evidence': f'{path.relative_to(ROOT)}:{source[:match.start()].count(chr(10)) + 1}',
                'displayName': None, 'description': None}
        if native_evidence:
            item['nativeValueEvidence'] = native_evidence
        spec = TABLES.get(path.stem)
        if spec and 0 <= value < spec[0]:
            for key, entry in zip(('displayName', 'description'), spec[1:]):
                if entry:
                    symbol, stride, function = entry
                    item[key] = native_text(symbol, stride, value, function)
        if path.stem == 'RaceType' and value < 10:
            for key, symbol, stride, function in [
                ('racialBonusName', 'g_racialBonusNames', 128, 'CharacterClass::GetRacialBonusName @0x35ef4'),
                ('racialBonusDescription', 'g_racialBonusDescriptions', 256, 'CharacterClass::GetRacialBonusDescription @0x35f04'),
                ('mortalEnemyDescription', 'g_mortalEnemyDescriptions', 256, 'CharacterClass::GetMortalEnemyDescription @0x35f14')]:
                item[key] = native_text(symbol, stride, value, function)
        literals = {'Difficulty': {0: 'Easy', 1: 'Normal', 2: 'Hard', 3: 'Harder'},
                    'GameMode': {0: 'Dungeon Sprint', 1: 'Pretzel Hero', 3: 'Classic'}}
        if value in literals.get(path.stem, {}):
            literal = literals[path.stem][value]
            item['displayName'] = literal_text(literal, 'Game::GetDifficultyName @0x24938' if path.stem == 'Difficulty' else 'Game::GetModeName @0x24978')
        if not name.endswith('_COUNT') and value in resources.get(path.stem, {}):
            item['resourceName'] = resources[path.stem][value]
        if item['displayName'] is None:
            item['textStatus'] = 'sentinel-or-no-proven-display-mapping'
        elif item['description'] is None:
            item['textStatus'] = 'name-mapped-description-unresolved-or-not-applicable'
        else:
            item['textStatus'] = 'mapped'
        entries.append(item)
    assert entries, path
    result['enums'][path.stem] = entries

(ROOT / 'data').mkdir(exist_ok=True)
(ROOT / 'data/enums.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(f"Extracted {len(result['enums'])} enums / {sum(map(len, result['enums'].values()))} entries")
