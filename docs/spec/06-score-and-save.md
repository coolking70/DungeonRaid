# 06 计分、成就与存档（T02）

所有地址沿用00。以下布局描述原版，不要求新实现二进制兼容；不能把原版的窄字段/遗漏状态当作新存档的设计目标。

## 计分与排行榜

令 X/G/U 为累计已跨条数值加当前条余数（包含消耗后当前金币状态），t 为回合数，L 为当前已装备技能等级之和：[证据：GetScore @0x2f868]

| 模式 | 得分 |
| --- | --- |
| Classic | X+G+U+t+100L |
| Sprint 未胜利 | trunc(X/4)+trunc(G/4)+trunc(U/4) |
| Sprint 胜利 | 上式×2；胜利标志15e71，只在通过第100回合末尾后设置 |
| Pretzel | 累计交叉得分15e2c；不加资源、回合、技能等级 |

Sprint 必须分别除4再相加，例如 X=3,G=3,U=3 得0而非2。Classic 移除 Wish 后该技能不再贡献等级分。[证据：GetScore；RemoveSkill @0x24eec；EndOfTurn @0x3289c]

Pretzel 对链的每条对角线边取 `key=min(x1,x2)+6*min(y1,y2)`，第一次见 key 加入 set，再次见相同 key 令 k++；水平/竖直边不计。预览 ProcessPretzels 写15e30，MatchTiles 结算15e2c。不是通用线段几何交点计数，忽略格也仍在链节点遍历中。[证据：ProcessPretzels @0x2bcd8；MatchTiles @0x31bcc]

| k | 本链得分 |
| --- | --- |
| 0…4 | k |
| 5…9 | 2k |
| 10…14 | 3k |
| ≥15 | 100 |

仅有分链更新统计：maxCross=max(old,k)，scoringChains++，avgTimes10 首次为10k，其后 `trunc((oldAvgTimes10*oldCount+10k)/(oldCount+1))`。这在每次更新都截断，不能改成最后才对精确均值取整。[证据：MatchTiles @0x31bcc，15e60/15e64/15e68]

ScoreType 0…3 为 Easy/Normal/Hard/Harder；4 Sprint、5 Pretzel，6 为 COUNT。ScorePage 是 wrapper 类而非枚举：ScoreScreen 用当前页−1+缓存页索引从六个类别取数据，三个显示页缓存不产生新计分类型。Classic/Sprint 展示 Turn/XP/GP/UP/Score；Sprint 入榜资源各除4；Pretzel 用 Avg/Max/Total 替换 XP/GP/UP，数值为 avgTimes10/maxCross/scoringChains。[证据：ScoreType.java；ScoreScreen::InitialisePage @0x5d0e0；CheckEndGame @0x2f960；AddScore(GameMode) @0x5ce88，disasm @0x4ce9a 的 mode+4]

每类保存最多10条；分数降序，同分新记录排在已有同分之后。原 AddScore 在已满且新分最低时仍覆写第10条，不是拒绝入榜。保存最后插入索引供高亮，不是额外排名成绩。职业三个最高分是独立统计，不与此6类列表混用。[证据：ScoreScreen::AddScore @0x5cc5c；CharacterClass 统计见05]

## 字节原语与局内存档 FF 03

`u8` 为一个原始字节；ReadChar 无符号0…255，FF 由具体字段转换为 NONE/−1。`i32` 四字节小端二补码；RNG seed 用相同四字节保存，语义为 uint32。没有对齐填充。字符串按字节写，最多17字节，遇 NUL 将 NUL 一并写入后停止；满17字节可能没有终止零，不是17个Unicode字符。[证据：GameState::WriteChar @0x47378、WriteInteger @0x4738c、ReadChar @0x473bc、ReadInteger；SerialiseState @0x265f4]

以下按严格写入顺序；变量长结构之后的字段无固定绝对偏移。

| 顺序 | 宽度 / 数量 | 内容 |
| --- | --- | --- |
| 1 | u8,u8 | FF，版本03 |
| 2 | u8 | FF=Classic；0=Sprint；1=Pretzel |
| 3 | i32,i32,u8,u8 | Pretzel累计分、计分链数、平均交叉数×10、最大交叉数；即使非Pretzel也写 |
| 4 | u8 | 当前职业ID |
| 5 | 26字节 | CharacterClass::SerialiseGameState，见下 |
| 6 | u8 | 本局已出奖杯数14da4 |
| 7 | 18字节 | 36格类型，行优先 y外x内，相邻两格打包：第一格高4位，第二格低4位 |
| 8 | 36个变长 Tile | 同样行优先，见下 |
| 9 | i32,i32 | turn、整局 AttackSkull 成功击杀数15e14 |
| 10 | 7×u8 | 基础bonus概率按金币/药水/XP/盾；玩家持续毒；保留0；自然晋升计时 |
| 11 | 13×i32 | STR、DEX、VIT、LUK、基础伤害B的基础部分、基础修甲、基础治疗、基础最大HP、当前HP、总XP、总UP、总Gold、当前护甲 |
| 12 | 5个变长 Item | 装备 vector 顺序：Weapon、Helmet、Armour、Shield、Accessory；不另写槽数 |
| 13 | u8 + n×4字节 | 已装备技能数n及每个Skill |
| 14 | 1…17字节 | 玩家名字（空名写一个0） |
| 15 | 5×u32 | RNG seed1、2、3、4、5 |
| 16 | i32 | HelpMenu 的提示位图+38 |
| 17 | u8 | Difficulty |

整表证据：SerialiseState @0x265f4 的顺序 Write*；HelpMenu::Serialise。类型字节代码实际第二项 `type & 0xff` 再 OR，高项 `type & 0xf` 左移；合法类型0…7下等价于双半字节，异常值不保证隔离。平均交叉数虽然内存为int，只写低8位，例如300写44；火伤、毒等其他窄字段也会截低8位。

### Tile

先按已知类型写可选变体，再写状态，最后骷髅专属数据：[证据：Tile::Serialise @0x62c28；Deserialise 对应格式分支]

| 条件 | 字节 |
| --- | --- |
| 药水0 | u8：0普通、1爆炸、2法力、3酸；优先爆炸>法力>酸 |
| 剑4 | u8：0普通、1魔法、2破损、3箭；优先魔法>破损>箭 |
| 盾3 | u8：0普通、1破损 |
| Special6 | u8：specialType，0 Chain、1 Trophy |
| 其他 | 无变体字节 |
| 所有格 | u8：0无状态、1冻结、2燃烧；若燃烧另写u8火伤 |
| 骷髅1 | i32攻击、防御、当前HP、最大HP；u8 enemyType、countdown/命匣标志、BGH标志；最后毒队列1…3个u8 |

毒队列遇首个**内存int为0**的项，写出该0后立即停止；三个都非0则恰写3字节，无额外终止符。正常状态冻结/燃烧互斥；若人为造出二者均为真，写者会先写状态1仍额外写火伤，不能据此定义合法扩展。未保存 selected/matched/new、abilityUsed、火焰免伤267、巫妖首轮延迟26e。[证据：Serialise；SetFreezeVisibility/SetFlameVisibility；Deserialise]

### Item / Skill / CharacterClass

Item：`u8(relativeIcon),u8(prefixAnchor),u8(displayPrefix),u8(suffixIndex),u32(nonzeroMask)`，然后按属性ID0…19升序，每个置位项写i32值；零属性不占四字节。relativeIcon 相对本槽图标范围起点，槽由外层固定顺序决定。词缀FF代表−1。Item::Deserialise1/2 在该布局相同；非零项数量≥8时**序列化本身**还排队成就72。[证据：Item::Serialise @0x4bb90；Deserialise1/2]

Skill：4个u8依次为 nativeID、cooldown、charge、level。读取 cooldown==FF 时把 cooldown/charge 均设为−1；否则按无符号字节读取。ID不在读函数中钳到wrapper的39；40/41因此可由存档恢复。持续技能flag不属于这4字节。[证据：Skill::Serialise @0x6009c；Deserialise @0x5ffb0]

CharacterClass 局内26字节：`u8 race`，再按槽1、2、3各写 `u8 perk,u8 flaw`（共6），再写替换技能槽1…19（19字节）。第0对特性及第0首技能使用职业固定默认值，不在此块里保存；NONE为FF。FullState 先 Validate，再上述26字节、u8职业等级、5个i32：games/kills/normalBest/hardBest/harderBest，共47字节。独立职业存档头为u8版本0、u8数量10，加10块47字节，当前总472字节。[证据：SerialiseGameState @0x361ac；SerialiseFullState @0x36494；Game::SerialiseClasses @0x24d98]

### 读取版本与旧格式

DeserialiseState 先读一个字节，FF则再读版本，0调用 `DeserialiseState2(...,tileVersion=0,layoutVersion=0)`，其他版本用 tileVersion=1、layoutVersion=version；非FF直接调用旧 DeserialiseState1，且已消耗那个首字节。[证据：@0x27c8c]

| 格式 | 相对 FF03 的差异 | 读取来源 |
| --- | --- | --- |
| FF00 | 无模式/Pretzel字段、无职业块/奖杯数、无总击杀；Tile盾无变体字节 | DeserialiseState2 @0x2733c；Tile::Deserialise 的 version0 |
| FF01 | 同样无模式/职业/击杀；Tile使用含盾变体的新格式 | 同上 |
| FF02 | 加职业ID、26字节配置、奖杯数与总击杀；仍无模式/Pretzel统计 | layoutVersion≥2 分支 |
| FF03 | 全部当前布局 | layoutVersion≥3 分支 |
| 首字节非FF legacy | 见下；不是 FF00 的别名 | DeserialiseState1 @0x2785c |

缺少模式时恢复为非挑战、Pretzel分0；缺少职业头时用Adventurer。读取后 UpdateStats 重建装备派生值，再恢复当前HP/护甲；总资源拆成整百累计与 `%100` 条，局内等级由XP整百+1推导。不能从保存的初始STR等重新触发成长奖励。[证据：DeserialiseState2]

legacy 已读出的顺序：首部类型压缩数据；逐格旧骷髅 `u8 attack,defence,HP` 后1…3毒字节，没有当前格式的全格状态/最大HP/特殊敌人头，旧type5转爆炸药水；之后i32 turn；12个u8为STR/DEX/VIT/LUK、B/修甲/治疗、四bonus概率、当前护甲；5个i32为最大HP/当前HP/总XP/总UP/总Gold；五Item、技能数与Skill、名字、五RNG、Help、Difficulty。**首字节意义及棋盘额外预读字节尚未闭合**：外层先消耗一个非FF字节，旧函数又 ReadChar 开始棋盘，并在最后一对低半字节后再预读一次。按字面有19次棋盘字节读取，不能未经证实声称仅18字节且后续无偏移。[证据：DeserialiseState1 @0x2785c 的初始 ReadChar 与每第二格后的 ReadChar；列为 S1]

### ScoreScreen

当前格式每个类别单独保存：`u8 count,u8 lastIndex`；count条记录各 `i32 turn,xp,gold,up,score`、4个u8技能ID（FF空槽）、名字1…17字节。没有自己的版本或类别字节；类别由外层传参/存储键给定。Pretzel 的xp/gold/up三个位置装avgTimes10/maxCross/scoringChains；Sprint装各资源除4。读取count钳0…10，技能ID非FF钳0…41。[证据：ScoreScreen::SerialiseState @0x5cb34；DeserialiseState @0x5ca10；CheckEndGame]

legacy ScoreScreen::DeserialiseLegacyState：头count,lastIndex；每条先5×i32，再丢弃5个u8，再4个技能ID，再difficulty u8、一个丢弃u8、名字；调用 AddScore 按难度重建类别并 SetSkills。遗留丢弃字节的原业务名称未证明，保持“保留/废弃”而不编造。[证据：@0x5cec4]

### RNG 与持久化边界（关闭 T01 B4）

局内存档明确保存并恢复 **1 TILE、2 ITEM、3 SKILL、4 UPGRADE、5 OTHER**，每路32位，顺序固定；不保存0 COSMETIC。足以保存五路逻辑 RNG 的当时状态，但不等于整个游戏可以任意阶段精确暂停：小数收益carry、当前/后继技能flags、动画/token/菜单队列不在此布局内；正常 EndOfTurn 完成且未结束才保存，奖杯单点也有保存路径。不要用旧存档证明任意中间状态完整性。[证据：SerialiseState @0x265f4 尾部；DeserialiseState1/2 的 SetRandSeed；EndOfTurn；ProcessInput]

## 成就触发清单

枚举共78项包含0 NONE，实际具名成就77项。下面“+n”是进度百分比事件，不是游戏分数；100表示直接完成。QueueAchievement 在 Easy 抑制除67外的事件；Java DungeonRaidSurfaceView 把增量加到已有 percentComplete 并封顶100。规则引擎应发事件，本卡不调用在线成就服务。[证据：QueueAchievement @0x281cc；reverse/jadx 中 DungeonRaidSurfaceView.java 的 unlock/increment 路径；Achievement.java]

成就按实际触发点记录，死亡成就的严格 `<0` 与游戏结束的 `≤0` 不能混淆。毒/火等路径先发成就后可能被 Last Stand 救活，不宜改成统一“最终死因”统计。

| ID / 枚举 | 条件及进度 | 来源 |
| --- | --- | --- |
| 0 ACH_NONE | 哨兵：队列为空时返回，不是可完成成就 | GetNextAchievement；Achievement.java |
| 1 ACH_RANGER | 职业ID1等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 2 ACH_RAIDER | 职业ID2等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 3 ACH_PRIEST | 职业ID3等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 4 ACH_BARBARIAN | 职业ID4等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 5 ACH_MAGE | 职业ID5等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 6 ACH_ROGUE | 职业ID6等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 7 ACH_PALADIN | 职业ID7等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 8 ACH_WARRIOR | 职业ID8等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 9 ACH_ASSASSIN | 职业ID9等级>0；+100 | CharacterClass::UnlockAchievement @0x35fb0 |
| 10 ACH_ELF | 默认种族ID1的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 11 ACH_DWARF | 默认种族ID2的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 12 ACH_SAUREN | 默认种族ID3的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 13 ACH_FAUN | 默认种族ID4的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 14 ACH_ORC | 默认种族ID5的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 15 ACH_HALFLING | 默认种族ID6的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 16 ACH_WEREWOLF | 默认种族ID7的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 17 ACH_DRAGONKIN | 默认种族ID8的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 18 ACH_CHANGELING | 默认种族ID9的职业等级>4（使用默认种族+c，而非用户改选种族+8）；+100 | UnlockAchievement @0x35fb0 |
| 19 ACH_MASTER_RANGER | 职业ID1等级==10；+100 | UnlockAchievement @0x35fb0 |
| 20 ACH_MASTER_RAIDER | 职业ID2等级==10；+100 | UnlockAchievement @0x35fb0 |
| 21 ACH_MASTER_PRIEST | 职业ID3等级==10；+100 | UnlockAchievement @0x35fb0 |
| 22 ACH_MASTER_BARBARIAN | 职业ID4等级==10；+100 | UnlockAchievement @0x35fb0 |
| 23 ACH_MASTER_MAGE | 职业ID5等级==10；+100 | UnlockAchievement @0x35fb0 |
| 24 ACH_MASTER_ROGUE | 职业ID6等级==10；+100 | UnlockAchievement @0x35fb0 |
| 25 ACH_MASTER_PALADIN | 职业ID7等级==10；+100 | UnlockAchievement @0x35fb0 |
| 26 ACH_MASTER_WARRIOR | 职业ID8等级==10；+100 | UnlockAchievement @0x35fb0 |
| 27 ACH_MASTER_ASSASSIN | 职业ID9等级==10；+100 | UnlockAchievement @0x35fb0 |
| 28 ACH_CLASSY | 九个非Adventurer职业等级均≥10；+100 | CheckIfAllClassesMaxed @0x2835c |
| 29 ACH_CURIOUS | 局内XP升级后等级恰为5；+100 | AddResource @0x32210 |
| 30 ACH_SKILLED | 局内XP升级后等级恰为10；+100 | AddResource @0x32210 |
| 31 ACH_HEROIC | 局内XP升级后等级恰为25；+100 | AddResource @0x32210 |
| 32 ACH_LEGENDARY | 局内XP升级后等级恰为50；+100 | AddResource @0x32210 |
| 33 ACH_ASCENDANT | 局内XP升级后等级恰为100；+100 | AddResource @0x32210 |
| 34 ACH_IMPALED | 尖刺飞行伤害结算后HP<0（不是≤0）；+100 | Process @0x339ac，14a10 |
| 35 ACH_TOASTED | 火焰飞行伤害结算后HP<0；+100 | Process @0x339ac，1469c |
| 36 ACH_POISONED | 玩家持续毒扣血后HP<0；+100 | EndOfTurn @0x3289c |
| 37 ACH_DISINTEGRATED | 酸药扣治疗量后HP<0；+100 | AddResource @0x32210 case0/variant2 |
| 38 ACH_UNFORESEEN_CONSEQUENCES | Unstable按宿敌分支执行无剑重填；+100 | TeleportEnemy @0x29ad8 |
| 39 ACH_NOM_NOM | Devourer抽中的装备有正值项且执行一次ReduceStat；+100 | DestroyUpgrade @0x2ecb8 |
| 40 ACH_NEMESIS | HP≤0、非Human且其宿敌在场，在LastStand判定前排队；+100 | CheckEndGame @0x2f960 |
| 41 ACH_GETTING_CROWDED | 晋升路径检查特殊敌人数>2；+100 | Tile::Promote @0x64e3c |
| 42 ACH_CANT_TOUCH_THIS | 在特殊敌人奖励段收集Chaotic，且宿敌为Chaotic；+100 | MatchTile @0x2ac40 |
| 43 ACH_TOUCHE | 格挡反伤击杀Spiky；+100 | ProcessAttack @0x311b8 |
| 44 ACH_JACKPOT | 特殊敌人奖励段收集Golden；+100 | MatchTile @0x2ac40 |
| 45 ACH_I_SEE | 未定位触发调用；保留为未决A1，不猜测“发现Invisible”条件 | Achievement.java；全量QueueAchievement调用检索未发现0x2d |
| 46 ACH_BLOODLUST | 每次进入特殊敌人奖励段；+1 | MatchTile @0x2ac40（普通骷髅先返回） |
| 47 ACH_FLESH_WOUND | Elf种族，敌人毒阶段毒杀；每只+2 | EndOfTurn @0x3289c |
| 48 ACH_POW_KISSER | GetDamageType=UPPERCUT且AttackSkull成功击杀；每只+2 | MatchTiles @0x31bcc |
| 49 ACH_STAY_A_WHILE | Sauren购买附卷轴的装备并施放；+2 | FoldoutMenu::Process @0x41fc4 |
| 50 ACH_AINT_DEAD_YET | Faun升级治疗实际触发（当前HP低于25%）；+5 | Healing @0x28c0c |
| 51 ACH_HAMMER_TIME | Orc直接攻击未死目标的10%冰冻判定成功；+2 | AttackSkull @0x2f630 |
| 52 ACH_THE_BIGGER_THEY_ARE | Halfling同次链直接击杀计数≥15并提升身体护甲；+10 | ProcessInput @0x330c0，14d90 |
| 53 ACH_BITES_THE_DUST | Werewolf对普通敌人HP<防御的回合末判杀；每只+2 | ProcessCripples @0x2f558 |
| 54 ACH_BURNINATOR | Dragonkin在回合末火焰阶段杀敌；每只+2，不要求火焰来自FireBreath | EndOfTurn @0x3289c |
| 55 ACH_TEARS_IN_RAIN | Changeling进入特殊敌人奖励段并Shapeshift；+2 | MatchTile @0x2ac40 |
| 56 ACH_SNIPER | 链尾成功击杀特殊敌人；此前刚跳过箭头忽略格，倒数第三节点为箭头剑且距目标横或纵>1；+100 | MatchTiles @0x31bcc 的 bVar22 / LAB_00031efc / 0x38 |
| 57 ACH_WHAT_DOESNT_KILL_YOU | Halfling≥15直接击杀的同分支，Masochism标志15e18仍为真；+100 | ProcessInput @0x330c0 |
| 58 ACH_RUNEMASTER | Rune实际收集内部格数>链节点数−忽略格数；+100 | ProcessRune @0x2b560 |
| 59 ACH_NECKLACE | 36节点链收集specialType==0的Chain；+100 | MatchTiles @0x31bcc；Tile::SetType默认specialType=3 |
| 60 ACH_SLASHER | Slash行内直接收集普通骷髅计数==6；+100 | CollectRandomRow @0x30c8c |
| 61 ACH_BACK_FROM_DEAD | LastStand在HP≤0时实际救命；+100 | CheckEndGame @0x2f960 |
| 62 ACH_PREMONITION | Trap在RandomiseTile将一个特殊敌人的HP设为1；+100 | RandomiseTile @0x2d584 |
| 63 ACH_SHOCK_AWE | 15e19/1a/1b/1c四标志均真：Slash、Fireball、Charge、CollectBoard同一清零窗口；+100；不是施放40+41 | CheckShockAwe @0x28318；EndOfTurn清零 |
| 64 ACH_WHEN_YOU_WISH | Wish分支 GetTileCount(1)−GetSpecialEnemyCount()≥20；+100 | Skill::Activate @0x60210 case33 |
| 65 ACH_BRAVE_SIR_ROBIN | 执行Teleport；每次+1 | Teleport @0x2ffb4 |
| 66 ACH_SAFARI | BGH标志26d的特殊敌人被奖励分支实际转为Trophy；+100 | MatchTile @0x2ac40，0x42 |
| 67 ACH_MISSION_ACCOMPLISHED | 进入最终结束处理，包括失败与Sprint胜利；+100；Easy也允许 | CheckEndGame @0x2f960；QueueAchievement |
| 68 ACH_AROUND_THE_WORLD | 20节点链全部位于边界；+100 | MatchTiles @0x31bcc 的 bVar25 |
| 69 ACH_GOLD_DIGGER | 36节点链全部收集对象为金币，且没有忽略节点破坏标志；+100 | MatchTiles @0x31bcc 的 bVar2 |
| 70 ACH_TRAGIC_HERO | Harder，局内升到10级，perk数1/flaw数4；+100 | AddResource @0x32210 |
| 71 ACH_PIECE_OF_CAKE | Harder，局内升到5级，已装备技能数0；+100 | AddResource @0x32210 |
| 72 ACH_ARMED_DANGEROUS | 某Item序列化时20项属性中至少8项非零；+100 | Item::Serialise @0x4bb90 |
| 73 ACH_PACK_RAT | MatchTile收集破损标志26c的格；每格+1 | MatchTile @0x2ac40 |
| 74 ACH_JUST_MESSING_WITH_YOU | 提交后MatchTiles引发RandomiseTile次数>9，且这些新格全部为骷髅；+100 | ProcessInput @0x330c0，15e20==15e24；RandomiseTile @0x2d584 |
| 75 ACH_PRETZELS | 链对角单元重复计数k>5；+100，不限定Pretzel模式 | MatchTiles @0x31bcc，0x4b |
| 76 ACH_SURVIVOR | Sprint胜利标志成立进入结束处理；+100 | CheckEndGame @0x2f960 |
| 77 ACH_PRETZEL_LEGEND | Pretzel计分链的k≥15，待记分15e30>0；+100 | MatchTiles @0x31bcc，0x4d |

## 未决问题

- **S1 legacy首部**：旧局内格式的非FF首字节与19次类型读的对应含义未证明。当前FF03与FF00…02条件分支已提取；若未来要求导入旧存档，必须取得至少一个旧版本实物样本/写入代码再闭合，不能按猜测开发兼容导入。
- **A1 ACH_I_SEE**：枚举存在、Java有成就ID映射，未找到本版本原生事件触发者。其余77行含NONE均有上述来源；没有把英文名称当条件。
- 原存档不保存COSMETIC RNG，而01已证明其参与奖杯进度抽样；恢复后的跨局奖杯轨迹是否由额外外层状态补齐尚未证明。B4“保存范围”已关闭，不能扩大成“所有玩法随机轨迹均完整保存”。
- 原版成就服务的远端累计状态不在局内存档；本卡只恢复本地事件语义，不验证已停运服务行为。
