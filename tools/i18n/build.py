#!/usr/bin/env python3
"""Build reviewed bilingual catalogs from the U01 inventory; never infer a translation."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return json.loads((ROOT / path).read_text())

def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def resolve(ref):
    file, pointer = ref.split('#')
    obj = read(file)
    for part in pointer.lstrip('/').split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        obj = obj[int(part)] if isinstance(obj, list) else obj[part]
    return obj

# Explicit names for the printf arguments, in native argument order.
NAMES = {
    95: ['fps'], 97: ['perk', 'flaw'], 98: ['perk', 'flaw'], 101: ['race'],
    104: ['skill'], 107: ['bonus'], 108: ['enemy'], 109: ['name', 'value'],
    111: ['class'], 112: ['class'], 113: ['class', 'race'], 114: ['class'],
    115: ['class', 'limit', 'replaced'], 117: ['class', 'level'], 128: ['level'],
    129: ['class', 'skill'], 130: ['class'], 131: ['limit', 'class'],
    132: ['limit', 'class'], 133: ['skill'], 146: ['level', 'race', 'class'],
    150: ['current', 'maximum'], 151: ['score'], 152: ['score', 'bonus'],
    153: ['score', 'extra'], 154: ['score', 'extra', 'bonus'],
    155: ['score', 'extra'], 156: ['score', 'extra'], 157: ['score', 'extra'],
    158: ['turn'], 180: ['prefix', 'noun'],
    512: ['stat', 'value'], 513: ['stat', 'current', 'next'],
    514: ['stat', 'value'], 515: ['stat', 'current', 'next'],
    516: ['stat', 'value'], 517: ['stat', 'current', 'next'],
    540: ['firstStart', 'firstEnd'], 541: ['firstStart', 'firstEnd', 'lastStart', 'lastEnd'],
    558: ['label', 'current', 'next'], 559: ['label'],
    560: ['current', 'next'], 562: ['current', 'next'], 564: ['current', 'next'],
    566: ['current', 'next'], 572: ['cooldown'], 573: ['current', 'next'],
    590: ['difficulty'], 591: ['score'], 592: ['race', 'class'],
    593: ['skill'], 594: ['skill', 'description'], 595: ['enemy'],
    596: ['current', 'maximum'], 597: ['class'], 598: ['class'], 599: ['class', 'level'],
}
PRINTF = re.compile(r'%%|%(?:\.(?:\*|\d+))?[dfs]')


def normalize(text, names):
    placeholders, args, index = [], [], 0
    def replace(match):
        nonlocal index
        spec = match.group()
        if spec == '%%':
            return '%'
        name = names[index] if names else 'value'
        index += 1
        p = {'name': name, 'type': 'string' if spec[-1] == 's' else 'number', 'printf': spec}
        if spec == '%.*f':
            p['precisionParam'] = name + 'Precision'
            args.append(p['precisionParam'])
        elif spec.endswith('f'):
            p['precision'] = int(spec[2:-1])
        args.append(name)
        placeholders.append(p)
        return '{' + name + '}'
    rendered = PRINTF.sub(replace, text)
    assert len({p['name'] for p in placeholders}) == len(placeholders), text
    if names:
        assert index == len(names), text
    return rendered, placeholders, args

# Semantic aliases are stable API keys; duplicates share one stored message.
SEMANTIC = {
    95: 'ui.debug.fps', 96: 'ui.debug.fpsUnknown', 106: 'ui.number.integer',
    128: 'ui.level', 146: 'ui.character.summary', 147: 'ui.number.decimal',
    150: 'ui.value.ratio', 158: 'ui.turn', 180: 'item.name.format',
    540: 'ui.name.shortFormat', 541: 'ui.name.fullFormat',
    572: 'ui.skill.cooldown', 573: 'ui.skill.cooldownUpgrade',
    590: 'ui.difficulty.label', 592: 'ui.character.raceClass',
    593: 'item.scroll.name', 594: 'item.scroll.desc', 595: 'ui.enemy.mortal',
    596: 'ui.skill.charge', 597: 'ui.unlock.class', 598: 'ui.unlock.levelUp',
    600: 'ui.title', 601: 'ui.menu.continue', 602: 'ui.menu.newGame',
    603: 'ui.menu.challenge', 604: 'ui.menu.tutorial', 605: 'ui.menu.scores',
    606: 'ui.sound.on', 607: 'ui.sound.off', 608: 'ui.menu.highScores',
    609: 'ui.menu.openFeint', 610: 'ui.menu.bonus', 611: 'ui.menu.moreGames',
    612: 'ui.loading', 613: 'ui.reward.levelUp', 614: 'ui.reward.shop',
    615: 'ui.reward.upgrade', 621: 'ui.hud.stats', 622: 'ui.hud.menu',
    633: 'ui.confirm.newGame', 634: 'ui.no', 635: 'ui.yes',
}
ENUM_PREFIX = {
    'SkillType': 'skill', 'ClassType': 'class', 'RaceType': 'race',
    'EnemyType': 'enemy', 'PerkType': 'perk', 'FlawType': 'flaw',
    'RacialBonusType': 'racialBonus', 'StatType': 'stat', 'Difficulty': 'difficulty',
    'GameMode': 'mode', 'Sound': 'resource.sound', 'Texture': 'resource.texture',
}
FIELDS = {'displayName': 'name', 'description': 'desc', 'resourceName': 'name'}

def ref_alias(ref):
    file, pointer = ref.split('#')
    p = pointer.strip('/').split('/')
    field = FIELDS.get(p[-1], p[-1])
    if file == 'data/enums.json':
        d = read(file)
        if p[0] == 'enums':
            enum = p[1]
            value = d['enums'][enum][int(p[2])]['value']
            return f'{ENUM_PREFIX.get(enum, "enum." + enum)}.{value}.{field}'
        if p[0] == 'nativeOnlySkillSlots':
            return f'skill.{d[p[0]][int(p[1])]["value"]}.{field}'
    if file == 'data/classes.json':
        section, index = p[:2]
        prefix = {'classes': 'class', 'races': 'race', 'skills': 'skill', 'perks': 'perk', 'flaws': 'flaw'}[section]
        field = {'bonusName': 'racialBonusName', 'bonusDescription': 'racialBonusDescription'}.get(field, field)
        return f'{prefix}.{index}.{field}'
    if file == 'data/items.json':
        if p[0] == 'upgrades':
            return f'item.upgrade.{p[1]}.{field}'
        if p[0] == 'names':
            return (f'item.prefix.{p[2]}' if p[1] == 'm_prefixes'
                    else f'item.name.{p[1].removeprefix("m_names").lower()}.{p[2]}')
    return 'ref.' + file.removeprefix('data/').removesuffix('.json') + '.' + '.'.join(p)


def main():
    inventory = read('data/ui-strings.json')
    snapshot = read('tools/i18n/source-texts.json')
    translations = {}
    for line in (ROOT / 'tools/i18n/translations.tsv').read_text().splitlines():
        i, value = line.split('\t', 1)
        assert int(i) not in translations, f'duplicate translation {i}'
        translations[int(i)] = value
    assert set(translations) == set(range(len(snapshot))), 'missing/extra translations'
    originals = {}
    for i, source in enumerate(inventory['strings']):
        originals.setdefault(source['text'], []).append({
            'id': source['id'], 'ref': f'data/ui-strings.json#/strings/{i}',
            'evidence': source['sources'], 'usedBy': source['usedBy'], 'lengthLimit': source['lengthLimit'],
        })
    for source in inventory['references']:
        value = resolve(source['ref'])
        original = value if isinstance(value, str) else value['text']
        originals.setdefault(original, []).append({
            'id': source['id'], 'ref': source['ref'],
            'evidence': value if isinstance(value, dict) else {'source': source['source']},
            'usedBy': source['usedBy'], 'lengthLimit': source['lengthLimit'],
        })
    assert list(originals) == [s['en'] for s in snapshot], 'U01 changed: review inventory before rebuilding'
    aliases, source_to_key, entries, en, zh, provenance = {}, {}, {}, {}, {}, {}
    for row in snapshot:
        i, original = row['index'], row['en']
        sources = originals[original]
        assert [s['id'] for s in sources] == row['sourceIds'], 'source IDs changed'
        candidates = []
        if i in SEMANTIC:
            candidates.append(SEMANTIC[i])
        for source in sources:
            sid = source['id']
            if sid.startswith('ref.'):
                candidates.append(ref_alias(source['ref']))
            else:
                prefix, suffix = sid.split('.', 1)
                candidates.append({'helpText': 'ui.help', 'introText': 'ui.intro',
                                   'keyText': 'ui.keyboard', 'native': 'ui.native',
                                   'baked': 'ui.baked', 'inline': 'ui.inline'}.get(prefix, 'ui.' + prefix) + '.' + suffix)
        # Prefer explicit API names, then entities, then items, then local ids.
        def priority(key):
            if key == SEMANTIC.get(i): return (0, key)
            if key.startswith(('skill.', 'class.', 'race.', 'enemy.', 'perk.', 'flaw.')): return (1, key)
            if not key.startswith('ui.'): return (2, key)
            return (3, key)
        key = min(candidates, key=priority)
        assert key not in entries, key
        en_text, placeholders, args = normalize(original, NAMES.get(i))
        zh_text, zh_placeholders, zh_args = normalize(translations[i], NAMES.get(i))
        assert (placeholders, args) == (zh_placeholders, zh_args), (i, 'format mismatch')
        en[key], zh[key] = en_text, zh_text
        provenance[key] = [s['ref'] for s in sources]
        entry = {'original': original, 'sources': sources, 'placeholders': placeholders,
                 'originalFormat': original if PRINTF.search(original) else None,
                 'argumentOrder': args}
        if i in (94, 609):
            entry['allowedLatin'] = ['PlayHaven' if i == 94 else 'OpenFeint']
            entry['latinReason'] = 'Original external service brand; preserved as text only, no service restored.'
        if 674 <= i <= 699:
            entry['allowedLatin'] = [original]
            entry['latinReason'] = 'Literal input key, not an untranslated UI label; keyText table.'
        if i == 700:
            entry['allowEmpty'] = True
        if any('/resourceName' in s['ref'] for s in sources):
            entry['usage'] = 'display-label-only; resource loading must keep the original resourceName'
        entries[key] = entry
        for candidate in candidates:
            assert candidate not in aliases or aliases[candidate] == key, candidate
            aliases[candidate] = key
        for source in sources:
            source_to_key[source['id']] = key
    for locale, messages in [('en', en), ('zh', zh)]:
        write(f'data/i18n/{locale}.json', {
            '_source': 'L01: data/ui-strings.json and its referenced text objects; per-key paths in sources; native evidence and printf formats in catalog.json.',
            'schemaVersion': 1, 'locale': locale, 'messages': messages, 'sources': provenance,
        })
    write('data/i18n/catalog.json', {
        '_source': 'L01 reviewed translation inventory; native function/offset evidence retained for every source.',
        'schemaVersion': 1, 'defaultLocale': 'zh', 'fallbackLocale': 'en',
        'entries': entries, 'aliases': aliases, 'sourceToKey': source_to_key,
        'unresolved': inventory['unresolved'],
    })
    print(f'{len(entries)} messages; {len(source_to_key)} sources; {len(aliases)} semantic/local aliases')

if __name__ == '__main__':
    main()
    import subprocess
    subprocess.run(['node', str(ROOT / 'tools/i18n/achievements.mjs')], check=True)
