# Dungeon Raid 中英术语表（L01）

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

### 32种特殊敌人（Tile::GetEnemyName @0x62bc8）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 1 | Boss | 首领 | `enemy.1.name` | 0x6fcfd |
| 2 | Spiky | 尖刺 | `enemy.2.name` | 0x5d5b0, 0x6fd0a |
| 3 | Golden | 黄金 | `enemy.3.name` | 0x5d750, 0x6fd17 |
| 4 | Healer | 治疗者 | `enemy.4.name` | 0x6fd24 |
| 5 | Invisible | 隐形者 | `enemy.5.name` | 0x6fd31 |
| 6 | Acidic | 酸液怪 | `enemy.6.name` | 0x6fd3e |
| 7 | Flaming | 烈焰怪 | `enemy.7.name` | 0x6fd4b |
| 8 | Freezing | 冰霜怪 | `enemy.8.name` | 0x6fd58 |
| 9 | Poisonous | 剧毒怪 | `enemy.9.name` | 0x6fd65 |
| 10 | Kamikaze | 自爆怪 | `enemy.10.name` | 0x6fd72 |
| 11 | Overseer | 监工 | `enemy.11.name` | 0x6fd7f |
| 12 | Corrosive | 腐蚀怪 | `enemy.12.name` | 0x6fd8c |
| 13 | Thief | 窃贼 | `enemy.13.name` | 0x6fd99 |
| 14 | Chaotic | 混沌 | `enemy.14.name` | 0x5d6f4, 0x6fda6 |
| 15 | Mage | 法师 | `enemy.15.name` | 0x60b88, 0x6fdb3 |
| 16 | Assassin | 刺客 | `enemy.16.name` | 0x60c08, 0x6fdc0 |
| 17 | Doppelganger | 模仿者 | `enemy.17.name` | 0x6fdcd |
| 18 | Alchemist | 炼金术士 | `enemy.18.name` | 0x6fdda |
| 19 | Unstable | 不稳定者 | `enemy.19.name` | 0x6fde7 |
| 20 | Vampire | 吸血鬼 | `enemy.20.name` | 0x6fdf4 |
| 21 | Vengeful | 复仇者 | `enemy.21.name` | 0x6fe01 |
| 22 | Trampling | 践踏者 | `enemy.22.name` | 0x6fe0e |
| 23 | Greasy | 油滑怪 | `enemy.23.name` | 0x6fe1b |
| 24 | Alpha | 头狼 | `enemy.24.name` | 0x6fe28 |
| 25 | Magnetic | 磁力怪 | `enemy.25.name` | 0x6fe35 |
| 26 | Brute | 蛮力怪 | `enemy.26.name` | 0x6fe42 |
| 27 | Armoured | 重甲怪 | `enemy.27.name` | 0x6fe4f |
| 28 | Devourer | 吞噬者 | `enemy.28.name` | 0x6fe5c |
| 29 | Defiler | 亵渎者 | `enemy.29.name` | 0x6fe69 |
| 30 | Meat Shield | 肉盾 | `enemy.30.name` | 0x6fe76 |
| 31 | Fleeing | 逃亡者 | `enemy.31.name` | 0x6fe83 |
| 32 | Lich | 巫妖 | `enemy.32.name` | 0x6fe90 |

普通敌人枚举值0的原显示名是`None`，保留为“无”，不伪造原文“Normal”。枚举33为计数哨兵，无显示文本。

### 42个原生技能（Skill::GetSkillName @0x5ff18）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Steal | 偷窃 | `skill.0.name` | 0x6e21c |
| 1 | Freeze | 冰冻 | `skill.1.name` | 0x6e22e |
| 2 | Heal | 治疗 | `skill.2.name` | 0x6e240 |
| 3 | Repair | 修复 | `skill.3.name` | 0x6e252, 0x6d4a4 |
| 4 | Counterattack | 反击 | `skill.4.name` | 0x6e264 |
| 5 | Shatter | 碎裂 | `skill.5.name` | 0x6e276 |
| 6 | Golden Touch | 点金术 | `skill.6.name` | 0x6e288 |
| 7 | Teleport | 传送 | `skill.7.name` | 0x6e29a |
| 8 | Explosive Potion | 爆炸药水 | `skill.8.name` | 0x6e2ac |
| 9 | Skill Elixir | 经验灵药 | `skill.9.name` | 0x6e2be |
| 10 | Enchant | 附魔 | `skill.10.name` | 0x6e2d0 |
| 11 | Slash | 横斩 | `skill.11.name` | 0x6e2e2 |
| 12 | Treasure | 宝藏 | `skill.12.name` | 0x6e2f4 |
| 13 | Scavenge | 拾荒 | `skill.13.name` | 0x6e306 |
| 14 | Disarm | 缴械 | `skill.14.name` | 0x6e318 |
| 15 | Dazzle | 炫光 | `skill.15.name` | 0x6e32a |
| 16 | Boost Damage | 伤害增幅 | `skill.16.name` | 0x6e33c |
| 17 | Boost Gold | 金币增幅 | `skill.17.name` | 0x6e34e, 0x6d40b |
| 18 | Boost Health | 生命增幅 | `skill.18.name` | 0x6e360 |
| 19 | Boost Armour | 护甲增幅 | `skill.19.name` | 0x6e372 |
| 20 | Exorcise | 驱邪 | `skill.20.name` | 0x6e384 |
| 21 | Banish | 放逐 | `skill.21.name` | 0x6e396 |
| 22 | Trap | 陷阱 | `skill.22.name` | 0x6e3a8 |
| 23 | Big Game Hunter | 巨兽猎手 | `skill.23.name` | 0x6e3ba |
| 24 | Treasure Chamber | 藏宝室 | `skill.24.name` | 0x6e3cc |
| 25 | Magic Sword | 魔剑 | `skill.25.name` | 0x6e3de |
| 26 | Earthquake | 地震 | `skill.26.name` | 0x6e3f0 |
| 27 | Explosive Armour | 爆裂护甲 | `skill.27.name` | 0x6e402 |
| 28 | Fireball | 火球 | `skill.28.name` | 0x6e414 |
| 29 | Mana Potion | 法力药水 | `skill.29.name` | 0x6e426 |
| 30 | Hack | 劈斩 | `skill.30.name` | 0x6e438 |
| 31 | Volley | 齐射 | `skill.31.name` | 0x6e44a |
| 32 | Masochism | 自虐 | `skill.32.name` | 0x6e45c |
| 33 | Wish | 许愿 | `skill.33.name` | 0x6e46e |
| 34 | Berserk | 狂暴 | `skill.34.name` | 0x6e480 |
| 35 | Rune | 符文 | `skill.35.name` | 0x5d278, 0x6e492 |
| 36 | Greed | 贪欲 | `skill.36.name` | 0x6e4a4 |
| 37 | Last Stand | 背水一战 | `skill.37.name` | 0x6e4b6 |
| 38 | Charge | 冲锋 | `skill.38.name` | 0x6e4c8 |
| 39 | Haste | 疾行 | `skill.39.name` | 0x6e4da |
| 40 | Shock | 震击 | `skill.40.name` | 0x6e4ec |
| 41 | Awe | 震慑 | `skill.41.name` | 0x6e4fe |

### 10个职业（CharacterClass::GetClassName @0x35e94）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Adventurer | 冒险者 | `class.0.name` | 0x5bb00, 0x60ae8 |
| 1 | Ranger | 游侠 | `class.1.name` | 0x60b08 |
| 2 | Raider | 掠夺者 | `class.2.name` | 0x60b28 |
| 3 | Priest | 牧师 | `class.3.name` | 0x60b48 |
| 4 | Barbarian | 野蛮人 | `class.4.name` | 0x60b68 |
| 5 | Mage | 法师 | `class.5.name` | 0x60b88, 0x6fdb3 |
| 6 | Rogue | 盗贼 | `class.6.name` | 0x60ba8 |
| 7 | Paladin | 圣骑士 | `class.7.name` | 0x60bc8 |
| 8 | Warrior | 战士 | `class.8.name` | 0x60be8 |
| 9 | Assassin | 刺客 | `class.9.name` | 0x60c08, 0x6fdc0 |

### 10个种族（CharacterClass::GetRaceName @0x35ea4）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Human | 人类 | `race.0.name` | 0x60c28 |
| 1 | Elf | 精灵 | `race.1.name` | 0x60c48 |
| 2 | Dwarf | 矮人 | `race.2.name` | 0x60c68 |
| 3 | Sauren | 蜥蜴人 | `race.3.name` | 0x60c88 |
| 4 | Faun | 羊人 | `race.4.name` | 0x60ca8 |
| 5 | Orc | 兽人 | `race.5.name` | 0x60cc8 |
| 6 | Halfling | 半身人 | `race.6.name` | 0x60ce8 |
| 7 | Werewolf | 狼人 | `race.7.name` | 0x60d08 |
| 8 | Dragonkin | 龙裔 | `race.8.name` | 0x60d28 |
| 9 | Changeling | 变形灵 | `race.9.name` | 0x60d48 |

### 10个优点（CharacterClass::GetPerkName @0x35eb4）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Unexpected | 出其不意 | `perk.0.name` | 0x60d68 |
| 1 | Gifted | 天赋异禀 | `perk.1.name` | 0x5d63c, 0x60d88 |
| 2 | Daring | 大胆 | `perk.2.name` | 0x60da8 |
| 3 | Cunning | 狡黠 | `perk.3.name` | 0x60dc8 |
| 4 | Strong | 强壮 | `perk.4.name` | 0x5d64c, 0x60de8 |
| 5 | Faithful | 虔诚 | `perk.5.name` | 0x60e08 |
| 6 | Agile | 灵敏 | `perk.6.name` | 0x60e28 |
| 7 | Frugal | 节俭 | `perk.7.name` | 0x60e48 |
| 8 | Intimidating | 威慑 | `perk.8.name` | 0x60e68 |
| 9 | Tough | 坚韧 | `perk.9.name` | 0x60e88 |

### 10个缺点（CharacterClass::GetFlawName @0x35ec4）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Confused | 迷糊 | `flaw.0.name` | 0x60ea8 |
| 1 | Frail | 虚弱 | `flaw.1.name` | 0x5d400, 0x60ec8 |
| 2 | Cocky | 自大 | `flaw.2.name` | 0x60ee8 |
| 3 | Sneaky | 鬼祟 | `flaw.3.name` | 0x60f08 |
| 4 | Reckless | 鲁莽 | `flaw.4.name` | 0x60f28 |
| 5 | Cautious | 谨慎 | `flaw.5.name` | 0x60f48 |
| 6 | Slim | 瘦弱 | `flaw.6.name` | 0x60f68 |
| 7 | Clumsy | 笨拙 | `flaw.7.name` | 0x60f88 |
| 8 | Zealous | 狂热 | `flaw.8.name` | 0x60fa8 |
| 9 | Noisy | 吵闹 | `flaw.9.name` | 0x60fc8 |

### 20个装备强化属性（ItemUpgrade::InitStats @0x51ae4）

| 编号 | 英文 | 中文 | 键 | 字符串偏移 |
| --- | --- | --- | --- | --- |
| 0 | Weapon Damage | 武器伤害 | `item.upgrade.0.name` | 0x6d394 |
| 1 | Base Damage | 基础伤害 | `item.upgrade.1.name` | 0x6d3a5 |
| 2 | Life Leech | 吸血 | `item.upgrade.2.name` | 0x6d3b6 |
| 3 | Poison | 毒素 | `item.upgrade.3.name` | 0x6d3c7 |
| 4 | Armour Piercing | 破甲 | `item.upgrade.4.name` | 0x6d3d8 |
| 5 | Quicken | 加速 | `item.upgrade.5.name` | 0x6d3e9 |
| 6 | Boost XP | 经验增幅 | `item.upgrade.6.name` | 0x6d3fa |
| 7 | Boost Gold | 金币增幅 | `item.upgrade.7.name` | 0x6e34e, 0x6d40b |
| 8 | Boost Strength | 力量增幅 | `item.upgrade.8.name` | 0x6d41c |
| 9 | Boost Luck | 幸运增幅 | `item.upgrade.9.name` | 0x6d42d |
| 10 | Health | 生命 | `item.upgrade.10.name` | 0x6d43e |
| 11 | Armour | 护甲 | `item.upgrade.11.name` | 0x5d06c, 0x6d44f |
| 12 | Spikes | 尖刺 | `item.upgrade.12.name` | 0x6d460 |
| 13 | Boost UP | 强化增幅 | `item.upgrade.13.name` | 0x6d471 |
| 14 | Durability | 耐久 | `item.upgrade.14.name` | 0x6d482 |
| 15 | Blunting | 钝化 | `item.upgrade.15.name` | 0x6d493 |
| 16 | Repair | 修复 | `item.upgrade.16.name` | 0x6e252, 0x6d4a4 |
| 17 | Regenerate | 再生 | `item.upgrade.17.name` | 0x6d4b5 |
| 18 | Boost Dexterity | 敏捷增幅 | `item.upgrade.18.name` | 0x6d4c6 |
| 19 | Boost Vitality | 体质增幅 | `item.upgrade.19.name` | 0x6d4d7 |

## 未决问题

1. 成就服务端名称/描述不在APK内；`data/enums.json#/enums/Achievement`的显示文本均未确认。保留其未决状态，不把ACH枚举标识伪装成原版英文，也不编造成就译名。
2. 原文帮助与实际规则的精细差异不在翻译层修正，例如经验药水、特殊敌人免疫与奖励。规则解释以相应规格及引擎证据为准。
3. U01仅恢复部分容器宽度。换行警告和未知容器见`tools/i18n/layout-report.json`，不能将未报警理解为所有屏幕验收完成。
4. 随机姓名音节表、未被U01抽取的动态拼接和未来新增UI文案仍需补充来源及翻译，并重新生成字体。

## U06 成就与排行榜文本

成就语义键为`achievement.<Java枚举下标>.name/desc`，榜单为`leaderboard.<OpenFeint id>.name`；仍按完整英文去重并使用catalog别名。原文来自APK内`openfeint_offline_config.xml`，不是由枚举名扩写。逐字段行号及`mAchievements`下标见`data/achievements.json`。中文人工译文在`tools/i18n/achievements-zh.json`；1–27沿用职业/种族目录名称，重建见U06报告。

- Classy! →「职业满贯！」：保留“职业全满”的双关，不硬译“时髦”。
- Nom Nom →「啊呜啊呜」；Touche →「以刺还刺」：分别保留吞吃拟声及反击笑点。
- Just a Flesh Wound →「不过是皮肉伤」、I Ain't Dead Yet →「我还没死呢」、Brave Brave Sir Robin →「勇敢、勇敢的罗宾爵士」：保留原文夸张、反讽口吻。
- POW! Right in the Kisser! →「砰！正中下巴！」；Stay a While and Listen →「且慢，听我一言」；The Burninator →「喷火大王」：优先使动作和语气可读，不给玩家添加典故解释。
- Guts / gutsy attack →「胆气 / 胆气攻击」，与半身人种族天赋一致；技能与种族称呼继续用L01的上勾拳、致残、变形、横斩、许愿、巨兽猎手、背水一战。
- Shock and Awe →「震击与震慑」保留标题；说明仍按XML列出横斩、火球、冲锋、许愿，不把标题误当四个条件的技能名称。
- These Pretzels are Making Me Thirsty?! →「这些卷饼怎么越吃越渴？！」；Pretzel Legend →「卷饼传奇」，保留卷饼主题。
- 65的原文按“从特殊敌人身边传送脱身”翻译，不误译为传送敌人；原文“100个”与规则按有效传送次数增量的细节差异不在翻译层改写。

Normal/Hard/Harder Score→普通/困难/更难分数；对应Turns→回合数。Dungeon Sprint、Pretzel Hero沿用已有模式名。秘密成就未解锁描述显示`???`是移植显示规则；原始77项均非秘密，不能为展示此功能而篡改原数据。
