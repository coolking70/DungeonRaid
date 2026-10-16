# 05 职业、种族、宿敌、难度与模式（T02）

枚举、显示文本、原文描述及字符串偏移以 enums.json 为准；[classes.json](../../data/classes.json) 保存原始20项职业 vector、初始配置、42项原生技能、种族宿敌映射。下文用 ID 交叉引用，不用描述文字反推规则。[证据：CharacterClass::Initialise @0x36524；GetMortalEnemyType @0x35f34；g_skillCooldowns]

## 职业与技能池

**所有职业新局已装备技能数均为0**。表中的“首技能”是局内升到2级时第一奖励候选的强制项，玩家仍要选择它；不是开局免费装备。Adventurer 初始职业等级1，其余0（未解锁）。[证据：InitNewGame @0x2d7a4；FoldoutMenu::Initialise @0x42794；CharacterClass::Initialise]

| ID / 职业 | 默认种族 | 默认优点 / 缺点 | 首技能 | 原始 vector（第一项有独立语义，其余按原顺序保留） |
| --- | --- | --- | --- | --- |
| 0 Adventurer | Human | NONE / NONE | 无 | 0…19；有效池另外按解锁状态生成 |
| 1 Ranger | Elf | Agile / Slim | 31 Volley | 31,2,3,4,5,7,8,9,10,12,13,14,16,18,21,22,23,24,25,29 |
| 2 Raider | Halfling | Daring / Cocky | 32 Masochism | 32,2,3,4,6,8,9,11,12,15,16,17,18,19,20,22,23,24,25,27 |
| 3 Priest | Faun | Faithful / Cautious | 33 Wish | 33,1,2,5,6,7,8,9,10,12,13,15,18,19,21,20,25,26,28,29 |
| 4 Barbarian | Orc | Strong / Reckless | 34 Berserk | 34,3,4,5,7,9,10,11,12,13,14,16,18,19,21,20,22,23,25,27 |
| 5 Mage | Changeling | Gifted / Frail | 35 Rune | 35,1,2,3,6,7,8,9,10,12,15,17,18,21,20,24,25,26,28,29 |
| 6 Rogue | Sauren | Frugal / Clumsy | 36 Greed | 36,0,2,3,4,6,8,9,10,11,12,13,14,15,17,18,22,23,24,25 |
| 7 Paladin | Dragonkin | Intimidating / Zealous | 37 Last Stand | 37,2,3,4,5,8,9,11,12,13,14,16,18,19,21,20,23,24,25,27 |
| 8 Warrior | Dwarf | Tough / Noisy | 38 Charge | 38,2,3,4,5,6,7,10,11,12,13,14,15,16,19,21,22,23,25,27 |
| 9 Assassin | Werewolf | Cunning / Sneaky | 39 Haste | 39,0,1,4,5,7,8,9,12,14,15,16,18,21,22,23,24,25,27,28 |

整表证据：Initialise @0x36524 的 case0…9，tools/extract-t02.py 逐 case 提取。非 Adventurer 对每个槽优先使用非 NONE 的替换技能，否则取基础项，再组成升序唯一 set；重复的 ID 不增加权重。Adventurer 不使用其20项 vector 限制，而遍历0…41加入 IsSkillUnlocked 为真的 ID。ID<31始终解锁；31…39 仅对应职业等级==10后对其他职业开放；40/41不可正常解锁。原职业不需要先到10级才使用自己的首技能。[证据：GetSkillPool @0x3707c；IsSkillUnlocked @0x248e8；ClassScreen::UpdateAbilities @0x37670]

## 奖杯、解锁与职业成长

奖杯**不限定特殊敌人种类，也不要求宿敌**。进入正常奖励结算的骷髅只要 `enemyType != ENEMY_NORMAL(0)`，都走同一个特殊奖励/奖杯分支；普通骷髅不推进计数。逃走、无奖励移除或巫妖变为命匣等尚未结算击杀的状态不算有效击杀。非 Easy 下推进计数；Sprint 每次以 `RandI(0,100,0)<50` 决定是否减1，其他模式直接减1；到期且有可解锁职业或当前非冒险者可升级时掉落，单局最多3个，每次掉落后间隔重新抽取20–30。该计数跨局保存，不是每次击杀独立抽奖。[证据：Game::MatchTile @0x2ac40，`tile+0xa0 == 1 && tile+0x25c != 0`，`game+0x14328 > 0`，`game+0x14da0/0x14da4`，`RandI(0x14,0x1e,0)`；AttackSkull @0x2f630；Java PREFS_TROPHY；持久化边界见01/08]

单格点按 Trophy 的 ProcessInput 分支：若当前是非 Adventurer 且职业等级<10，先 `R(0,1,5)`，非零则当前职业升级；否则从尚未解锁职业按 ID 升序组成 vector，`R(0,n−1,5)` 选一个升到1级。没有锁定职业时才回退尝试升级当前职业。若当前不具备升级资格，跳过前面的二选一抽样。不是分别完成职业描述里的挑战才解锁。奖杯掉落进度/每局上限3/Easy禁用见01。[证据：ProcessInput @0x330c0 Trophy分支；CharacterClass::LevelUp @0x3600c，ClampI(old+1,1,10)]

| 职业等级 | 开放内容 | 证据 |
| --- | --- | --- |
| >0 | 默认 perk/flaw 第0槽、职业可选 | IsPerkUnlocked @0x35d78 |
| 3、7、9 | 分别开放第1、2、3对 perk/flaw 槽 | 同上 |
| 每个偶数级 | 可替换技能数 `floor(level/2)*2`，最多10 | GetReplacementSkillsAllowed @0x35dc0 |
| ≥5 | 可改种族，并解锁默认种族相关成就 | Validate @0x36390；UnlockAchievement @0x35fb0 |
| =10 | 首技能对其他职业开放；精通成就 | IsSkillUnlocked；UnlockAchievement |

HavePerk/HaveFlaw 查四槽“是否存在”，NONE=255 返回 false，同名不叠加。Validate 去重、清掉没有同槽 flaw 的 perk、限制替换数量；非 Adventurer 未到5级时强制默认种族。Adventurer 的 perk/flaw 统计数返回0。每局结束增加该职业 games 和 AttackSkull 累计击杀；Classic 的 Normal/Hard/Harder 分别更新最高分，Easy/挑战不写这三个最高分字段。[证据：HavePerk @0x35dec；HaveFlaw @0x35e40；Validate @0x36390；GetPerkCount @0x35f4c；GetFlawCount @0x35f74；CheckEndGame @0x2f960；CharacterClass 对应统计字段+58…68]

## 十个优点与十个缺点

下表是代码效果。所有名称和描述的固定宽度表偏移随 enums/classes 数据给出。

| ID | Perk 效果 | Flaw 效果 | 代码来源 |
| --- | --- | --- | --- |
| 0 | Unexpected：turn<5 跳过普通敌攻 | Confused：turn<5 GetDamageType 返回 BLOCKED，传入直接链伤害0 | ProcessInput @0x330c0；GetDamageType @0x644bc；不是屏蔽所有毒/火/特殊能力 |
| 1 | Gifted：新普通药水 R(1,100,1)≤5 变法力 | Frail：基础最大/当前HP−10 | RandomiseTile @0x2d584；InitNewGame @0x2d7a4 |
| 2 | Daring：某类型本链收集数≥10，额外 token 阈值100 | Cocky：实际链节点≤3的非战斗收集无奖，仍可攻击击杀 | MatchTile @0x2ac40；MatchTiles @0x31bcc |
| 3 | Cunning：第四个新装备技能CD−1 | Sneaky：普通敌人 HP+1；特殊生成分支不加 | SetSkill @0x2be04；GenerateStats @0x63098 |
| 4 | Strong：基础伤害+1 | Reckless：基础盾额外token概率−10个百分点 | InitNewGame |
| 5 | Faithful：再生升级步长2，普通为1 | Cautious：初始穿甲阈值30，普通50 | GetStatUpgrade @0x51888；UpdateStats @0x26c94 |
| 6 | Agile：新普通剑 R(1,100,1)≤5 变箭 | Slim：初始身体护甲1，普通2 | RandomiseTile；GenerateStats(Item) @0x50ee4 |
| 7 | Frugal：基础金币额外token概率+10个百分点 | Clumsy：新盾 R(1,100,1)≤3 破损 | InitNewGame；RandomiseTile |
| 8 | Intimidating：抽中宿敌时有额外半数拒绝判定，详见01晋升重抽顺序 | Zealous：普通自然晋升计时少1，初始49代替50 | Tile::Promote @0x64e3c；InitNewGame |
| 9 | Tough：基础最大/当前HP+10 | Noisy：特殊敌人HP倍率另×1.05后按原顺序取整 | InitNewGame；GenerateStats(Tile) @0x63098 |

## 种族能力与宿敌

种族 ID 与 RacialBonusType 一一对应0…9；宿敌表来自 Ghidra @0x6b298 的十个 int。宿敌是按**当前种族**查表，不固定在职业名上。以下均以02中的分支顺序为准，尤其“在场”查询不等同额外添加一个未消除过滤。[证据：GetMortalEnemyType @0x35f34；各调用点]

| 种族 / 能力 | 实际能力 | 宿敌 / 附加效果 | 证据 |
| --- | --- | --- | --- |
| Human / NONE | 无 | NORMAL哨兵，无特殊弱点 | GetMortalEnemyType；各 race 条件 |
| Elf / SLOW_POISON | 首毒槽>0且攻击>1，GetAttack右移1 | Poisonous：在场时药水不解玩家毒 | Tile::GetAttack @0x62934；AddResource @0x32210 |
| Dwarf / UPPERCUT | 链前后同x且从下向上穿过敌人，D+W | Chaotic：其他直接链伤害被挡；Armoured 等更早分支仍有其优先级 | GetDamageType @0x644bc；MatchTiles @0x31bcc |
| Sauren / SEARCH | 商店卷轴概率50%代替25% | Thief：偷取的金币点数×其GetAttack直接扣HP；不要一律固定2×攻击 | FoldoutMenu::Initialise @0x42794；StealGold @0x348e8/@0x34a68 |
| Faun / HEALING | 升级时 HP<25%上限才设为 trunc(25%上限)，不是另加25% | Assassin：非底行时消除其下格（特殊敌人除外），经重力下移 | Healing @0x28c0c；StabAttack @0x2f250 |
| Orc / STUN | 直接攻击未死目标 R(1,100,5)≤10 冻结 | Corrosive：生成时清玩家当前护甲 | AttackSkull @0x2f630；RandomiseTile |
| Halfling / GUTS | 同次链 AttackSkull 成功击杀≥15，身体装备11属性 IncreaseStat(+1)并重算 | Invisible：它在场时新敌防御加倍 | ProcessInput @0x330c0；GenerateStats(Tile) |
| Werewolf / CRIPPLE | 回合末未消除普通骷髅 HP<防御则 MatchTile(5) | Vampire：回复可超过原最大HP，同时提高最大HP | ProcessCripples @0x2f558；ProcessVampires @0x2d18c；AddHealth @0x63a5c |
| Dragonkin / FIRE_BREATH | 手动技能后随机普通骷髅着火，伤害取基础 c180（不含c184装备附加），没有候选则无效果 | Freezing：在场时链中基础 B 部分减半截断 | Interface::ProcessInput @0x49738；FireBreath @0x29cfc；ProcessTileSelection |
| Changeling / SHAPESHIFT | 收集特殊敌人时随机一个已装备技能充满，可抽到已满槽 | Unstable：传送后排除剑而非排除骷髅 | MatchTile @0x2ac40；Shapeshift @0x24f78；TeleportEnemy @0x29ad8 |

## 难度与两种挑战

Difficulty=Easy0、Normal1、Hard2、Harder3，GameMode 仅 Sprint0、Pretzel1；Classic 由 challenge=false 表示，不能把 Classic=0 与 Sprint=0 混成一个枚举。ScoreType 将四种经典难度放0…3、两种挑战放4…5。挑战与所选 difficulty 是独立字段，StartChallenge 只置 challenge 并调用 InitNewGame，不在这里强制修改 difficulty。[证据：wrapper 枚举；NewGame @0x2de68；StartChallenge @0x2de10；InitNewGame @0x2d7a4]

敌人基础生成/倍率见01。其他差异：Easy 不发奖杯，QueueAchievement 通常直接抑制（67 MissionAccomplished 例外）；Classic 三个非Easy最高分独立统计。Harder 还参与 TragicHero/PieceOfCake 的成就条件，不能据此推断额外隐藏战斗难度。[证据：MatchTile @0x2ac40；QueueAchievement @0x281cc；CheckEndGame @0x2f960；AddResource @0x32210]

Sprint：晋升初始计时200；资源XP/金币/UP每token及其小数收益×2，治疗/修甲不翻倍；新技能直接level5、CD减4，菜单不升级已有技能且排除Trap；削弱属性不提供；第100回合尾部才判胜，早先死亡仍失败；得分见06。Pretzel：基础HP100且移除HP成长/饰品初始HP，菜单排除Teleport/Treasure Chamber，生成普通敌人分支见01；交叉计分与平均/最大/总有分链数见06。[证据：InitNewGame；Skill::Initialise @0x60984；FoldoutMenu::Initialise；ItemUpgrade::GetRandomStat @0x51db8；EndOfTurn @0x3289c；GetScore @0x2f868]

## 描述与实现的差异、未决问题

| 文本容易引起的理解 | 实际规则 | 证据 |
| --- | --- | --- |
| 职业介绍是逐项解锁挑战 | Trophy 随机解锁/升级；介绍仅文本 | ProcessInput；classes.json unlockText |
| 首技能开局已装备 | level2候选，仍要选择 | InitNewGame；FoldoutMenu::Initialise |
| Shatter 把攻防都降到1 | 普通敌防0、攻击上限1 | ShatterDefence @0x28554；g_skillDescriptions |
| Sneaky “all enemies +1HP” | 普通敌分支加1 | GenerateStats(Tile) |
| Daring “tracing 10+ tiles” | 同类型收集计数≥10，非所有混合链长度 | MatchTile |
| Cocky 三格“nothing” | 非战斗收集无奖，击杀仍发奖 | MatchTiles |
| Fire Breath 对“random enemy”、伤害“base” | 仅普通骷髅候选；只取c180；商店卷轴不经手动输入钩子 | FireBreath；Interface；FoldoutMenu::Process |
| Faithful 双倍再生 | 改的是新升级/降级步长；不在每次回合治疗再乘2 | GetStatUpgrade/GetStatDowngrade；EndOfTurn |

静态配置/解锁条件已闭合；暂未穷举用户更换种族、替换技能、四对特性与所有敌人能力的组合运行轨迹（沿用 T01 C3/C4）。独立难度字段的 UI 选项可达组合尚未逐一操作原版，不把“StartChallenge不改难度”扩大成所有组合在 UI 都能选。

## U07：玩家可见的解锁说明与各级奖励

- 原版职业页提示「非简单难度击杀特殊敌人，有机会解锁职业」；种族页说明当前职业到5级才能更换种族，其默认种族也向其他职业开放。[证据：strings.txt 文件偏移 `0x5bccc`、`0x5c11c`；ClassScreen::SelectTab @0x39ba8；Game::IsRaceUnlocked @0x248a0]
- 原版职业标签内的等级按钮可逐级查看奖励。`ClassScreen::Process @0x3a598` 遍历10个等级图标，调用 `GetLevelDescription(level)` 后 `ShowText`。冒险者点击其余等级时显示不成长说明；不是所有职业都存在十级奖励。[证据：Process 的 case0；strings.txt `0x5bb0c`]
- `CharacterClass::GetLevelDescription @0x3602c`：1级开放本职业默认优点/缺点供其他职业使用；2/4/6/8级分别允许替换2/4/6/8个技能；3/7/9级各增一对优缺点槽；5级开放换种族并共享默认种族；10级共享首技能且替换总数达到10。冒险者1级分支使用 perk/flaw ID0 的原文描述。职业等级与单局经验等级分开；首技能仍在单局升至2级时作为候选提供。[证据：GetLevelDescription 各 case；FoldoutMenu::Initialise @0x42794]
- 重构版 U07 在职业配置页增加「解锁说明」「各级奖励」，锁定职业也能只读预览；种族图标可查看对应职业及当前等级进度。使用默认种族映射，不能根据玩家已编辑的种族反推解锁来源。UI 阅读不改变档案、随机种子或配置；原有种族编辑门槛保留。[实现：ui/progression-help.ts、ui/front-screens.ts；验证：test/ui-u07.test.ts、tools/u07-browser.mjs]

本次没有新增规则未决项；上述只读预览及布局属于移植版界面设计，不声称是原版矩形复刻。
