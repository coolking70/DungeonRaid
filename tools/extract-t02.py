#!/usr/bin/env python3
"""Read-only T02 extraction from the shipped ELF and Ghidra exports. No game code."""
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GH = ROOT / 'reverse/native/ghidra'
B = (ROOT / 'reverse/native/libDungeonRaidJni.so').read_bytes()
H = struct.unpack_from('<16sHHIIIIIHHHHHH', B)
SECTIONS = [struct.unpack_from('<IIIIIIIIII', B, H[6] + i * H[11]) for i in range(H[12])]
SYMBOLS = {}
for s in SECTIONS:
    if s[1] not in (2, 11):
        continue
    n = SECTIONS[s[6]]
    names = B[n[4]:n[4] + n[5]]
    for p in range(s[4], s[4] + s[5], s[9]):
        ni, a, size, *_ = struct.unpack_from('<IIIBBH', B, p)
        SYMBOLS[names[ni:names.find(b'\0', ni)].decode()] = (a, size)

def offset(a):
    for s in SECTIONS:
        if s[1] != 8 and s[3] <= a < s[3] + s[5]:
            return s[4] + a - s[3]
    raise ValueError(hex(a))

def integers(a, count):
    return list(struct.unpack_from('<' + 'i' * count, B, offset(a)))

def string(a):
    p = offset(a)
    return {'text': B[p:B.index(b'\0', p)].decode(), 'stringFileOffset': hex(p)}

def table(symbol, stride, count):
    a, size = SYMBOLS[symbol]
    assert size >= stride * count
    return [{**string(a + i * stride), 'symbol': symbol, 'index': i, 'stride': stride} for i in range(count)]

def read(suffix):
    paths = list(GH.glob('*_' + suffix + '.c'))
    assert len(paths) == 1, suffix
    return paths[0].read_text()

E = json.loads((ROOT / 'data/enums.json').read_text())['enums']
def ref(kind, value):
    e = next(e for e in E[kind] if e['value'] == value)
    return {'enum': kind, 'name': e['name'], 'value': value}

classes = []
src = read('CharacterClass_Initialise')
for i in range(10):
    if i == 0:
        race, perk, flaw, pool = 0, 255, 255, list(range(20))
    else:
        block = re.search(r'    case ' + str(i) + r':(.*?)(?=    case |\n  }\n)', src, re.S)[1]
        def field(off):
            return int(re.search(r'\(this \+ ' + off + r'\) = (0x[\da-f]+|\d+);', block)[1], 0)
        race, perk, flaw = field('8'), field('0x10'), field('0x20')
        pool = [int(x, 0) for x in re.findall(r'local_[\da-f]+ = (0x[\da-f]+|\d+);\s*std::vector<SkillType', block)]
    assert len(pool) == 20
    classes.append({'class': ref('ClassType', i), 'displayName': E['ClassType'][i]['displayName'],
                    'defaultRace': ref('RaceType', race), 'defaultPerk': ref('PerkType', perk),
                    'defaultFlaw': ref('FlawType', flaw), 'initialClassLevel': 1 if i == 0 else 0,
                    'initialEquippedSkills': [], 'firstLevelRewardSkill': ref('SkillType', pool[0]) if i else None,
                    'baseSkillVector': [ref('SkillType', s) for s in pool],
                    'effectivePoolRule': 'Adventurer: unlocked ids 0..41; others: sorted unique of 20 base/replacement slots',
                    'unlockRule': 'available initially' if i == 0 else 'random locked class on Trophy collection; see docs/spec/05-classes.md',
                    'unlockText': E['ClassType'][i]['description'],
                    'source': 'CharacterClass::Initialise @0x36524; Game::InitNewGame @0x2d7a4; FoldoutMenu::Initialise @0x42794'})
skills = []
cd = integers(SYMBOLS['g_skillCooldowns'][0], 42)
for i in range(42):
    skills.append({'nativeId': i, 'skill': ref('SkillType', i) if i < 40 else None,
                   'displayName': table('g_skillNames', 18, 42)[i], 'baseCooldown': cd[i],
                   'cooldownSource': {'symbol': 'g_skillCooldowns', 'fileOffset': hex(offset(SYMBOLS['g_skillCooldowns'][0] + i * 4))},
                   'normallyObtainable': i < 40,
                   'source': 'Skill::Initialise @0x60984; Game::IsSkillUnlocked @0x248e8; Skill::Activate @0x60210'})
races = []
for i, enemy in enumerate(integers(0x6b298 - 0x10000, 10)):
    r = E['RaceType'][i]
    races.append({'race': ref('RaceType', i), 'racialBonus': ref('RacialBonusType', i),
                  'mortalEnemy': ref('EnemyType', enemy), 'bonusName': r['racialBonusName'],
                  'bonusDescription': r['racialBonusDescription'], 'mortalEnemyDescription': r['mortalEnemyDescription'],
                  'source': 'CharacterClass::GetMortalEnemyType @0x35f34; table Ghidra @0x6b298'})
C = {'_source': {'functions': ['CharacterClass::Initialise @0x36524', 'CharacterClass::GetSkillPool @0x3707c',
                              'Game::IsSkillUnlocked @0x248e8', 'Skill::Initialise @0x60984'],
                 'generator': 'tools/extract-t02.py', 'nativeSkillBoundary': '42 native slots, 40 wrapper skills; native 40/41 have no enum name'},
     'classes': classes, 'races': races, 'skills': skills,
     'statIncrements': {'values': integers(0x6e088 - 0x10000, 4), 'source': 'Skill::GetStat @0x5fef4; Ghidra @0x6e088'},
     'perks': [e for e in E['PerkType'] if e['value'] < 10],
     'flaws': [e for e in E['FlawType'] if e['value'] < 10]}

# UpgradeType is native-only, NOT the wrapper StatType.
upnames = table('g_upgradeNames', 17, 20)
updesc = table('g_upgradeDescriptions', SYMBOLS['g_upgradeDescriptions'][1] // 20, 20)
keys = ['weaponDamage','baseDamage','leechPercent','poisonDamage','piercePercent','cooldownFlag','xpQuarterBonus','goldQuarterBonus','strength','luck','maxHealth','armour','spikes','upgradeQuarterBonus','durabilityPercent','weakenAttack','repair','regeneration','dexterity','vitality']
upgrades = [{'nativeId': i, 'key': key, 'itemOffset': hex(0x94 + 4*i), 'displayName': upnames[i],
             'description': updesc[i], 'source': 'ItemUpgrade::InitStats @0x51ae4; Game::UpdateStats @0x26c94'} for i,key in enumerate(keys)]
poolsrc = read('ItemUpgrade_GetRandomStat')
pools = []
for i in range(5):
    block = re.search(r'  case ' + str(i) + r':(.*?)(?=  case |\n  }\n)', poolsrc, re.S)[1]
    pool = sorted(int(x, 0) for x in re.findall(r'local_[\da-f]+ = (0x[\da-f]+|\d+);\s*std::priv::', block))
    pools.append(pool)
ranges = ['g_weaponsRange', 'g_helmetsRange', 'g_armourRange', 'g_shieldsRange', 'g_accessoriesRange']
slots = []
for i in range(5):
    initial = [0]*20
    initial[{0:0, 1:11, 2:11, 3:11, 4:10}[i]] = [2,1,2,1,10][i]
    slots.append({'itemType': ref('ItemType', i), 'initialStats': initial, 'upgradePool': pools[i],
                  'iconRangeInclusive': integers(SYMBOLS[ranges[i]][0], 2),
                  'source': 'Item::GenerateStats @0x50ee4; ItemUpgrade::GetRandomStat @0x51db8; ' + ranges[i]})
# Each assignment is followed by its vector insertion; preserve duplicate spellings/weights.
namesrc = read('Item_InitialiseNames')
names = {}
for m in re.finditer(r'\b(?:local_|pcStack_|puStack_)[\da-f]+(?:\[0\])? = ("[^"\n]*"|&DAT_[\da-f]+);', namesrc):
    val = m[1]
    tail = namesrc[m.end():]
    # Only text assignments are matched; the following first vector identifies the destination.
    dest = re.search(r'\bm_(names\w+|prefixes)\b', tail)
    assert dest
    group = 'm_' + dest[1]
    if val.startswith('&DAT_'):
        entry = string(int(val[5:],16)-0x10000)
    else:
        literal = json.loads(val)
        needle = literal.encode() + b'\0'
        pos = B.find(needle)
        assert pos >= 0
        entry = {'text':literal,'stringFileOffset':hex(pos)}
    names.setdefault(group,[]).append({**entry, 'sourceLine': namesrc[:m.start()].count('\n')+1})
I = {'_source': {'functions': ['Item::GenerateStats @0x50ee4','Item::InitialiseNames @0x4dc24','ItemUpgrade::GetRandomStat @0x51db8','Game::UpdateStats @0x26c94'],
                 'generator':'tools/extract-t02.py','upgradeType':'native-only integer 0..19, not StatType; do not invent wrapper enum members'},
     'slots':slots,'upgrades':upgrades,'names':names,
     'nameMappings': [{'pool':p,'iconStart':a,'iconEndExclusive':b} for p,a,b in [
         ('m_namesSword1',0,20),('m_namesSword2',20,40),('m_namesMace',40,50),('m_namesHammer',50,60),
         ('m_namesAxe',60,80),('m_namesHelm',80,160),('m_namesShield',160,240),('m_namesArmour',240,320),
         ('m_namesAmulet',320,340),('m_namesRing',340,360),('m_namesCharm',360,370),('m_namesRune',370,380),('m_namesPotion',380,400)]],
     'nameMappingEvidence':'Item::InitialiseNames @0x4dc24; final potion map recovered from disasm @0x3f1a2..0x3f1b6: vector r8, bounds 0x17c..0x190. g_accessoriesRange=[320,399].',
     'initialExceptions':[{'condition':ref('FlawType',6),'itemType':ref('ItemType',2),'nativeStatId':11,'value':1},
                          {'condition':ref('GameMode',1),'itemType':ref('ItemType',4),'nativeStatId':10,'value':0}],
     'rng':{'shop':ref('RandType',2),'upgrade':ref('RandType',4)}}
# Declarative rules, transcribed from the named functions; not executable game logic.
for u in upgrades:
    i = u['nativeId']
    u['stepSource'] = 'ItemUpgrade::GetStatUpgrade @0x51888; GetStatDowngrade @0x5193c; IsUpgradeAllowed @0x517b8'
    u['upgradeStep'] = {'constant': 1}
    u['downgradeStep'] = {'sameAsUpgrade': True}
    u['eligibility'] = 'no additional total-stat cap'
    if i == 2:
        u['upgradeStep'] = {'metric': 'totalLeechPercent', 'bands': [[0,14,5],[15,20,3],[21,None,2]]}
        u['downgradeStep'] = {'metric': 'totalLeechPercent', 'bands': [[0,17,5],[18,22,3],[23,None,2]]}
        u['eligibility'] = 'totalLeechPercent < 25'
    elif i == 3:
        u['upgradeStep'] = {'constant': 2}
    elif i == 4:
        u['upgradeStep'] = {'constant': 10}
        u['eligibility'] = 'derivedPiercePercent < 95'
    elif i == 5:
        u['eligibility'] = 'allowCooldown flag; selected item has stat5 == 0 in ordinary upgrade menu'
    elif i in (6,7,13):
        u['rawUnit'] = 0.25
        u['derivedCap'] = 2.0
        u['eligibility'] = 'corresponding derived quarter bonus < 2.0'
    elif i == 10:
        u['upgradeStep'] = {'constant': 10, 'pretzelOverride': 0}
        u['eligibility'] = 'not Pretzel'
    elif i == 14:
        u['upgradeStep'] = {'metric': '100 - breakThreshold', 'bands': [[0,69,10],[70,79,5],[80,85,3],[86,None,2]], 'breakThresholdAbove100': 10}
        u['downgradeStep'] = {'metric': '100 - breakThreshold', 'bands': [[0,74,10],[75,82,5],[83,87,3],[88,None,2]], 'breakThresholdAbove100': 10}
        u['eligibility'] = '100 - min(breakThreshold,100) < 90'
    elif i == 15:
        u['eligibility'] = 'not Sprint; random weakening filter described in docs/spec/04-items.md'
    elif i == 17:
        u['upgradeStep'] = {'constant': 1, 'perkOverride': {'perk': ref('PerkType',5), 'value': 2}}
for slot in slots:
    slot['upgradeWeights'] = [{'nativeStatId': i, 'weight': 1} for i in slot['upgradePool']]
I['generationRulesSource'] = 'docs/spec/04-items.md; Item::GenerateStats @0x50ee4 (ordered, branch-sensitive RNG)'
C['classLevelMilestones'] = {'perkSlots': [1,3,7,9], 'changeRace': 5, 'globalFirstSkillUnlock': 10,
                            'replacementCountsByLevel': [0,0,2,2,4,4,6,6,8,8,10],
                            'source': 'IsPerkUnlocked @0x35d78; GetReplacementSkillsAllowed @0x35dc0; Validate @0x36390; IsSkillUnlocked @0x248e8'}
for name,data in [('classes',C),('items',I)]:
    (ROOT/'data'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Extracted 10 classes, 10 races, 42 native skills, 5 slots, 20 upgrades')
print('Cooldowns:',cd,'stat increments:',C['statIncrements']['values'])
print('Name pools:',{k:len(v) for k,v in names.items()})
