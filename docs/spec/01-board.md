# 01 棋盘、补充与随机数（T01）

地址和字段记法见 [00-overview.md](00-overview.md)。这里的概率以原始 `RandI` 调用及判定为最终定义；百分数是等权采样的直观表达，不能用新的 RNG 或改变调用次数代替原流程。

## 尺寸、坐标与遍历

- 棋盘 6 列 × 6 行，`x,y ∈ [0,5]`，x 向右、y 向下；Tile 地址为 `Game+0x5fcc+y*0xea0+x*0x270`。行 0 在顶端，行 5 在底端。[证据: InitNewGame @0x2d7a4 的两层 6 次循环；CalculateTilePositions @0x25f64；FleeUp @0x2eda0 在 y=0 离场]
- 原生画面坐标宽 1、触摸高度换算至 1.5。格距 `s=float32(0x3e29999a)=0.16562500596046448`，拖线方向阈值 `float32(0x3da9999a)=0.08281250298023224`；不是精确的 `1/6`。中心为 `(x+0.5)*s+0.003125`、`(y+0.5)*s+0.246875+modeOffset`；挑战偏移 `0.015625`（`0x3c800000`），非挑战为 0。[证据: Start @0x260ac；CalculateTilePositions @0x25f64；TouchStart @0x2442c]
- 初次命中取 `x=trunc(touchX/s)`、`y=trunc((touchY-boardTop)/s)`，先检查 y 在 `[boardTop,boardTop+1)`，再检查格索引。这里没有先减 x 的 0.003125 视觉偏移，移植不可自行“修正”。拖线还有圆形命中测试，见 02。[证据: GetTileAtPosition @0x24470]
- 新局按 **y 外层、x 内层**生成；补充按 **x 外层、y 从 5 到 0**。两者顺序不同，影响种子回放。[证据: InitNewGame @0x2d7a4；MoveMatchedTiles @0x2fd7c]

## 普通格生成

基础类型编号：药水 0、骷髅 1、金币 2、盾 3、剑 4。常规补充直接 `RandI(0,4,RAND_TILE)`，五种各一份权重（通常表述为各 20%）。没有在 RandomiseTile 中按难度调整五种基础权重。[证据: TileType.java:7–11；RandomiseTile @0x2d584]

严格的分支优先级如下，可作为生成器步骤实现；所有标志名均对应 00 中的偏移。[证据: RandomiseTile @0x2d584 完整分支]

1. 若 `forceCoin(+0x1433e)` 且未开启 `filter(+0xc380)` 且 `+0x14dab==0`，类型先定为金币；否则消耗一次 `RandI(0,4,1)`。
2. 若是 Sprint（challenge 且 mode=0），并且 `IsTimeToPromote()` 为真，将类型强制设为骷髅。
3. 若 filter 开启：`+0xc381==0` 时反复重抽直到不是骷髅；非零时反复重抽直到不是剑。**重抽必须消耗 RNG**，不是将概率数组缩成四项后一次抽取。
4. 调用 `Tile::SetType(type,turn,difficulty)`，记生成数；若为骷髅再记骷髅生成数。
5. 药水且有 Gifted（perk=1）：`RandI(1,100,1)<6` 变法力药（5%）。盾且有 Clumsy（flaw=7）：`<4` 变破盾（3%）。剑且有 Agile（perk=6）：`<6` 变箭（5%）。这些是选定基础类型后的条件概率。
6. 骷髅且 `+0x1433d` 非零：当前 HP 设为 1。若本族宿敌是 Corrosive（12）且这次生成 12，立即把玩家护甲清零；若生成 Fleeing（31），`JumpDown` 将其与同列底格交换。[证据: RandomiseTile @0x2d584；JumpDown @0x2d3cc]

`SetType` 重置 enemy=0、special=3、变体与冰火/破损等标志，并用 `RandI(0,7,RAND_COSMETIC)` 选外观。骷髅再查询 `IsTimeToPromote`，决定 `GenerateStats` 或 `Promote`；其他基础格不生成敌人数值。[证据: Tile::SetType @0x64ef8]

新局将 filter 设为 1，因此在 `+0xc381==0` 的正常路径，初始棋盘只有药水/金币/盾/剑，条件权重各 25%。生成后两个过滤标志清零。首次分配的 `+0xc381` 在目前已查构造/Start/InitNewGame 中未见生成前显式清零，因此这里保留前置条件，见 B1；不能把“永远无初始骷髅”写成无条件事实。[证据: InitNewGame @0x2d7a4；Game::Game @0x28c8c；Start @0x260ac；RandomiseTile @0x2d584]

玩家 Teleport 标记全盘消除但不发奖励，开启 filter 后立即补充。Unstable 敌人的 TeleportEnemy 也清盘：非宿敌时排除骷髅；若本族宿敌为 Unstable，改为排除剑。它在回合末补充后才清除过滤标志。[证据: Teleport @0x2ffb4；TeleportEnemy @0x29ad8；EndOfTurn @0x3289c]

## 下落与补充

每列从底向上扫描：未标消除的格不动；空洞向上找最近未消除格，找到后把该 Tile 完整状态移到空洞（并交换对象内容）；找不到时在本列顶端外创建新格。新格依次从行 -1、-2… 出发，目标为当前洞位；标记 `newThisTurn(+0x8a)=1`，调用上述 RandomiseTile。既有格的相对上下顺序保留，不横向填洞。[证据: MoveMatchedTiles @0x2fd7c；GetNearestUnmatchedTile @0x24510，反汇编 @0x14510–0x1455e 返回最近行号或 -1；PositionTile @0x24560]

必须区别“物理槽位”和“实体状态”：原版使用固定 Tile 数组和复制交换，不是交换指针。容器中 Tile* 的排序等价于固定槽位的行优先顺序 `6*y+x`。例如敌人随机目标 `std::set<Tile*>` 用该顺序挑第 k 个；`ThrowSkull` 的 vector 却按 x 外层、y 内层插入。复现确定性时必须保留各自顺序。[证据: MoveMatchedTiles @0x2fd7c；SwapTiles @0x28b14；FreezeTiles @0x2e898；ThrowSkull @0x2eeb0]

下落导致 Fleeing（31）向下移动时，收集到集合，全部列处理完后逐个 `Stab`，玩家直接损失该敌人的 GetAttack，最低 HP=0，立即检查死亡。新生成 Fleeing 的 JumpDown 与既有 Fleeing 下落 Stab 是两条不同路径。[证据: MoveMatchedTiles @0x2fd7c；Stab @0x2fcd8；RandomiseTile @0x2d584]

本轮新补入的骷髅不参加随后普通攻击：CountAttackers/InitialiseFlares 排除 `+0x8a`；但回合末特殊能力遍历没有这个过滤。EndOfTurn 尾部再次补盘后将所有 `+0x8a` 清零，供下一轮使用。[证据: CountAttackers @0x24e2c；InitialiseFlares @0x2a548；EndOfTurn @0x3289c]

## 特殊敌人出现频率

非 Sprint 新局计时 `P=50`，有 Zealous（flaw=8）则为 49。每次 EndOfTurn 后段 `P=max(P-1,0)`；普通模式 `IsTimeToPromote` 实际只在 **P=0** 返回真，P=1 不触发。到期不立即改造现有格；下一个被 SetType 成骷髅的格才 Promote。[证据: InitNewGame @0x2d7a4；EndOfTurn @0x3289c；IsTimeToPromote @0x250b0 的 `1-P` 与无符号比较；SetType @0x64ef8]

Sprint 新局 P=200（哨兵），回合末仍递减。P=0 时立即可晋升；否则 P≠200 时，普通 `turn-4` 能被 10 整除则触发，Zealous 改为 `turn-3` 能被 9 整除；触发时将 P 写 0。晋升完成把 P 重置 200。RandomiseTile 会在到期时强制出骷髅，因此不是“20% 骷髅概率再等抽到”。[证据: IsTimeToPromote @0x250b0；SetTimeToPromotion @0x2985c；RandomiseTile @0x2d584]

Promote 先 `RandI(1,32,1)` 从全部特殊敌人等权选一种。当前职业不是 Adventurer（ClassType≠0）时，再抽 `RandI(1,200,1)`，≤10 时用种族宿敌覆盖；Intimidating（perk=8）改为 ≤5。这里是**覆盖概率 5%/2.5%**，宿敌本来已经可能被首抽选中，因此其最终出现率不是单独 5%。[证据: Tile::Promote @0x64e3c；CharacterClass::Initialise @0x36524 的 ClassType 字段]

因此默认矮人战士每次晋升的混沌概率按等权抽样计算为 `5% + 95%/32 = 7.96875%`；带Intimidating时为 `2.5% + 97.5%/32 = 5.546875%`。该分支没有历史种类去重、连出次数或“强制三连宿敌”判断，允许连续重复；这不证明用户某局三个敌人的具体抽样轨迹。[证据：同上，完整Promote分支；数值为基于该分支的概率推导]

技能 Big Game Hunter 走 PromoteNormalEnemy：从现有普通骷髅随机挑一个，晋升时暂时关闭 `+0x1433c`，不重置自然晋升计时；标记 `+0x26d=true`。[证据: PromoteNormalEnemy @0x2d454；SetTimeToPromotion @0x2985c；Skill::Activate @0x60210]

### 骷髅数值与下一次晋升间隔

以下使用非负回合数 `t`、`trunc` 为向零取整、`R(a,b)=RandI(a,b,RAND_TILE)`（端点反向会自动交换）。令 `L=trunc(totalXP/100)`；Sprint 改为 `trunc(trunc(totalXP/4)/100)`。Normal/Hard/Harder 先算 `q=trunc(t*max(1,1+(t-500)/k))`，若 L>40，再 `q=trunc(q*(1+(L-40)/60))`；Easy 的 q=t。Pretzel 强制走 Normal 分支。[证据: GenerateStats @0x63098；disasm @0x53098–0x53156 和 @0x53450 模式选择]

| 难度 | k | 基础攻击 A | 基础防御 D | 基础 HP H | 下一次晋升计时候选 C（q>0） |
| --- | ---: | --- | --- | --- | --- |
| Easy=0 | 不加速 | max(1,R(trunc(q/80),trunc(q/70))) | max(0,R(trunc(q/70),trunc(q/55))) | max(3,R(trunc(q/25),trunc(q/20))) | R(trunc(200/√q),trunc(300/√q))+5 |
| Normal=1 | 700 | max(1,R(trunc(q/65),trunc(q/55))) | max(0,R(trunc(q/50),trunc(q/40))) | max(4,R(trunc(q/20),trunc(q/15))) | R(trunc(200/√q),trunc(300/√q)) |
| Hard=2 | 750 | max(1,R(trunc(q/50),trunc(q/40))) | max(0,R(trunc(q/40),trunc(q/37))) | max(4,R(trunc(q/17),trunc(q/12))) | R(trunc(150/√q),trunc(300/√q)) |
| Harder=3 | 500 | max(1,R(trunc(q/40),trunc(q/35))) | max(0,R(trunc(q/30),trunc(q/35))) | max(4,R(trunc(q/15),trunc(q/10))) | R(trunc(150/√q),trunc(300/√q)) |

全表证据：Tile::GenerateStats @0x63098 的 difficulty switch、浮点常量 700.0/750.0/500.0/60.0/150.0/200.0/300.0；RandI @0x67bf4。q=0 的非有限转换不在此表保证范围，见 B2。

Sprint 在上述抽数后再抽 A=max(1,R(trunc(q/20),trunc(q/12)))、D=max(0,R(trunc(q/10),trunc(q/6)))、H=max(4,R(trunc(q/8),trunc(q/4))) 覆盖基础值，因此旧分支 RNG 调用仍不能省略。普通敌人遇 Sneaky（flaw=3）H+1；特殊敌人遇 Zealous 则 C=max(C-1,1)，随后 SetTimeToPromotion；特殊敌人 D=0 时先升至 1。[证据: GenerateStats @0x63098，基础 switch 后的 challenge/flaw 分支]

特殊类型在基础 A/D/H 上作如下修改；未列出的非零类型为 ×2/×2/×4，普通 0 保持。修改后保存 Hmax=H。[证据: GenerateStats @0x63098 的第二个 switch]

| EnemyType | A / D / H | 额外状态 |
| --- | --- | --- |
| Boss 1 | ×3 / ×3 / ×6 | — |
| Spiky 2 | ×2 / 不变 / ×3 | — |
| Golden 3 | 0 / ×6 / ×6 | countdown=5 |
| Invisible 5 | ×2 / ×10 / trunc(H/2) | — |
| Poisonous 9 | 不变 / ×2 / ×4 | — |
| Kamikaze 10 | 不变 / ×2 / ×6 | countdown=5 |
| Assassin 16 | ×3 / ×2 / ×3 | — |
| Doppelganger 17 | ×2 / 设为玩家当前甲 / ×4 | — |
| Unstable 19 | ×4 / 不变 / ×5 | countdown=5 |
| Armoured 27 | ×2 / ×4 / ×3 | — |
| Devourer 28 | ×2 / ×2 / ×4 | countdown=5 |
| Meat Shield 30 | trunc(A/2) / 不变 / ×5 | — |

特殊敌人还受 Noisy（flaw=9）影响：H=`trunc(H*1.05)`；若当前种族宿敌为 Invisible 且场上存在该敌人，所有此次生成敌人的 D 再 ×2。最后将当前 H 复制到 Hmax。[证据: GenerateStats @0x63098 尾段；1.05 为简写，实际 float32 值是 1.0499999523162842]

## 特殊格

- Chain（special=0）来自 Haste 的 CreateChain：至多抽 10 对 `(x,y)`，跳过特殊敌人；成功把格转换为 TILE_SPECIAL=6、special=0；不是自然生成的第六种基础格。[证据: CreateChain @0x2a038；SetSpecialType @0x65004；Skill::Activate @0x60210 case 39]
- Trophy（special=1）来自特殊敌人收集后的 MatchTile。难度>Easy 才递减奖杯计数；Sprint 还需 `RandI(0,100,RAND_COSMETIC)<50` 才减。计数<1、本局奖杯数<3，且当前非基础职业仍可升级或尚有未解锁职业时，把被杀格改成 Trophy、撤销其消除标记、奖杯数+1、计数重抽 `RandI(20,30,RAND_COSMETIC)`。否则不生成。SetTimeToTrophy 对传入值仅钳制上限 30。[证据: MatchTile @0x2ac40；SetTimeToTrophy @0x24500]
- 点按一个 Trophy 可触发职业成长/解锁、消除并补盘、存档；这个分支不调用 MatchTiles，也没有设置普通回合消耗标记。具体成长选择留 T02。[证据: ProcessInput @0x330c0 的单格 special=1 分支]

## 随机数

六个 32 位无符号状态，乘法低 32 位溢出，**没有取模 2147483647，也没有加数**。每次 RandUnitF：

```text
seed = uint32(seed * 16807)                 // 0x41a7
bits = (seed >>> 10) | 0x40000000
u = clamp(float32FromBits(bits) - 2.0, 0.0, 1.0)
// 等价 u=(seed>>>10)/4194304；实际范围 [0, 1-2^-22]
Rand(a,b,k) = float32(a + float32((b-a)*u))
RandI(a,b,k) = int(floor(float32(min(a,b) + float32((abs(b-a)+1)*u))))
```

证据：RandUnitF @0x67610 的伪 C 丢失返回值；以 disasm @0x57612–0x57640 为准，literal @0x57648=2.0，r1=0、r2=1.0；Rand @0x67650 / disasm @0x57650；RandI @0x67bf4 / disasm @0x57bf4–0x57c60。上式适用于当前正常小整数范围，若移植极大数值要再验证 ARM float32 舍入。零种子会保持零，不主动替换。[证据: 相同乘法指令与无其他分支]

新局和 Start 用 `time(NULL)` 秒级值 `SetRandSeed(seed,6)` 初始化全部六条序列，再 FlushRandSeeds，对每条各乘一次 16807。`GetRandSeed(k)` 只允许 0…5；6 是全体设置哨兵，不是第七条 RNG。[证据: InitNewGame @0x2d7a4；Start @0x260ac；SetRandSeed @0x67574；FlushRandSeeds @0x675a4；GetRandSeed @0x675c8；RandType.java:7–13]

| RandType | 用途与证据 |
| --- | --- |
| 0 COSMETIC | Tile 变体、Token 动画，**也用于奖杯判定/间隔**，不能认为绝不影响规则；SetType @0x64ef8，Token::InitialiseFromTile @0x653d0，MatchTile @0x2ac40 |
| 1 TILE | 基础类型、敌人属性、晋升类型、特殊奖励组成；RandomiseTile @0x2d584，GenerateStats @0x63098，GetRewards @0x646e4 |
| 2 ITEM | 装备生成；Item::GenerateStats @0x50ee4 的 RandI 调用（T02 继续细化） |
| 3 SKILL | 技能选项；FoldoutMenu::Initialise @0x42794（伪 C 第 602、700 行 RandI 第三参数为 3）（T02 继续细化） |
| 4 UPGRADE | 装备升级随机项；ItemUpgrade::GetRandomStat @0x51db8 |
| 5 OTHER | 破甲/破损、额外 token、特殊能力随机目标；AttackSkull @0x2f630，ProcessAttack @0x311b8，MatchTile @0x2ac40，FreezeTiles @0x2e898 |

局内存档只写种子 1、2、3、4、5，不写 0；故即使恢复棋盘，奖杯路径/动画可能无法逐位回放，不能宣称原存档已保存全部随机状态。[证据: SerialiseState @0x265f4 尾部五次 GetRandSeed]

## 未决问题

- **B1：首次生成前过滤子标志。** 全局搜索 `c381`、阅读 Game 两个同构构造入口、Start、InitNewGame，未见初次填盘前初始化；InitNewGame 是填完才清零。已保留条件分支，未将堆内存默认解释为零。要用原生首局运行/汇编写入追踪闭合。
- **B2：q=0 时晋升间隔。** GenerateStats 会计算 `200/√q` 等，即使普通骷髅也消耗这一抽样；伪 C 出现错误的 `extraout_r0` 与 NaN 条件。已复核正常正 q 公式和 RNG，但 ARM 对 infinity→int 的边界结果及其后的 RandI 溢出需独立验证；不要用随意的 C=50 兜底代替。
- **B3：forceCoin 的例外标志 `+0x14dab`。** 已知 RandomiseTile 的完整条件和 EndOfTurn 复制顺序，尚未完成所有技能写入的字段命名。T02 对应 Treasure Chamber/相关技能须补齐持续轮数及激活时机。
- **B4：资源 RNG 与存档回放。** RandType=0 在奖杯逻辑中实际参与规则，已验证调用但尚未实测恢复前后奖杯差异。新引擎保存全六种子可作为新格式设计，不能宣称与旧格式完全等价。
