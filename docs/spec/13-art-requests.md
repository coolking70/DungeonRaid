# 13 原创美术需求（U01）

本清单供A02/A03；仅文字描述。原图只曾用于辨认UV内容，没有复制、裁切或作为生成输入。所有“画什么”均为原创设计建议，**不声称是原版像素构图**。原生尺寸/槽位来自对应函数和JSON source；复合面板尺寸未决时不得先画死尺寸。

## 制作约束与交付关系

遵守P3-PLAN用户决定：用imagegen原创重绘，沿用A01已建立的视觉风格；所有标题和按钮字改为字体渲染，默认中文、可切换英文；OFL字体由L01核验并子集化。本卡不生成图片。A02应先交付无字图形、透明边框及状态参数；A03交付基础图与400槽映射。

JSON中的UV是**原版证据坐标**，不是要求复刻原图集布局。新图集可重新打包，但保留稳定id、逻辑尺寸和独立锚点。menus原图512坐标已乘2统一到1024；尺寸仍是逻辑像素，不能跟着翻倍。按钮按下/禁用优先用颜色与alpha实现；可复用一张底图，不必每个状态都生成图片。九宫格适用性是重绘实施建议，并非声称原生用了CSS九宫格。

## 职业、种族、优缺点、技能与属性（逐槽）

职业/种族各10个，基础51×51；优点/缺点各10个，基础24×24；42个原生技能基础49×49，另8个属性升级槽。`SkillType`包装枚举的COUNT=40是哨兵，原生另有Shock/Awe，不能把COUNT画成技能。原版部分属性/技能复用同UV，A02可复用图或按语义分图；逻辑id仍分开。

尺寸证据：CharacterClass::GetIconCoords @0x35c00（51、70、24、172）及Class/Race/Perk/Flaw取图函数；QuadStrip::UpdateSize @0x5bbc4；Skill::GetIconUVs @0x600cc / Upgrade::GetIconUVs @0x67440（49、50.03、1024、512）；属性位置来自g_statSkillIconPositions，逐条地址见artSlots。

所有下列图标：九宫格**不适用**；普通/选中/禁用或未解锁三种表现，使用外框、高亮和灰化遮罩（不把状态文字烘焙进去）。职业/种族的头像与技能图形保持不同外轮廓。

| id / 英文名 | 逻辑尺寸 | 原创画面描述 |
|---|---|---|
| `ClassType.0` Adventurer | 51×51 | 旅行披风与背包，露出朴素剑柄 |
| `ClassType.1` Ranger | 51×51 | 兜帽弓手、弓与叶形饰件 |
| `ClassType.2` Raider | 51×51 | 持斧的突袭者，破损肩甲 |
| `ClassType.3` Priest | 51×51 | 持圣徽的长袍祭司 |
| `ClassType.4` Barbarian | 51×51 | 兽皮、宽刃斧与强壮肩臂 |
| `ClassType.5` Mage | 51×51 | 星纹尖帽、法杖与发光宝石 |
| `ClassType.6` Rogue | 51×51 | 暗色兜帽与小匕首 |
| `ClassType.7` Paladin | 51×51 | 重甲、圣徽与塔盾 |
| `ClassType.8` Warrior | 51×51 | 坚固头盔、长剑与肩甲 |
| `ClassType.9` Assassin | 51×51 | 遮面头巾与一对窄刃 |
| `RaceType.0` Human | 51×51 | 普通人类头像，清晰五官 |
| `RaceType.1` Elf | 51×51 | 尖耳、细长眉眼与叶形配饰 |
| `RaceType.2` Dwarf | 51×51 | 宽脸浓须、矮人护额 |
| `RaceType.3` Sauren | 51×51 | 蜥蜴鳞片、短吻与眼脊 |
| `RaceType.4` Faun | 51×51 | 羊角、毛耳与自然饰件 |
| `RaceType.5` Orc | 51×51 | 獠牙与宽下颌 |
| `RaceType.6` Halfling | 51×51 | 圆脸卷发与小巧耳朵 |
| `RaceType.7` Werewolf | 51×51 | 狼首、竖耳与浓毛 |
| `RaceType.8` Dragonkin | 51×51 | 龙鳞、角冠与长吻 |
| `RaceType.9` Changeling | 51×51 | 不对称脸部、变换轮廓与异色眼 |
| `PerkType.0` Unexpected | 24×24 | 突现的星芒 |
| `PerkType.1` Gifted | 24×24 | 托起光点的手掌 |
| `PerkType.2` Daring | 24×24 | 跃过裂隙的脚步 |
| `PerkType.3` Cunning | 24×24 | 眼睛与弯曲路线 |
| `PerkType.4` Strong | 24×24 | 紧握的拳头 |
| `PerkType.5` Faithful | 24×24 | 圣徽与稳定光环 |
| `PerkType.6` Agile | 24×24 | 轻盈羽翼与脚踝 |
| `PerkType.7` Frugal | 24×24 | 收紧的钱袋 |
| `PerkType.8` Intimidating | 24×24 | 锐利目光与外扩尖线 |
| `PerkType.9` Tough | 24×24 | 厚实岩块与盾面 |
| `FlawType.0` Confused | 24×24 | 交错问号与旋涡 |
| `FlawType.1` Frail | 24×24 | 裂开的细骨 |
| `FlawType.2` Cocky | 24×24 | 高扬下巴与虚浮光点 |
| `FlawType.3` Sneaky | 24×24 | 躲藏的眼睛与阴影 |
| `FlawType.4` Reckless | 24×24 | 冲向尖刺的脚步 |
| `FlawType.5` Cautious | 24×24 | 停在边缘的脚印 |
| `FlawType.6` Slim | 24×24 | 纤细腰带与窄身轮廓 |
| `FlawType.7` Clumsy | 24×24 | 失衡的脚印 |
| `FlawType.8` Zealous | 24×24 | 燃烧圣徽 |
| `FlawType.9` Noisy | 24×24 | 铃铛与声波 |
| `SkillType.0` Steal | 49×49 | 手从钱袋取出硬币 |
| `SkillType.1` Freeze | 49×49 | 冰晶包住目标 |
| `SkillType.2` Heal | 49×49 | 红色药水与恢复光点 |
| `SkillType.3` Repair | 49×49 | 锤子修补盾面 |
| `SkillType.4` Counterattack | 49×49 | 盾后反击的剑 |
| `SkillType.5` Shatter | 49×49 | 碎裂冰晶 |
| `SkillType.6` Golden Touch | 49×49 | 手指将物体化为金色 |
| `SkillType.7` Teleport | 49×49 | 旋涡与消失脚印 |
| `SkillType.8` Explosive Potion | 49×49 | 冒火花的药水瓶 |
| `SkillType.9` Skill Elixir | 49×49 | 带星芒的技能药剂 |
| `SkillType.10` Enchant | 49×49 | 符文环绕装备 |
| `SkillType.11` Slash | 49×49 | 弧形斩痕 |
| `SkillType.12` Treasure | 49×49 | 打开的宝箱 |
| `SkillType.13` Scavenge | 49×49 | 从残骸拾取物资 |
| `SkillType.14` Disarm | 49×49 | 掉落的武器 |
| `SkillType.15` Dazzle | 49×49 | 放射强光与眯眼 |
| `SkillType.16` Boost Damage | 49×49 | 剑与上升箭头 |
| `SkillType.17` Boost Gold | 49×49 | 金币与上升箭头 |
| `SkillType.18` Boost Health | 49×49 | 红心与上升箭头 |
| `SkillType.19` Boost Armour | 49×49 | 盾牌与上升箭头 |
| `SkillType.20` Exorcise | 49×49 | 圣光驱离幽影 |
| `SkillType.21` Banish | 49×49 | 目标被推入传送门 |
| `SkillType.22` Trap | 49×49 | 张开的夹子 |
| `SkillType.23` Big Game Hunter | 49×49 | 瞄准大型兽首 |
| `SkillType.24` Treasure Chamber | 49×49 | 成堆宝箱与门洞 |
| `SkillType.25` Magic Sword | 49×49 | 带魔法光的剑 |
| `SkillType.26` Earthquake | 49×49 | 裂开的地面 |
| `SkillType.27` Explosive Armour | 49×49 | 带爆裂光芒的盾甲 |
| `SkillType.28` Fireball | 49×49 | 燃烧火球 |
| `SkillType.29` Mana Potion | 49×49 | 蓝色法力药瓶 |
| `SkillType.30` Hack | 49×49 | 连续短斩痕 |
| `SkillType.31` Volley | 49×49 | 成排箭矢 |
| `SkillType.32` Masochism | 49×49 | 心形与刺环 |
| `SkillType.33` Wish | 49×49 | 许愿星与光点 |
| `SkillType.34` Berserk | 49×49 | 燃烧的战士双眼 |
| `SkillType.35` Rune | 49×49 | 独立刻纹石片 |
| `SkillType.36` Greed | 49×49 | 抓住金币的双手 |
| `SkillType.37` Last Stand | 49×49 | 残破盾牌后站立的人 |
| `SkillType.38` Charge | 49×49 | 前冲的箭形人影 |
| `SkillType.39` Haste | 49×49 | 沙漏与迅捷脚印 |
| `SkillType.40` Shock | 49×49 | 闪电与震荡圈 |
| `SkillType.41` Awe | 49×49 | 外扩光环与惊叹轮廓 |
| `StatIcon.0` STAT_STR | 49×49 | 拳头代表力量 |
| `StatIcon.1` STAT_DEX | 49×49 | 敏捷脚印代表灵巧 |
| `StatIcon.2` STAT_VIT | 49×49 | 心脏代表体质 |
| `StatIcon.3` STAT_LUK | 49×49 | 四叶形幸运符 |
| `StatIcon.4` STAT_DMG | 49×49 | 剑刃代表基础伤害 |
| `StatIcon.5` STAT_DEF | 49×49 | 盾牌代表护甲 |
| `StatIcon.6` STAT_HP | 49×49 | 血滴代表生命上限 |
| `StatIcon.7` STAT_CHA | 49×49 | 四类资源围绕幸运星（统计加成） |

## 各屏幕、HUD、按钮与面板（逐元素）

下列id与ui-layout.elements一一对应；同一按钮底图可复用。文字行仅要求排版/容器，无须额外画字。未知尺寸保留“待解”；动态项按JSON rectFormula渲染，不将null视作0×0。表中固定尺寸为JSON浮点值便于制作的显示舍入，精确值、函数地址与原始常量以JSON为准。

| id | 逻辑尺寸 | 用途/画什么 | 状态 | 九宫格建议 |
|---|---|---|---|---|
| `main.background` | 320.000×480.000 | 原创地下城背景，留出左侧菜单和底部按钮可读区；标题另用字体 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `main.loading` | 134.000×28.000 | 加载提示文字用字体，不生成图字 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `main.continue` | 131.000×39.000 | 可复用的无字按钮底板；动作 ContinueGame | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.new` | 144.000×39.000 | 可复用的无字按钮底板；动作 NewGame or confirmation | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.challenge` | 142.000×39.000 | 可复用的无字按钮底板；动作 StartChallenge or confirmation | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.tutorial` | 128.000×40.000 | 可复用的无字按钮底板；动作 StartTutorial or confirmation | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.scores` | 97.000×41.000 | 可复用的无字按钮底板；动作 ShowScores | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.online` | 144.000×39.000 | 可复用的无字按钮底板；动作 legacy-service-request | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.bonus` | 166.000×40.000 | 可复用的无字按钮底板；动作 ShowBonusRequest | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.confirmation` | 246.000×156.000 | 无字确认面板；问题、Yes/No改为字体 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `main.yes` | 49.000×22.000 | 可复用的无字按钮底板；动作 confirm pending new/tutorial/challenge | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.no` | 40.000×18.000 | 可复用的无字按钮底板；动作 dismiss confirmation | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `main.sound` | 139.000×40.000；关闭变体147×40 | 声音开关符号/无字底板；英文原文由字体显示，原生旋转与命中关系见JSON | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `board` | 318.000×318.000 | 复用A01棋盘格，连线和调暗由代码绘制 | 正常、选中、不可匹配、预览死亡 | 不适用 |
| `hud.bottom` | 320.000×76.000 | 金币、护甲、经验、强化、药瓶的无字框架 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `hud.top` | 320.000×73.000 | 技能栏与右侧菜单的无字框架 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `hud.xp` | 100.000×10.000 | 可裁切的资源填充纹理；经验能量条 | 空、部分、满、预览影子 | 边框可用，填充用裁切 |
| `hud.upgrade` | 100.000×10.000 | 可裁切的资源填充纹理；强化能量条 | 空、部分、满、预览影子 | 边框可用，填充用裁切 |
| `hud.health` | 71.000×64.000 | 可裁切的资源填充纹理；药瓶液面；液体与瓶身玻璃/轮廓分层，瓶身在hud.bottom中定位 | 空、部分、满、预览影子 | 边框可用，填充用裁切 |
| `hud.health-value` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `hud.gold-full` | 80.000×61.000 | 可裁切的资源填充纹理；规则堆叠金币列 | 空、部分、满、预览影子 | 边框可用，填充用裁切 |
| `hud.gold-partial` | 动态，见rectFormula | 可裁切的资源填充纹理；金币余数列 | 空、部分、满、预览影子 | 边框可用，填充用裁切 |
| `hud.skill.0` | 53.000×53.000 | 53×53技能槽框与充能裁切层；中央复用49×49技能图标 | 空槽、充能中、就绪、选中 | 槽框可用 |
| `hud.skill.1` | 53.000×53.000 | 53×53技能槽框与充能裁切层；中央复用49×49技能图标 | 空槽、充能中、就绪、选中 | 槽框可用 |
| `hud.skill.2` | 53.000×53.000 | 53×53技能槽框与充能裁切层；中央复用49×49技能图标 | 空槽、充能中、就绪、选中 | 槽框可用 |
| `hud.skill.3` | 53.000×53.000 | 53×53技能槽框与充能裁切层；中央复用49×49技能图标 | 空槽、充能中、就绪、选中 | 槽框可用 |
| `hud.stats` | 72.000×26.000 | 可复用的无字按钮底板；动作 show StatsMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `hud.menu` | 72.000×26.000 | 可复用的无字按钮底板；动作 show GameMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `name.name` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `name.keyboard` | 待解 | 由字体绘制文本/数字；键帽复用无字按钮底板 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `name.difficulty` | 待解 | 可复用的无字按钮底板；动作 cycle difficulty | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `name.class` | 待解 | 可复用的无字按钮底板；动作 open ClassScreen | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `name.mode` | 待解 | 可复用的无字按钮底板；动作 open ModeScreen | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `name.start` | 待解 | 可复用的无字按钮底板；动作 begin run | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `name.return` | 待解 | 可复用的无字按钮底板；动作 return MainMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `mode.sprint` | 待解 | 可复用的无字按钮底板；动作 select Dungeon Sprint | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `mode.pretzel` | 待解 | 可复用的无字按钮底板；动作 select Pretzel Hero | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `mode.description` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `mode.return` | 待解 | 可复用的无字按钮底板；动作 close ModeScreen | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `class.tab.class` | 待解 | 可复用的无字按钮底板；动作 select tab 0 | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `class.tab.race` | 待解 | 可复用的无字按钮底板；动作 select tab 1 | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `class.tab.perks` | 待解 | 可复用的无字按钮底板；动作 select tab 2 | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `class.tab.skills` | 待解 | 可复用的无字按钮底板；动作 select tab 3 | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `class.class-grid` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.race-grid` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.perks-slots` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.perks-pool` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.skills-equipped` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.skills-pool` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `class.description` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `class.return` | 待解 | 可复用的无字按钮底板；动作 validate and return NameScreen | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `scores.rows` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `scores.page-title` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `scores.previous` | 待解 | 可复用的无字按钮底板；动作 previous score type | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `scores.next` | 待解 | 可复用的无字按钮底板；动作 next score type | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `scores.return` | 待解 | 可复用的无字按钮底板；动作 MainMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `game-over.veil` | 待解 | 纯色遮罩，由代码绘制 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `game-over.summary` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `game-over.items` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `game-over.skills` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `game-over.traits` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `game-over.score` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `game-over.return` | 待解 | 可复用的无字按钮底板；动作 MainMenu / Scores per native branch | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `stats.equipment` | 待解 | 复用上述图标或装备槽图；为每格提供选中框与锁定遮罩 | 普通、选中、锁定、拖动 | 格框可用，图标不拉伸 |
| `stats.stats` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `stats.return` | 待解 | 可复用的无字按钮底板；动作 close StatsMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `intro.story` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `unlock.message` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `unlock.reward` | 待解 | 复用解锁目标图标 | 正常、按层级淡入淡出 | 面板边框可用，背景插画不拉伸 |
| `unlock.confirm` | 待解 | 可复用的无字按钮底板；动作 acknowledge unlock | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `tooltip.panel` | 待解 | 无字深色/羊皮纸底板、边框和小尖角；文本动态布局 | 正常、淡入、淡出 | 主体适用，尖角独立 |
| `tooltip.title` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `tooltip.body` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `help.panel` | 动态，见rectFormula | 无字深色/羊皮纸底板、边框和小尖角；文本动态布局 | 正常、淡入、淡出 | 主体适用，尖角独立 |
| `help.text` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `foldout.option.0` | 53.000×53.000 | 可复用的无字按钮底板；动作 SelectMenuItem(0) | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `foldout.option.1` | 53.000×53.000 | 可复用的无字按钮底板；动作 SelectMenuItem(1) | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `foldout.option.2` | 53.000×53.000 | 可复用的无字按钮底板；动作 SelectMenuItem(2) | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `foldout.option.3` | 53.000×53.000 | 可复用的无字按钮底板；动作 SelectMenuItem(3) | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `foldout.heading` | 待解 | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `foldout.confirm` | 待解 | 可复用的无字按钮底板；动作 ConfirmMenu after two level choices or one shop/upgrade choice | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.resume` | 89.000×26.000 | 可复用的无字按钮底板；动作 resume | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.toggle sound` | 89.000×26.000 | 可复用的无字按钮底板；动作 toggle sound | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.toggle help` | 89.000×26.000 | 可复用的无字按钮底板；动作 toggle help | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.toggle high-framerate` | 89.000×26.000 | 可复用的无字按钮底板；动作 toggle high-framerate | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.toggle clock` | 89.000×26.000 | 可复用的无字按钮底板；动作 toggle clock | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.toggle attack-dimming` | 89.000×26.000 | 可复用的无字按钮底板；动作 toggle attack-dimming | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `pause.MainMenu` | 89.000×26.000 | 可复用的无字按钮底板；动作 MainMenu | 普通、按下、禁用；切换项另有开/关 | 底板适用，图标不拉伸 |
| `hud.armour` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `hud.poison` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `hud.weapon` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |
| `hud.enemy-attack` | 动态，见rectFormula | 由字体绘制文本/数字；不生成烘焙文字图片 | 正常、强调；滚动/换行由代码控制 | 仅背景容器可用 |

共享效果补件：flare径向亮斑、可着色粒子四边形、护盾左右两片、死亡叉、毒/燃烧/冰冻状态覆盖、帮助尖角、翻页箭头、选择框。flare与碎片用11-animation的世界单位缩放，粒子从对应原创tile派生；未知原生UV/固有尺寸不编造。护盾两片位置与运动已恢复，静态切片UV见Game::Start @0x260ac；状态覆盖周期仍待解。上述清单不新增规则或敌人种类。

## 装备400槽与约80张基础图

每格基础49×49：Item::Initialise @0x4c0ec / Deserialise1 @0x4da08用`SetIcon(index%20,index/20,1024,0)`；Upgrade::GetIconUVs @0x67440给出UV起点`(1+50.03*column,1+50.03*row)`、跨度49。新图集可按自己的间隔排布。

`nameMappings`区间为左闭右开，覆盖0–399恰好一次。图标index先确定所属名称池，再从该池随机选名；**名称不是槽位的固定标签**。Item::GenerateName @0x4c35c使用`RandI(0,poolSize-1,2)`，再以`"%s  %s"`拼前缀和主体；无旧装备时前缀Novice，否则按旧prefix进阶。名称池可小于图标槽数，不能按名称列表长度推图标数量。

下表“基础图数×5”是满足用户约80基础图的生产分配建议，并非原版分层规则；变体可改材质、轮廓细节与配色，但须在49px下可区分，勿只靠色相。

| 名称池 / 原创内容 | 槽区间 | 槽数 | 主体名称数 | 建议基础图×变体 |
|---|---|---|---|---|
| `m_namesSword1`：单手直剑，护手与刃形变化 | [0,20) | 20 | 15 | 4×5 |
| `m_namesSword2`：第二组剑，宽刃/曲刃/细剑造型 | [20,40) | 20 | 12 | 4×5 |
| `m_namesMace`：钉头锤，球头与棱头 | [40,50) | 10 | 13 | 2×5 |
| `m_namesHammer`：战锤，方头与双面头 | [50,60) | 10 | 12 | 2×5 |
| `m_namesAxe`：战斧，单刃与双刃 | [60,80) | 20 | 15 | 4×5 |
| `m_namesHelm`：头盔，面罩、护鼻与头冠 | [80,160) | 80 | 17 | 16×5 |
| `m_namesShield`：盾牌，圆盾、鸢盾与塔盾 | [160,240) | 80 | 16 | 16×5 |
| `m_namesArmour`：护甲，皮甲、链甲与板甲 | [240,320) | 80 | 17 | 16×5 |
| `m_namesAmulet`：护身符，链坠与嵌石 | [320,340) | 20 | 14 | 4×5 |
| `m_namesRing`：戒指，戒圈与戒面 | [340,360) | 20 | 11 | 4×5 |
| `m_namesCharm`：护符，小型挂件与袋饰 | [360,370) | 10 | 14 | 2×5 |
| `m_namesRune`：符石，刻纹石片 | [370,380) | 10 | 16 | 2×5 |
| `m_namesPotion`：药瓶，瓶形、塞子与液体 | [380,400) | 20 | 16 | 4×5 |

合计400槽、80基础图、每基础5个变体（含基础本身）。类别证据：Item::InitialiseNames @0x4dc24；末段Potion范围由Thumb @0x3f1a2–0x3f1b6确认380–400；详见data/items.json.nameMappingEvidence。prefix共148条，不对应148张独立图。

## 验收与未决

A02逐id检查透明边缘、目标逻辑尺寸、状态可区分、文字独立、九宫格拐角不变形；A03检查0–399全部非空、类别范围匹配、变体可区分。生成记录只传原创文字和A01原创参考，不能输入reverse图片。字体与文字完整性由L01按同一id清单验收。

仍需补取的布局主要为Name/Class/Score/GameOver/Unlock的复合容器和部分HUD文字；见10-ui-screens的未决问题。可先制作已知尺寸图标和通用无字底板，未知尺寸面板不进入最终切图验收。成就服务端名称/徽章不在APK，不能把OpenFeint数字id直接包装成完成的美术规格。
