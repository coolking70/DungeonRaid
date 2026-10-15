#!/usr/bin/env python3
"""Regenerate glossary entity tables from reviewed translations and native evidence."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
def read(p): return json.loads((ROOT / p).read_text())
catalog = read('data/i18n/catalog.json')
en, zh = [read(f'data/i18n/{locale}.json')['messages'] for locale in ('en', 'zh')]

def message(alias):
    key = catalog['aliases'].get(alias, alias)
    return key, en[key], zh[key]

lines = ['''# Dungeon Raid 中英术语表（L01）

中文译名是本次移植的编辑决定；英文、实体编号与作用描述以本地原版数据为准。所有键的完整来源、原始格式串、函数与偏移见 `data/i18n/catalog.json`；两份语言包的 `sources[key]` 也逐键列出原数据路径。下面表中的编号是原生值，不是新的枚举。

## 核心术语与写法

| 英文 | 中文 | 用法与证据 |
| --- | --- | --- |
| tile | 方块 | 棋盘对象；位置/距离用“格”。`helpText.0`，g_helpText[0]，文件偏移0x63ce8 |
| trace / match / path | 连线 / 相连 / 路径 | 动作用“连线”，闭合条件用“闭合路径”，避免误称点击消除。`helpText.0`；Skill::GetSkillDescription @0x5ff2c，技能35 |
| skull / enemy / monster | 骷髅 / 敌人 / 怪物 | 骷髅用于方块；敌人用于战斗对象；原文monster保留怪物语气。`helpText.4/8/15/21` |
| special enemy | 特殊敌人 | 32种特殊敌人；EnemyType的1..32。Tile::GetEnemyName @0x62bc8 / GetEnemyDescription @0x62be0 |
| armour / shield | 护甲 / 盾牌 | 护甲是可消耗数值，盾牌是方块或装备。`helpText.5/11/17` |
| defence / attack | 防御 / 攻击 | 敌人蓝/白数值；不把敌人防御改译成玩家护甲。`helpText.15` |
| base / weapon damage | 基础伤害 / 武器伤害 | 每次连线基础值与每把剑贡献。`helpText.8/9/10` |
| upgrade / UP | 强化 / 强化点 | 装备强化与进度资源；不与角色升级混用。`helpText.12`；ItemUpgrade::InitStats @0x51ae4 |
| level up / XP | 升级 / 经验 | `helpText.13`；GameOverScreen::Initialise @0x457d4 |
| coin / gold / GP | 钱币 / 金币 | 钱币是方块；金币是持有资源。`helpText.2/7` |
| health / HP | 生命 | 上限写“生命上限”；保持中文界面无缩写残留。`helpText.3/18` |
| cooldown | 冷却 | 原文计数按原规则显示，不擅改为秒。Skill::GetSkillDescription @0x5ff2c；Tooltip::Show @0x65764 |
| bonus | 奖励 | bonus chance统一“奖励几率”；`helpText.1` |
| perk / flaw | 优点 / 缺点 | CharacterClass::GetPerkName @0x35eb4 / GetFlawName @0x35ec4 |
| racial bonus / mortal enemy | 种族天赋 / 宿敌 | CharacterClass::GetRacialBonusName @0x35ef4 / GetMortalEnemyDescription @0x35f14 |
| phylactery | 命匣 | 装备名与巫妖转化目标共用译名。EnemyType.32.description；Item::InitialiseNames @0x4dc24 |
| trophy | 奖杯 | 保留奖励/收藏语义。Item::InitialiseNames @0x4dc24，名称池Trophy |
| rune | 符文 | 装备名与技能35同名，按原文共用译名。Skill::GetSkillName @0x5ff18；Item::InitialiseNames @0x4dc24 |
| leech / poison / spikes / blunting | 吸血 / 毒素（伤害时称毒伤）/ 尖刺 / 钝化 | `data/items.json#/upgrades`，ItemUpgrade::InitStats @0x51ae4 |
| durability / piercing | 耐久 / 破甲 | 原显示含百分比时保留百分号；不重新解释公式。`data/items.json#/upgrades/4`、`/14` |
| Pretzel Hero | 椒盐卷饼英雄 | 保留卷饼笑点；短标题可用“卷饼英雄”。Game::GetModeName @0x24978；baked.31..33 |

中文标点用于完整语句；数值用半角阿拉伯数字；百分号保留`%`。词条中的原文数值、几率和条件不按推测修改。英文保留大小写、双空格、原文拼写；只把printf占位替换成命名占位。

## 动态拼接与占位符

- 装备名：原版`%s  %s`为前缀、两个空格、名词。中文为`{prefix}{noun}`，不加空格或“的”，例如“传奇长剑”。先翻译两个部件再拼接。证据：Item::GenerateName @0x4c35c（m_prefixes与m_nameMapping，sprintf）；Deserialise1 @0x4da08 / Deserialise2 @0x4d858。
- 种族职业名：原版`%s %s`及`Level %d %s %s`依次为种族、职业，前者中文仍用空格分隔，后者为`{level}级 {race} {class}`。证据：StatsMenu::Process @0x61d84；GameOverScreen::Initialise @0x457d4。
- 卷轴：`Scroll of %s` → `{skill}卷轴`；说明`Instantly activates %s: %s` → `立即发动{skill}：{description}`。证据见对应catalog原文的Tooltip来源。
- 随机人名：保留`{firstStart}{firstEnd}`和`{firstStart}{firstEnd} {lastStart}{lastEnd}`；拼接的姓名片段不作为句子再翻译。证据：NameScreen::GenerateRandomName @0x5615c。片段表未包含在U01文本输入，不能声称已提供中文随机姓名词库。
- `%d` → 命名整数；`%.1f` → 命名数值并保留1位小数格式；`%.*f`额外保留`valuePrecision`（或`currentPrecision`/`nextPrecision`）参数。`catalog.entries[key].argumentOrder`记录包括精度在内的原生参数顺序。`%%`渲染为一个`%`。
- 未提供参数时参考适配器抛错，避免显示未替换的大括号；玩家姓名作为纯文本插入，不当作模板或HTML解释。

## 翻译取舍

Hack译“劈斩”，Slash译“横斩”，在说明中明确两者配合；Shock/Awe译“震击/震慑”，保留成对命名。Skill Elixir按“将药水作为经验收集”的原描述译“经验灵药”。Sauren/Faun/Changeling译“蜥蜴人/羊人/变形灵”。Vorpal译“斩首”，是名称风格，不能据此赋予装备额外规则。

61段开场故事保留第二人称和黑色幽默，如“国王劫狱招兵”“哥布林收割机威胁现状”“裤子着火”，不删去笑点改写成常规英雄叙事。Xog'to'goth与Nil'thoth音译为“索格托哥斯”“尼尔索斯”。OpenFeint与PlayHaven是原版服务品牌，逐条白名单；26个键盘字母是输入内容，也逐条放行。资源名称译文仅作显示标签，绝不可拿中文文本加载音频或纹理。

## 实体译名

每行来源路径均可由`catalog.aliases[键]`定位，再读取`entries[规范键].sources`。偏移为原字符串文件偏移。技能40/41仅见原生表，不增造SWIG枚举；证据：Skill::Activate @0x60210 cases 0x28/0x29，data/enums.json nativeOnlySkillSlots。
''']

def table(title, prefix, ids):
    lines.extend([f'### {title}\n', '| 编号 | 英文 | 中文 | 键 | 字符串偏移 |', '| --- | --- | --- | --- | --- |'])
    for i in ids:
        alias = f'{prefix}.{i}.name'
        key, eng, chinese = message(alias)
        offsets = []
        for s in catalog['entries'][key]['sources']:
            evidence = s['evidence']
            for obj in evidence if isinstance(evidence, list) else [evidence]:
                if obj.get('stringFileOffset') and obj['stringFileOffset'] not in offsets:
                    offsets.append(obj['stringFileOffset'])
        lines.append(f'| {i} | {eng} | {chinese} | `{alias}` | {", ".join(offsets)} |')
    lines.append('')

table('32种特殊敌人（Tile::GetEnemyName @0x62bc8）', 'enemy', range(1,33))
lines.append('普通敌人枚举值0的原显示名是`None`，保留为“无”，不伪造原文“Normal”。枚举33为计数哨兵，无显示文本。\n')
table('42个原生技能（Skill::GetSkillName @0x5ff18）', 'skill', range(42))
table('10个职业（CharacterClass::GetClassName @0x35e94）', 'class', range(10))
table('10个种族（CharacterClass::GetRaceName @0x35ea4）', 'race', range(10))
table('10个优点（CharacterClass::GetPerkName @0x35eb4）', 'perk', range(10))
table('10个缺点（CharacterClass::GetFlawName @0x35ec4）', 'flaw', range(10))
table('20个装备强化属性（ItemUpgrade::InitStats @0x51ae4）', 'item.upgrade', range(20))
lines.append('''## 未决问题

1. 成就服务端名称/描述不在APK内；`data/enums.json#/enums/Achievement`的显示文本均未确认。保留其未决状态，不把ACH枚举标识伪装成原版英文，也不编造成就译名。
2. 原文帮助与实际规则的精细差异不在翻译层修正，例如经验药水、特殊敌人免疫与奖励。规则解释以相应规格及引擎证据为准。
3. U01仅恢复部分容器宽度。换行警告和未知容器见`tools/i18n/layout-report.json`，不能将未报警理解为所有屏幕验收完成。
4. 随机姓名音节表、未被U01抽取的动态拼接和未来新增UI文案仍需补充来源及翻译，并重新生成字体。
''')
(ROOT / 'docs/i18n-glossary.md').write_text('\n'.join(lines))
