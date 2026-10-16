# 02 连线、战斗与回合结算（T01）

字段和地址约定见 [00-overview.md](00-overview.md)，生成、下落和 RNG 见 [01-board.md](01-board.md)。下文的 token 指一次待入账资源事件，不是资源点数；例如一个普通金币 token 默认增加 2 点金币。所有取整默认向零截断，浮点运算需要保留原生 float32 语义。[证据: AddResource @0x32210；Rand/RandI @0x67650/0x67bf4]

## 连线与提交

普通连线可以横、竖、斜走八邻格，不要求直线。ProcessTileSelection 根据触点相对末格的方向生成 dx/dy，各为 -1/0/1，并检查边界；过长拖动先把位移缩到格宽的 1.2 倍，再递归处理。候选格用中心圆命中，半径为半格宽×0.8，即格宽×0.4。重复触到链中旧格会删除其后**全部**节点并重算贡献，不能重复收集同一格；未发现禁止两段对角线几何交叉的规则，MatchTiles 反而统计交叉用于挑战计分。[证据: ProcessTileSelection @0x2c8dc；Tile::IsBeingSelected @0x62fec；MatchTiles @0x31bcc 的坐标集合]

`Tile::CanMatchType(chain, strict)` 的分支优先级如下，不能把它简化为一张无状态类型相容矩阵：[证据: CanMatchType @0x645ac 完整分支]

1. 冰冻的非骷髅不可选；冰冻骷髅仍可选。空链接受其余格（含单独点按奖杯）。
2. 候选是 Chain（special=0）时允许；候选是 Trophy（special=1）且链非空时拒绝。
3. 末格是箭头剑且 `strict=false` 时，允许接一个任意类型格；末格是 Chain 时也允许；末格是 Trophy 时拒绝。
4. 倒数第二格是箭头剑时，接下来的候选须为剑或活骷髅，不能是巫妖命匣。箭跨过的非剑/骷髅格记录到 `+0xb794` 集合，提交时既不计有效长度，也不收集。
5. 普通情况下同类型可连，剑 4 与骷髅 1 可互连。巫妖 `enemy=32 && countdown!=0` 为命匣，此时只与金币或另一个命匣相容，不按活骷髅连剑。

TouchEnd（2）先执行 ProcessRune，然后有效长度 `链节点数 - 忽略格集合大小 > 2` 才调用 MatchTiles，即至少 3 格。TouchInterrupted（3）和不足三格清除选择，不进入普通敌方回合。单格 Trophy 是独立分支，处理职业奖励、消除、补盘与存档，不调用 MatchTiles。[证据: ProcessInput @0x330c0 的 `2 < (uint)(iVar5 - *(this+0xb7a4))`；TouchState.java；ProcessRune @0x2b560，符文详细条件见 C1]

Cocky（flaw=2）在**实际链节点数≤3**时让非战斗收集调用 `MatchTile(...,7)`，消除但不发奖励。它不取消本回合，也不阻止 AttackSkull 击杀发奖；不要把说明文本扩写成“任何三格链均无收益”。[证据: MatchTiles @0x31bcc 开头 HaveFlaw(2) 及两个结算分支]

符文开关 `+0x15cd9` 开启时，ProcessRune 还要求链节点数≥4，首末格的 x/y 差各≤1。它逐行扫描 y=1…4、x=0…4，以链前后节点越过该行的方向翻转内外标记，并要求右侧存在已选格；预览计数与真正收集分开。提交时符合内部判定的**非特殊敌人格**直接 MatchTile(5)，普通骷髅也走收集而非 AttackSkull，特殊敌人不收集；此步骤发生在正常 MatchTiles 重置计数之前。复杂自交形状的边界与开关来源尚待 C1，不把它概括成任意几何多边形填充。[证据: ProcessRune @0x2b560 的 `3<uVar11`、首末差值、扫描循环与 `type!=1 || enemy==0`；ProcessInput @0x330c0 的调用顺序]

## 一次行动的主顺序

| 阶段 | 规则与证据 |
| --- | --- |
| 选择 | 持续计算链伤害、吸血、火焰/尖刺伤害与资源预览；ProcessInput @0x330c0，ProcessTileSelection @0x2c8dc |
| 提交 | 重置本次击杀计数，MatchTiles 将 `+0x5f74=false`，清五类收集计数，按链顺序攻击或收集；MatchTiles @0x31bcc |
| 连线末尾 | 遍历未在链里的 Meat Shield，各承受链总伤害；清旧格 new 标志，MoveMatchedTiles；随后 ProcessInput 调用 AddRevengeHealth、种族/技能的击杀后治疗；MatchTiles @0x31bcc，ProcessInput @0x330c0 |
| 资源与直接伤害 | Process 更新下落、token、吸血及火焰/尖刺飞行标签；到达才入账，奖励菜单可暂停后续处理；Process @0x339ac |
| 敌人普通攻击 | 移动列表、token、flare 都空后，ProcessInput 检查 CountAttackers；有攻击者进入 ProcessAttack 状态 1…7，无攻击者直接到 8；前五回合（turn<5）有 Unexpected（perk=0）也跳过普通攻击；ProcessInput @0x330c0，CountAttackers @0x24e2c |
| 回合末 | 状态 8 调用 EndOfTurn，完成后恢复输入；EndOfTurn @0x3289c，ProcessInput @0x330c0 |

这是一条由动画/菜单驱动的状态链，不是“一松手立即增加回合数”。Token 到达和直接伤害的竞争时序尚有 C2；移植应把这些拆成可测试的事件与暂停点。[证据: Process @0x339ac；ProcessInput @0x330c0 三个等待守卫]

## 剑与骷髅

令 `W=Game+0xc17c`（当前装备/属性汇总后的每剑伤害），`B=base(+0xc180)+extra(+0xc184)`。链里至少有一只活骷髅时 B 只计一次，否则不计；普通可用剑贡献 W，魔法剑（Tile+0x240）贡献 5W，破损剑（+0x26c）贡献 0。Sword Boost（Game+0xc234）将**剑贡献**乘 2，不将 B 乘 2：

```text
D = (有活骷髅 ? B' : 0) + (SwordBoost ? 2 : 1) × Σ(每剑 W 或 5W 或 0)
B' = 宿敌是 Freezing 且场上有 Freezing ? trunc(B/2) : B
```

证据：ProcessInput @0x330c0 首格初始化；ProcessTileSelection @0x2c8dc 增量和回退重算；UpdateStats @0x26c94 提供 W。新局基础 B=3，Strong（perk=4）再加 1；W 的装备生成来源留 T02，不假定恒为 1。[证据: InitNewGame @0x2d7a4；UpdateStats @0x26c94]

每只链中骷髅分别承受整份 D，伤害不会被前一只消耗。以下按 GetDamageType 的优先级修改传入伤害：[证据: Tile::GetDamageType @0x644bc；MatchTiles @0x31bcc]

| 条件（先匹配的分支优先） | DamageType / 传入伤害 |
| --- | --- |
| 非骷髅或命匣 | NONE=0；命匣走收集路径 |
| turn<5 且有 Confused（flaw=0） | BLOCKED=1 / 0 |
| Armoured（27） | 只有链中的**下一个**格 y 小于当前 y 才 NORMAL=2 / D，否则 BLOCKED；该分支不继续检查下列条件 |
| Dwarf（race=2），前一格/当前/后一格同 x，且前一格 y > 当前 y > 后一格 y | UPPERCUT=3 / D+W |
| Chaotic（14）且是种族宿敌 | BLOCKED / 0 |
| 自己是 Meat Shield（30），或场上不存在 Meat Shield | NORMAL / D |
| 其余 | BLOCKED / 0 |

因此 Meat Shield 存在时普通直接攻击被挡，但 Armoured/Dwarf 前置分支可能先返回；连线末尾每个未选 Meat Shield 仍受 D，`direct=false`。没有证据表明它们把伤害均分。[证据: GetDamageType @0x644bc；MatchTiles @0x31bcc 的末尾棋盘循环]

矮人面对混沌时，必须以同列的“正下方格→混沌→正上方格”穿过它；横向、斜向、反向，或混沌作为链端点，都不触发UPPERCUT。相邻与可连类型仍遵守普通连线规则；D+W之后还需扣目标防御。该限制依赖种族宿敌关系，并非混沌对所有种族免疫；也不能把直接连线的GetDamageType判断扩展成所有技能/持续伤害都受此限制。[证据同上；GetMortalEnemyType @0x35f34；AttackSkull @0x2f630；U10预览/提交回归]

混沌瞬移选点不因宿敌身份改变。JumpEnemy遍历未matched、不是自身、且“非骷髅或普通骷髅”的格子，按物理位置组成set，以 `RandI(0,count−1,RAND_OTHER=5)` 选一个；无候选不跳。其他特殊敌人排除，剑/盾/钱币/药水、普通骷髅及Chain/Trophy都可成为目标；不检查上勾拳路径、边缘位置或玩家是否容易攻击。交换位置后，以MatchTile(...,7)无奖励移除被吞的目标，再受后续补盘重力影响。[证据：Game::JumpEnemy @0x2f370，`+0x88==0`、`type!=1 || enemyType==0`、排除自身坐标、SwapTiles与MatchTile参数7；此函数无GetMortalEnemyType分支]

`AttackSkull(tile,d,direct)` 按以下顺序执行：[证据: AttackSkull @0x2f630]

1. 命匣直接返回。若 direct 且 `Game+0xc383` 开启，先发一个金币 token。
2. 设敌甲 E，敌 HP 减 `max(d-E,0)`。普通击杀立即增加击杀计数、累计被杀敌人的 GetAttack、调用 MatchTile(type=5)，返回成功；**不再抽破甲/上毒**。巫妖致死改为命匣：countdown=1、首轮延迟=true、攻防=0、HP=1、毒槽清零，不发这次击杀奖励。
3. 未死时，抽 `min(d,E)` 次 `RandI(0,100,RAND_OTHER) < pierce(+0xc18c)`；每成功一次敌甲 -1。这是先挡本次伤害、再磨甲，不重新结算本次 HP 损失。阈值默认 50，Cautious（flaw=5）默认 30，装备累加后最高 95。[证据补充: UpdateStats @0x26c94]
4. direct 且武器毒>0、敌人非 Poisonous（9），三个毒槽均增加武器毒值；即使 d=0 仍可上毒。Orc（race=5）再作 `RandI(1,100)<=10` 冰冻判定；此调用伪 C 丢失第三参数，但 disasm @0x1f754–0x1f83e 显示 r2 保持种族值 5，故 RNG 为 RAND_OTHER。[证据补充: Tile::AddPoison @0x62ad4]

0…100 是 **101 个整数**，`<50` 不等价于 `1…100<=50`，不得把破甲或破损改写成精确 50% 的浮点概率。已读的链伤害/AttackSkull 路径没有暴击随机判定，strings 中也未找到 critical/crit 的对应机制；不能自行加入 Luck 暴击。[证据: AttackSkull @0x2f630；ProcessTileSelection @0x2c8dc；UpdateStats @0x26c94；strings.txt 检索]

吸血预计算 `trunc(float32(D * (lifeStealPercent/100)))`，要求链里有活骷髅；不是按实际打掉的 HP、击杀数或敌人数计算。飞行标签到达后加 HP 并钳制上限。链里选到 Spiky 时反伤为一份 D（不是每个 Spiky 再加 D），直接扣玩家 HP；选中的燃烧格若未设免伤标记，则其火伤值加入独立的火伤总量。这两者均绕过护甲。[证据: ProcessTileSelection @0x2c8dc 的 `+0xc6e0/+0x14a10/+0x1469c`；ProcessInput @0x330c0；Process @0x339ac]

## 收集、额外 token 与资源条

MatchTile 先标记消除（Tile+0x88）；参数 5 表示按原格类型收集，7 表示不发奖。计数按实际收集类型分别累加。剑不发资源；破损格不发资源；Chain/Trophy 不走普通资源奖励。非特殊敌人的普通骷髅击杀发一个 XP token；特殊敌人改用 GetRewards。[证据: MatchTile @0x2ac40]

普通药水/金币/盾/XP 发基础 token 后，若**该类型本次计数≥4**，抽 `RandI(1,100,5)<=基础概率+附加概率` 再发一个；初始基础概率均 20。Daring（perk=2）且计数≥10 时阈值改为 100。不是每条长链只抽一次，也不是伤害暴击；法力、酸和爆炸药水不走普通药水额外 token 路径。[证据: MatchTile @0x2ac40；InitNewGame @0x2d7a4]

特殊敌人先 `N=RandI(15,25,RAND_TILE)`，再按如下顺序分配 token，所有除法先整数截断。R 的反向端点仍原样调用，让 RandI 自行交换：[证据: Tile::GetRewards @0x646e4；RandI @0x67bf4]

| 敌人 | 奖励组成 |
| --- | --- |
| Golden（3） | N 个金币 |
| Thief（13） | K=R(trunc(3N/4),trunc(N/2)) 个金币，N-K 个 XP |
| Healer（4） | P=R(trunc(N/4),trunc(N/3)) 个药水；M=N-P；K=R(trunc(3M/4),trunc(M/4)) 个金币；M-K 个 XP |
| Armoured（27） | 同 Healer，但第一批 P 个是盾 |
| 其余特殊敌人 | K=R(trunc(3N/4),trunc(N/3)) 个金币，N-K 个 XP |

Kamikaze 被收集时还遍历八邻格：消除可收集的非骷髅格，骷髅分支只有表现，没有递归伤害/消除；爆炸药水也走邻域消除而不发普通治疗 token。不要依据“explode”文案推断为范围伤害所有敌人。[证据: MatchTile @0x2ac40 的敌人 10 和药水 +0x244 分支]

实际入账由 AddResource 在 token 到达时执行。设 `m=2` 仅在 Dungeon Sprint，否则为 1；`boostX` 为对应双倍标记（取 1 或 2）。[证据: AddResource @0x32210；Process @0x339ac 的 Token 到达调用]

| 类型 | 每 token 入账规则 | 满条事件 |
| --- | --- | --- |
| XP | 加 2m；小数槽 `xpCarry += m*xpBonus`，≥1 时加 trunc(carry) 点并扣掉该整数部分 | 余数≥100：累计 XP +100，局内等级 +1，ShowMenu(0)，余数 `%100`；Faun（race=4）另触发 Healing |
| 金币 | 加 `2m*boostGold`；`goldCarry += m*goldBonus*boostGold`，同样取出整数 | 余数≥100：累计金币 +100，ShowMenu(1)，余数 `%100` |
| 盾：当前甲==最大甲，**或场上有 Corrosive（12）** | 加 `2m*boostShield` 点 UP；`upCarry += m*upBonus*boostShield`，同样取整 | 余数≥100：累计 UP +100，ShowMenu(2)，余数 `%100` |
| 盾：其他情况 | 修复 `(repairBase+repairExtra)*boostShield`，钳制最大甲 | 本 token 修复溢出丢弃；后到 token 重新判断是否转 UP |
| 普通药水 | 治疗 `(healBase+healExtra)*boostHealth`，钳制 `baseMaxHP+extraMaxHP` | 溢出丢弃；清玩家持续毒，除非宿敌是 Poisonous 且场上有它 |
| 法力药（variant=1） | 有效技能索引：恢复进度 +1，最高该技能冷却值 | 不治疗；Token 初始化时找不到技能会隐藏，见 C2 |
| 酸药（variant=2） | 直接扣 `healBase+healExtra`，最低 0，不受治疗双倍影响 | 立即 CheckEndGame |
| 投掷骷髅（骷髅 token variant=3） | 直接扣携带的整数伤害，最低 0 | 不加 XP；立即 CheckEndGame，并处理 Last Stand 延迟标记 |

全表证据：AddResource @0x32210；Token::InitialiseFromTile @0x653d0。三个条各使用一次 `if(>=100)` 而非 while；即使异常大单次奖励也只累计 100、触发一次，再 `%100`。Sprint 不把治疗量/修甲量乘 2。菜单 0/1/2 对应升级属性/技能、购买装备、强化装备；具体选项与消耗留 T02。[证据补充: FoldoutMenu::Initialise @0x42794 的 menu type 分支]

## 敌人的普通攻击

所有位置的骷髅都可攻击，不限底行。CountAttackers 要求 TileType=1、不是本轮新格（+0x8a=false）、不冰冻（+0x265=false）、GetAttack>0。InitialiseFlares 以同样的新格/冰冻条件累加攻击 A，并把 Poisonous 的攻击累计为本轮毒值。GetAttack 在种族为 1、敌攻击>1 且首毒槽>0 时返回攻击右移一位（减半向下取整），否则返回 Tile+0xa8；不能忽略此修正。[证据: CountAttackers @0x24e2c；InitialiseFlares @0x2a548；Tile::GetAttack @0x62934]

以攻击开始的玩家当前护甲 C 为准，一次汇总格挡 `min(A,C)`，穿透为 `max(A-C,0)`。每点实际格挡作 `RandI(0,100,5)<breakThreshold(+0xc188)`，成功则护甲 -1；有 Defiler（29）时所有格挡点都破损，并短路跳过这些随机调用。阈值由 UpdateStats 计算，初始 50，耐久加成降低阈值，最低 5。先以原护甲挡完合计伤害，再扣耐久；不是逐只敌人边打边磨甲。[证据: ProcessAttack @0x311b8；Defiler 参数由 disasm @0x215de 的 r1=0x1d 复核；UpdateStats @0x26c94]

全被护甲挡住时清本轮毒攻击；进入 HP 扣血阶段时，玩家持续毒取 `max(旧毒,本轮毒)`，并调用 ProcessVampires，然后扣穿透伤害。不是将各轮毒值持续相加。玩家毒每回合扣血，直到药水清除（宿敌例外如上）。[证据: ProcessAttack @0x311b8；AddResource @0x32210；EndOfTurn @0x3289c]

格挡阶段还执行削弱和反伤：削弱值>0 时降低旧骷髅的攻击，最低 1；反伤值>0 时对旧骷髅分别 `AttackSkull(spikes,false)` 再补盘。这两个遍历没有额外排除冰冻骷髅。Counterattack（+0xc382）走另一分支：对每个旧骷髅以其自身 GetAttack 调用 AttackSkull(false)，补盘并清新格标志，跳过普通伤害路径。[证据: ProcessAttack @0x311b8；DoCounterattack @0x30f38]

## 特殊敌人能力

以下列全 32 种特殊敌人。A/D/H 倍率见 01；名称和原文描述及文件偏移见 enums.json。表以代码为准：例如 Healer 的函数目标数是 **2**，与原文说明中的 one 不一致。回合末调用统一来自 ActivateAbility，部分敌人只有攻击/收集时的被动能力。[证据: Tile::ActivateAbility @0x64c78；Tile::GetEnemyDescription @0x62be0；以下各行函数]

| ID / 名称 | 已核实的规则与证据 |
| --- | --- |
| 1 Boss | 只有较高基础倍率，无独立回合末 case；GenerateStats @0x63098，ActivateAbility @0x64c78 |
| 2 Spiky | 被选入攻击链时令玩家反伤总量为一份链 D；ProcessTileSelection @0x2c8dc |
| 3 Golden | 倒计时初始 5，每次能力 -1，到 0 不发奖离场并立即补盘；ActivateAbility @0x64c78，RunAwayEnemy @0x300d4 |
| 4 Healer | 从其他未消除受伤骷髅随机选最多 2 个，回复到各自最大 HP；没有受伤目标则选最多 2 个加攻击 1；HealOrBless @0x34740，HealOrBless(set,bool,int) @0x34614 |
| 5 Invisible | 数值特例见 01；隐藏表现不推断额外攻击规则；GenerateStats @0x63098，ActivateAbility 无该 case |
| 6 Acidic | 随机把一个未消除普通药水改为酸药；MakeAcidPotion @0x2ea40 |
| 7 Flaming | 点燃八邻格，跳过已消除格和其他 Flaming；火伤为施术者 GetAttack，重复火焰可累加；IgniteTiles @0x29be0，SetFlameVisibility @0x62de8 |
| 8 Freezing | 随机冻结最多 2 个不同的未消除、非特殊敌人、未冻结格；宿敌存在时基础攻击减半；FreezeTiles @0x2e898，ProcessTileSelection @0x2c8dc |
| 9 Poisonous | 穿透攻击建立持续毒；免疫武器上毒；作为宿敌在场阻止药水解毒；InitialiseFlares @0x2a548，AttackSkull @0x2f630，AddResource @0x32210 |
| 10 Kamikaze | 倒计时 5 到 0，自己无奖励消除并爆周围非骷髅，玩家 HP 变为 max(1,trunc(HP/2))；被主动击杀也爆周围资源；ExplodeEnemy @0x2b2e4，MatchTile @0x2ac40 |
| 11 Overseer | 随机把一个未消除剑改为骷髅，经 SetType 可自然晋升，也处理新骷髅 1HP 标记；ConvertSwordToSkull @0x2eb4c |
| 12 Corrosive | 在场时盾直接转 UP，不修护甲；作为宿敌时，新骷髅生成会清玩家护甲；AddResource @0x32210，RandomiseTile @0x2d584 |
| 13 Thief | 偷最多 2 个金币格，玩家不获奖；没有候选金币格才扣金币条最多 2 点，只有一个候选时不补扣；宿敌另按偷取点扣 GetAttack 的 HP；StealGold @0x34a68/@0x348e8 |
| 14 Chaotic | 随机与一个未消除非特殊敌人格交换，原位置的被换格无奖消除；作为宿敌直接链伤害被挡（优先级见上）；JumpEnemy @0x2f370，GetDamageType @0x644bc |
| 15 Mage | 只要在场就阻止每回合自然技能恢复；EndOfTurn @0x3289c |
| 16 Assassin | 位于底行时直接扣 2×GetAttack 的 HP，最低 0；宿敌且非底行时消除其下格，特殊敌人格除外；StabAttack @0x2f250 |
| 17 Doppelganger | 防御设为玩家当前护甲；MimicDefence @0x2e84c |
| 18 Alchemist | 随机挑最多 2 个不同的未消除、非特殊敌人格，重新 RandomiseTile；可能仍抽到原类型；ConvertRandomTiles @0x2e6bc |
| 19 Unstable | 倒计时 5 到 0，全盘标记消除、设重填过滤；宿敌分支控制排除剑/骷髅；TeleportEnemy @0x29ad8，见 01 的过滤规则 |
| 20 Vampire | 普通攻击进入扣 HP 阶段时，未消除 Vampire 各回复自己的 GetAttack，普通分支不超过最大 HP；宿敌则直接加 GetAttack，超出旧上限时将最大 HP 提高至新 HP；ProcessVampires @0x2d18c，Tile::AddHealth @0x63a5c |
| 21 Vengeful | 有本次击杀时，未消除 Vengeful 的攻击增加击杀计数；函数名 AddRevengeHealth 不能当作加 HP；ProcessInput @0x330c0，AddRevengeHealth @0x2d294 |
| 22 Trampling | 随机破坏一个未消除、未破损的盾或非箭头剑；BreakRandomShieldSword @0x2e55c |
| 23 Greasy | 每列从 y=4 向上检查到 y=0，取第一个下方不是骷髅、且不是自身的骷髅，将其下格无奖消除；没有检查消除标志；LowerSkulls @0x2f154，disasm @0x1f17c–0x1f1c4 |
| 24 Alpha | 将邻域外未消除骷髅与八邻域内未消除非骷髅随机配对交换，候选不重复；AttractSkulls @0x2e22c |
| 25 Magnetic | 将邻域外未消除剑/盾与邻域内非剑/盾交换，目的地可能是特殊敌人；AttractShieldsSwords @0x2defc |
| 26 Brute | 随机取一个旧的、未消除普通骷髅，无奖移除，产生 variant=3 token，以其当前 HP 为直伤载荷；ThrowSkull @0x2eeb0，AddResource @0x32210 |
| 27 Armoured | 仅向上离开该格的链方向可伤害；特殊奖励含盾；GetDamageType @0x644bc，GetRewards @0x646e4 |
| 28 Devourer | 倒计时 5 到 0，随机选一个装备，再从它的正值升级项随机减去该项 GetStatDowngrade（不恒为 1，最低 0），UpdateStats；若该装备无候选不改抽其他装备，计时仍重置 5；DestroyUpgrade @0x2ecb8；Item::ReduceStat @0x4dbe0，详见 04 |
| 29 Defiler | 在场时每点格挡必定损失一点护甲；ProcessAttack @0x311b8 |
| 30 Meat Shield | 阻挡多数其他敌人的直接链伤害，自己可伤；未选中的也各受 D；GetDamageType @0x644bc，MatchTiles @0x31bcc |
| 31 Fleeing | 每次能力向上交换一格，顶行无奖消失；生成 JumpDown，因下落向下移动时 Stab 直接扣 GetAttack；FleeUp @0x2eda0，RandomiseTile @0x2d584，MoveMatchedTiles @0x2fd7c，Stab @0x2fcd8 |
| 32 Lich | 链致死先转命匣，可连金币收集并获特殊奖励；第一次回合末只清延迟标志，再下一次若仍命匣则按当前回合重新 GenerateStats 并复活；AttackSkull @0x2f630，CanMatchType @0x645ac，ActivateAbility @0x64c78 |

## EndOfTurn 的严格顺序

以下均为 EndOfTurn @0x3289c 中的源码顺序，该函数直接包含的棋盘循环为 x 外层、y 内层（ProcessCripples 内部为行优先）；不要按视觉效果合并这些阶段。

1. `turn++`，立即 CheckEndGame；死亡即停止后续阶段。
2. 无 Mage 时所有已选技能恢复进度 +1、钳制冷却值；每个技能 Deactivate，更新 HUD。
3. 轮换本轮/下一轮技能标记，清 counterattack 和收集计数，剑/盾/药/金币双倍标记从后继拷贝到当前。
4. 每格先解冻；否则若燃烧，骷髅受存储火伤，致死时先将 HP=0 再 AttackSkull(0,false)，随后清火焰。冰/火设置函数会互相清除。[证据补充: SetFreezeVisibility @0x62e94；SetFlameVisibility @0x62de8]
5. 玩家再生治疗（钳上限），然后玩家毒扣血（钳下限 0），CheckEndGame。
6. 敌人毒：取出毒队列首项、左移并尾部补 0；致死直接 MatchTile(5)，未死扣 HP。这条死亡路径没有经过 AttackSkull 的巫妖命匣转换。[证据补充: GetPoison @0x62b0c / disasm @0x52b0c]
7. 清全部敌人 abilityUsed（+0x264）；ProcessCripples；逐格对 `type=skull && enemy!=0` 调 ActivateAbility。此处没有排除新格、已标记消除格或冰冻格；移动造成再次遍历由 abilityUsed 防重。ProcessCripples 对种族 7 的未消除普通骷髅作 HP<防御判杀。[证据补充: ProcessCripples @0x2f558；ActivateAbility @0x64c78]
8. 轮换 Last Stand 标记，CheckEndGame。
9. MoveMatchedTiles，再清全部新格标记；轮换新骷髅 1HP/强制金币标记，清重填过滤；自然晋升计时减 1，最低 0。
10. 更新提示；挑战为 Sprint 且 `turn==100` 则置结束标志；CheckEndGame；仍活着才 SerialiseState。

## 胜负条件

CheckEndGame 在结束界面已显示时直接返回真。Sprint 的结束标志成立时进入胜利；否则 HP>0 则未结束，HP≤0 且有当前 Last Stand 时恢复最大 HP 并消耗保护，仍未结束，其余为失败。结束时记录分数/职业进度、初始化结束画面，并把局内存档长度清零、标记 dirty。Classic/Pretzel 的该函数没有击杀 Boss 或达到金币/等级即可获胜的分支。[证据: CheckEndGame @0x2f960]

Sprint 的第 100 回合仍须通过此前各次死亡检查，只有 EndOfTurn 尾段才置胜利标志；不能在 turn++ 到 100 时立即宣布胜利。[证据: EndOfTurn @0x3289c 与 CheckEndGame @0x2f960 的调用顺序]

## 未决问题

- **C1：符文与技能完整输入规则。** 已读 ProcessRune 全函数并提取开关、闭合门槛、扫描范围和收集过滤；T02 已在 [03-progression.md](03-progression.md) 给出准确扫描条件、形状示例、写入与轮换；复杂跨阶段运行对照仍归 C2/C3。不能把普通有效长度验证当作所有技能释放条件。
- **C2：动画到达竞争。** Process 的顺序和等待条件已读，但 Token::Process 的速度积分、同帧多个菜单 token、吸血与火伤/尖刺同时到达的边界未完整复现。法力 token 无有效技能时初始化隐藏，而直接调用 AddResource 的无效索引会退化到治疗；不能仅按后一函数设计事件生成器。需要原生运行轨迹或确定性逐帧样例。
- **C3：特殊敌人同回合交互尚无运行验证。** 已用汇编闭合 Orc 的 RNG 与 Greasy 顶行边界，并读 AddHealth 闭合 Vampire 上限。尚无原生运行样例验证多个特殊敌人交换位置、立即补盘、已消除格再被访问时的组合结果；这不是为单个已知能力改规则的理由。
- **C4：全部种族/技能组合。** 已列出本卡主路径实际遇到的修正，不声称已穷举所有技能写入者与宿敌的跨阶段组合。特别是标记消除但尚未下落的特殊敌人仍可能进入能力遍历；需要按原顺序保留，再用原生行为验证，不能加一个臆测的“活敌人”全局过滤器。
