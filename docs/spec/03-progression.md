# 03 成长、奖励与技能（T02）

地址约定同 00；本文规则来自本地二进制，`R(a,b,k)` 为 01 的含端点 RandI。技能等级只改变冷却，不按等级放大效果；技能调用的 Game 函数不接收 Skill/等级参数。完整基础冷却、名称与来源偏移见 [classes.json](../../data/classes.json) 的 skills。原生 42 个技能与 wrapper 的 40 个有效 SkillType 必须分别建模。[证据：Skill::Activate @0x60210；Initialise @0x60984]

## 满条与升级菜单

XP、金币、UP 各到 100 时分别排入菜单 0、1、2；每 token 只检查一次，累计值 +100，余数 `%100`。XP 同时局内等级 +1；升级没有自动全属性增长。选择结果由 FoldoutMenu::Process 在关菜单时依第一、第二选中的顺序调用 SetSkill。[证据：AddResource @0x32210；FoldoutMenu::Process @0x41fc4]

- 菜单 0：四个候选，必须选择两个不同按钮才能确认。通常至多两个技能候选，其余为属性候选；技能池不够时属性补足四个。[证据：FoldoutMenu::Initialise @0x42794；ProcessInput @0x41d54 的 +0x30/+0x34 双选择与 +0x20 确认门槛]
- 菜单 1：从五槽升序 set 中逐次 `R(0,n-1,2)`，不放回选三个槽；每选一个立即生成该槽的新装备，之后再选下一槽。第四按钮为空且不可选择。三选一，无额外扣金币动作；跨条已支付机会。卷轴见 04。[证据：Initialise @0x42794 的 iVar26!=0x18；Process @0x41fc4]
- 菜单 2：同样从五槽不放回选四个，使用 RNG=4，每次选槽后立即为该装备生成一个强化候选，然后再抽下一槽；四选一。Enchant 直接 ShowMenu(2)，不扣 UP。[证据：Initialise @0x42794 的 iVar16!=0x20；Upgrade @0x251d4]

升级抽样严格步骤（权重均为集合中每 ID 一份；**不按描述稀有度加权**）：

1. 已有四技能时池为已有技能 ID 的 set；否则取职业 GetSkillPool（见 05）。普通模式移除等级 ≥10 和已有 Wish=33；Sprint 移除所有已有技能，并额外移除 Trap=22。
2. 属性池为 0…7；当四种总额外 token 概率（基础+装备）均 ≥100 时移除属性 7。Pretzel 另移除技能 Teleport=7、Treasure Chamber=24 和属性 MaxHP=6。
3. 记是否所有已有技能都不可升级（Wish 也算不可升级）。已有三技能且全不可升级时，技能候选数 `min(1,pool.size)`；其他情况 `min(2,pool.size)`。
4. 技能候选逐个用 `R(0,pool.size-1,3)` 按 ID 升序定位。第一个候选在局内等级=2且非 Adventurer 时，**先耗掉抽数，再覆盖成职业基础 vector[0]**；Sprint 的 Wish 例外不覆盖。不要把此技能解释为新局已经装备。
5. 用已有同 ID 技能作升级模板。若已有三技能而第一个候选是新技能，重建余下池为已有可升级且非 Wish 技能（Sprint 不添加）；否则删除选中 ID。第二候选因此不会让选择后的技能数超过四。
6. 随后用 RNG=3 从升序属性 set 不放回抽取，填满四候选。

[以上步骤证据：FoldoutMenu::Initialise @0x42794，LAB_00042996、LAB_000432fa、LAB_00043352、LAB_00043548、LAB_000435ca；CharacterClass::GetSkillPool @0x3707c。无候选池时不得擅自增加一次 RandI。]

## 属性与初始值

新局 STR/DEX/VIT/LUK 各 1，基础伤害 3，基础修甲/治疗各 1，四种 bonus token 概率各 20%，等级 1、已装备技能数 0。基础 HP=40；Pretzel 为 100；Strong +1 基础伤害、Tough +10 HP、Frail -10 HP、Frugal +10 金币概率、Reckless -10 盾概率。装备附加量由 UpdateStats 独立重算。[证据：InitNewGame @0x2d7a4；UpdateStats @0x26c94]

| StatType 值 | 选择时增长 | 证据 |
| --- | --- | --- |
| 0 Strength | STR +1；基础伤害 +1；XP bonus +5 百分点 | Skill::GetStat @0x5fef4 的表 @0x6e088=[1,1,5,1]；Initialise(StatType) @0x606a4；SetSkill @0x2be04 |
| 1 Dexterity | DEX +1；每盾修甲 +1；盾 bonus +5 百分点 | 同上 |
| 2 Vitality | VIT +1；基础 HP 上限和当前 HP 都 +5；药水 bonus +5 百分点；Pretzel 不增加 HP | 同上 |
| 3 Luck | LUK +1；每药治疗 +1；金币 bonus +5 百分点 | 同上 |
| 4 Attack | 基础伤害 +2，不增加 STR | Initialise @0x606a4 case 4；SetSkill case 0x2a…0x2d 之外不改属性计数 |
| 5 Defence | 每盾修甲 +2，不直接增加最大护甲 | 同上 case 5 |
| 6 Health | 基础最大/当前 HP +10，Pretzel 不提供 | 同上 case 6；FoldoutMenu::Initialise |
| 7 Bonus | 四种基础 bonus 概率各 +5 百分点，分别封顶 100 | SetStatChance @0x5ff50；SetSkill @0x2be04 |

装备属性点使用同一 [1,1,5,1] 与每点 5% 换算，但单独存放；不能把每次 UpdateStats 当成再升级一次。基础概率已 100 的对应奖励增量为 0。[证据：UpdateStats @0x26c94；SetStatChance @0x5ff50]

## 技能获取、冷却与施放

新技能等级=1，`cooldown=baseCooldown`、`charge=cooldown`，立即可用。已有技能升级：等级 `min(oldLevel+1,10)`，冷却在 oldLevel≠10 时减 1，充能 `min(oldCharge,newCooldown)`。Sprint 初始化候选时冷却再 -4、等级强制为 5；菜单已禁止升级已有技能。没有通用的最低 1 冷却钳制。[证据：Skill::Initialise @0x60984]

装备存在 cooldown 属性时，新加入的技能再 -1；Cunning 仅给第四个新加入技能再 -1，升级已有技能不会再次扣减（模板已经含旧修正）。装备 cooldown 属性由无到有/有到无时，所有现有技能统一 -1/+1 并钳充能。Wish 基础冷却=-1，是单次技能，施放后 RemoveSkill。[证据：SetSkill @0x2be04；UpdateStats @0x26c94；Activate case 33；RemoveSkill @0x24eec]

输入层要求 charge==cooldown 且 CanActivate，再调用 Activate；成功后 charge 为 0（负冷却保持该负值），不直接 EndOfTurn。每个 EndOfTurn：场上无 Mage 时 charge+1、钳 cooldown；不论有无 Mage 均 Deactivate。法力 token +1；Changeling 随机一个已装备槽直接充满，允许抽到已满槽。[证据：Interface::ProcessInput @0x49738；EndOfTurn @0x3289c；AddResource @0x32210；Shapeshift @0x24f78]

CanActivate 的目标门槛：0/1/4/34 要有骷髅；2/8/9/29 要有普通药水；3 要盾；5/14/23 要普通骷髅；6/13 要剑；20/21 要特殊敌人；25/31 要普通剑；27 要骷髅且当前护甲>0；36 要普通骷髅且金币；12/15/32 要金币；其余默认 true。该函数不检查充能。[证据：Skill::CanActivate @0x60100；无参重载 @0x60204]

法力 token 在创建时用 Interface::GetSpecialTarget 构造已装备槽索引的升序 set：排除 Mana Potion=29 本身、排除 charge==cooldown 的槽；有候选才 `R(0,n−1,5)`，无候选返回−1并隐藏该 token，不变成普通治疗。目标在创建时绑定，不能等到到达时才重新抽取。[证据：Interface::GetSpecialTarget(Token*) @0x4b254；Token::InitialiseFromTile @0x653d0；到达竞争仍见02 C2]

## 全部原生技能分发

下表 CD 是基础冷却；所有数值效果不随等级增长。收集函数默认用 MatchTile(...,5)，即按原类型发奖；7 表示无奖。多个函数立即 MoveMatchedTiles，不能把所有技能统一延后到回合末。普通手动施放时清补盘产生的新格标记；若 `14d94=1`（连线已提交，奖励菜单内）则保留，使本轮新敌人不参加普通攻击。[证据：Activate @0x60210；各行函数；ProcessInput @0x330c0 写 14d94；EndOfTurn 清 14d94]

| ID / 技能 | CD | 效果和具体来源 |
| --- | ---: | --- |
| 0 Steal | 13 | 置 c383；每个直接 AttackSkull 调用先发 1 金币 token，甚至本次伤害未穿甲；命匣早退除外。AttackSkull @0x2f630 |
| 1 Freeze | 16 | FreezeSkulls @0x29eb0：全盘骷髅冻结，本次普通攻击跳过，EndOfTurn 解冻；不屏蔽全部特殊能力 |
| 2 Heal | 15 | GrabTiles(0,0) @0x30e40：收集全部普通治疗药水，不含爆炸/法力/酸药 |
| 3 Repair | 16 | GrabTiles(3,3)：全盘盾；破盾仍按 MatchTile 的无奖励分支 |
| 4 Counterattack | 18 | 置 c382；DoCounterattack @0x30f38：每只旧骷髅以自身 GetAttack 攻击自己（走 AttackSkull(false)，防御仍有效）；替代普通敌攻 |
| 5 Shatter | 18 | ShatterDefence @0x28554：仅普通骷髅，防御置 0，攻击大于 1 才降为 1 |
| 6 Golden Touch | 15 | ConvertTiles(4,2) @0x2a440：剑变金币，跳过箭头 |
| 7 Teleport | 20 | Teleport @0x2ffb4：无奖励清盘、排除骷髅重填；见 01 |
| 8 Explosive Potion | 18 | CreateExplosivePotions @0x29df4：所有普通药水变爆炸药水；匹配时收集八邻域非骷髅，见 02 |
| 9 Skill Elixir | 18 | GrabTiles(0,1)：全部普通治疗药水按 XP 收集 |
| 10 Enchant | 35 | Upgrade @0x251d4：立即开启四选一强化菜单 |
| 11 Slash | 12 | CollectRandomRow @0x30c8c：R(0,5,5) 一行；跳过特殊敌人，酸药无奖；若本轮已有 Hack 则改 CollectBoard |
| 12 Treasure | 18 | GrabTiles(2,2)：全盘金币 |
| 13 Scavenge | 15 | ConvertTiles(4,3)：剑变盾，跳过箭头 |
| 14 Disarm | 25 | ConvertTiles(1,4)：仅普通骷髅变剑 |
| 15 Dazzle | 15 | ConvertTiles(2,4)：金币变剑 |
| 16 Boost Damage | 14 | 置 c234：每把剑 W 加成翻倍，基础 B 不翻倍；ProcessTileSelection @0x2c8dc |
| 17 Boost Gold | 15 | 置 c237：金币 token 基础量和小数附加量翻倍；AddResource @0x32210 |
| 18 Boost Health | 15 | 置 c236：普通治疗药水治疗翻倍；法力、酸药不翻倍；AddResource |
| 19 Boost Armour | 15 | 置 c235：修甲和转 UP 的基础/小数奖励翻倍；AddResource |
| 20 Exorcise | 18 | DemoteSpecialEnemy @0x2a34c：R(0,N-1,5)，列优先选一个特殊敌人；enemy=0,countdown=0，保留攻击/防御/HP |
| 21 Banish | 20 | KillSpecialEnemy @0x30178：同样抽一个特殊敌人，MatchTile(...,7)，无奖励，不走巫妖变命匣 |
| 22 Trap | 18 | 置 1433d；RandomiseTile @0x2d584 将新骷髅当前 HP 置 1（含特殊），不改其最大 HP |
| 23 Big Game Hunter | 15 | PromoteNormalEnemy @0x2d454：R(0,N-1,5)，列优先选普通骷髅晋升；晋升消耗 TILE RNG，保留自然晋升计时，设置 26d |
| 24 Treasure Chamber | 25 | 置 1433e；新格强制金币，但过滤重填、CollectBoard 和 Sprint 到期强制骷髅有优先规则，见 01/本文状态表 |
| 25 Magic Sword | 14 | CreateMagicSword @0x2a1cc：R(0,N-1,5)，列优先选一个非魔法非箭头剑；变魔法剑，每剑 W×5，可叠 Boost Damage 成×10；ProcessTileSelection |
| 26 Earthquake | 12 | Earthquake @0x2a2ac：x 外 y 内扫描 36 格，每格独立 R(0,5,5) 选 x、再选 y 并 SwapTiles；72 次 OTHER 抽样，非均匀 Fisher–Yates |
| 27 Explosive Armour | 16 | ExplodeArmour @0x31050：全盘骷髅各 AttackSkull(2×当前甲,false)，随后补盘；不消耗护甲，不无视敌甲 |
| 28 Fireball | 14 | CollectRandomBlock @0x30554：先 R(1,4,5) 抽中心 y，再抽 x，收集 3×3；x 外 y 内；跳过特殊敌人，酸药无奖 |
| 29 Mana Potion | 20 | CreateManaPotions @0x29f74：所有普通治疗药水变法力药，每 token +1 充能；有效目标过滤见 Token::InitialiseFromTile @0x653d0 |
| 30 Hack | 24 | ConvertColumnToSwords @0x30b88：R(0,5,5) 抽一列，非特殊敌人格变剑；若本轮已有 Slash 则 CollectBoard；两标志同时清零 |
| 31 Volley | 15 | CreateArrows @0x2a108：全部普通剑（非魔法、非箭头）变箭；连线跳格规则见 02 |
| 32 Masochism | 15 | ConvertTiles(2,1)：全部金币变骷髅，经 SetType 生成数值并可能晋升；置 15e18 成就组合标志 |
| 33 Wish | -1 | CollectBoard @0x30a2c：收集全部非特殊敌人格，施放后移除本技能；全盘收集期间禁止 Treasure Chamber 强制金币 |
| 34 Berserk | 14 | 置 15cef；ProcessInput @0x330c0 将本次 AttackSkull 击杀累计的 GetAttack 之和加 HP、钳最大值；不按技能等级倍增 |
| 35 Rune | 12 | 置 15cd9；ProcessRune @0x2b560 的逐行奇偶扫描，详见下一节 |
| 36 Greed | 25 | KillSkullsNextToCoins @0x306fc：普通骷髅若八邻格存在金币则直接 MatchTile(5)；特殊敌人不受影响 |
| 37 Last Stand | 35 | 置 15cec；CheckEndGame @0x2f960 在 HP≤0 时回满，清当前/后继保护；不会自动清玩家毒 |
| 38 Charge | 18 | CollectEdgeTiles @0x308c8：收集 x=0/5 或 y=0/5 的非特殊敌人格；注意该函数酸药用 5，不像 Slash/Fireball 用 7 |
| 39 Haste | 16 | CreateChain @0x2a038：最多 10 组 R(0,5,5) 坐标尝试，跳过特殊敌人，成功制造一个 Chain；见 01 |
| 40 Shock | 14 | Shock @0x30404：收集 y=0..2 的盾和金币，置 15e72；若 15e73 已置，再 CreateChain；正常不可获得 |
| 41 Awe | 14 | Awe @0x302bc：收集 y=3..5 的盾和药水，置 15e73；若 15e72 已置，再 CreateChain；正常不可获得 |

## Rune 的离散扫描（关闭 T01 C1 的静态规则部分）

坐标原点在左上。激活技能 35 置 Game+15cd9。必须节点数>3 且首尾横、纵坐标差各≤1；首尾无需重复同一格。扫描 y=1…4，每行 x=0…4，inside 初值 false。对已选格，找它在链中的前后节点，首尾按循环链相接。设当前为 (x,y)、前节点 p、后节点 n，仅在下式为真时翻转 inside：[证据：ProcessRune @0x2b560，LAB_0002b75c]

```text
((n.y != y || p.y != y) || (x == n.x || x == p.x))
&& (n.y < y || p.y < y)
&& (y <= n.y || y <= p.y)
```

未选格且 inside=true 时，向右寻找任意一个已选格；直到 x=5 仍找不到则结束这一行。找到后，预览计数按 `min(tileType,5)` 增加；预览模式画高亮，包括特殊敌人。真正执行模式只对非特殊敌人格调用 MatchTile(5)，普通骷髅直接收集。执行收集数大于 `链节点数−箭头忽略格数` 时触发 Runemaster。函数本身不调用 MoveMatchedTiles。[证据：ProcessRune 的 LAB_0002b60a、LAB_0002b67e、末段 QueueAchievement(0x3a)]

可直接转为用例的形状（下列路径均首尾邻接，所列内部格须未被链选中）：

- 3×3 方框：链 `(1,1),(2,1),(3,1),(3,2),(3,3),(2,3),(1,3),(1,2)` 仅收集中心 `(2,2)`。
- 贴棋盘边界的 20 格外圈：收集 x=1…4、y=1…4 的 16 格；特殊敌人格除外。
- 四顶点菱形 `(2,1),(3,2),(2,3),(1,2)` 收集 `(2,2)`。
- 自交小结 `(1,1),(2,2),(1,2),(2,1)` 不收集任何内部格；交叉不额外创造“顶点”。

这些是上述扫描式的静态推导，不是已运行原版的录像结果；箭头跨越未选中的交点不会自动翻转 inside。不能用通用多边形填充替代。与动画/菜单到达时序有关的 T01 C2/C3 仍需原生运行对照。

## 临时状态的写入、消费与轮换

以下列规则层暂态；地址均为对象内偏移，不是函数地址。Skill::Activate 对有 current/next 的效果写 `current=1,next=Game+14d94`。14d94 在连线提交后为 1，EndOfTurn 尾部清零。因此正常输入前施放只覆盖当前行动；在已提交行动的奖励菜单中获得并施放的卷轴可保留到下一行动。不是按技能等级持续若干回合。[证据：Activate @0x60210；ProcessInput @0x330c0；EndOfTurn @0x3289c]

| current / next | 写入者 | 消费者 | EndOfTurn 生命周期 |
| --- | --- | --- | --- |
| c234…c237 / c238…c23b | Activate 16/19/18/17；依次剑、盾、药、金 | ProcessTileSelection；AddResource | 技能充能后 current=next，next=0 |
| c383 / c384 | Activate 0 | AttackSkull 直接攻击偷金 | 同上 |
| c382（无 next） | Activate 4 | ProcessInput / DoCounterattack | 技能充能后直接清零 |
| 1433d / 1433f | Activate 22 | RandomiseTile 新骷髅 HP=1 | **最后一次补盘之后** current=next,next=0 |
| 1433e / 14340 | Activate 24 | RandomiseTile 强制金币 | 同 Trap，当前标记参与本轮末补盘 |
| 15cd9 / 15cda | Activate 35 | ProcessRune、连线预览色 | 充能后 current 为真且 next 为假才清 current；next 清零 |
| 15cef / 15cf0 | Activate 34 | ProcessInput 击杀后治疗，累计量 15cf4 来自 AttackSkull | 充能后 current=next,next=0；15cf4 每次提交重置 |
| 15cec / 15ced，延迟 15cee | Activate 37 | CheckEndGame；AddResource 投掷骷髅分支 | 能力阶段后 delayed=current,current=next,next=0；触发救命清 current/next；迟到投掷 token 可借 delayed 再检查一次 |
| 14da9 / 14daa | Hack / Slash | 两者组合调用 CollectBoard 并清零 | 充能后清零 |
| 15e72 / 15e73 | Shock / Awe | 另一半已置时 CreateChain | 充能后清零 |
| 15e18…15e1c | Masochism、Slash、Fireball、Charge、CollectBoard | 击杀成就、CheckShockAwe | 充能后清零 |
| 14dab | CollectBoard 进入置 1、退出置 0 | RandomiseTile 跳过 Treasure Chamber 的金币强制 | **函数作用域**，非跨回合标志；新局/构造清零 |
| c380 / c381 | InitNewGame、Teleport、TeleportEnemy | RandomiseTile 排除骷髅或剑 | 本轮末补盘后清零；Teleport 自身也管理重填范围 |
| 1433c | 初始 1，PromoteNormalEnemy 暂置 0 再恢复 | Tile::Promote 是否重置自然晋升计时 | 非持续技能；BGH 函数恢复旧计时 |
| 14d94 | 提交连线置 1 | 技能 next 标记赋值与技能补盘 new 标记清除策略 | EndOfTurn 尾部清零 |

表中证据除 Activate/EndOfTurn 外：RandomiseTile @0x2d584；CollectBoard @0x30a2c；PromoteNormalEnemy @0x2d454；CheckEndGame @0x2f960；AddResource @0x32210；CheckShockAwe @0x28318。

Tile 暂态不能丢失：88=matched（MatchTile 写，补盘重置），89=selected（输入增删链写），8a=new（SetType/补盘写，提交后和回合末清，技能视14d94清）；240/241/242/243/244=魔法剑/箭/法力/酸/爆炸变体；264=abilityUsed（ActivateAbility 写，回合末能力遍历前全清，随 SwapTiles 移动）；265=冰冻、266=火焰、267=火焰不伤玩家、268=火伤量（冻结/点燃相互清除，回合末解冻或烧伤后清）；26c=破损、26d=BGH 标记、26e=巫妖首轮延迟（转命匣写，首次能力只清延迟）。毒队列 248/24c/250 每回合左移补 0。变体/破损/BGH 随该格保留到重设类型或专门清除，不是每回合一律清空。[证据：Tile::SetType、SetFreezeVisibility @0x62e94、SetFlameVisibility @0x62de8、ActivateAbility @0x64c78、GetPoison @0x62b0c；02 的回合顺序]

Skill+80 是“本次已激活”的显示/输入状态，部分 Activate 分支写1，Deactivate 清0；它与 Game 上实际持续效果分离。Game+c240 表示链中已计入基础B，14a14 表示链含Spiky，14a15/146a0 表示尖刺/火伤标签待到达；选择/回退重算前两项，Process消费后两项，不能随一次UI重绘清空。[证据：Skill::Activate/Deactivate；ProcessTileSelection @0x2c8dc；ProcessInput @0x330c0；Process @0x339ac]

计数/阶段也需显式状态：五类本链收集数 c36c…c37c、14d88 玩家毒、本次直接击杀计数 14d90、链忽略格集合 b794、待发 token/待结算直伤及菜单队列不能合并成布尔“回合完成”。142f4/142f5 为音效去重，c224 为装备派生 cooldown 存在标记，均不是技能持续轮数。[证据：MatchTiles @0x31bcc；ProcessInput @0x330c0；Process @0x339ac；UpdateStats @0x26c94]

## Shock / Awe 可达性与未决问题

**T01 O1 已关闭（本版本正常新局路径）**：42 个原生槽中 40/41 有名称、CD、Activate 分发和存档读取支持，但所有职业的基础 vector 只含 0…39。IsSkillUnlocked 对 <31 返回真，对 31…41 只在某非初始职业的首技能等于该 ID 且职业等级==10 时返回真；九个首技能恰为 31…39。Adventurer 池、替换技能 UI（ClassScreen::UpdateAbilities / Process）和商店卷轴都检查该函数。因此正常流程无法获得 Shock/Awe；不能为 wrapper 杜撰两个枚举名。Skill::Deserialise 可读这些 ID，不能据此证明旧版曾正常发放过。[证据：IsSkillUnlocked @0x248e8；CharacterClass::Initialise @0x36524、GetSkillPool @0x3707c；ClassScreen::UpdateAbilities @0x37670 / Process @0x3a598；Skill::Deserialise @0x5ffb0]

**T01 B3 已关闭**：14dab 只在 CollectBoard 扫描与补盘期间为 1，屏蔽强制金币，没有独立倒计时。**C1 静态算法/写入与轮换已关闭**，复杂组合的运行验证仍属 C2/C3。商店卷轴候选的一段成员内存判断尚未赋予可靠业务名称，详见 04 的 I1；不把它暗改成“排除已持有技能”。

## U11：升级候选的原版信息展示

- `Skill::Initialise(StatType) @0x606a4` 生成实际效果的前后值：力量→基础伤害/额外经验概率，敏捷→每盾护甲/额外盾牌概率，体质→最大生命/额外药水概率，幸运→每瓶药水生命/额外钱币概率。额外伤害、修复、生命分别展示对应效果；魅力展示四项概率。
- 此处比较的是基础属性字段（如 Game+c180、c1d0、c15c、c1c8），不混入装备加成。`Skill::SetStatChance @0x5ff50` 输出 `%s%d%% >> %d%%`，达到100%时显示100%；椒盐卷饼挑战的体质不显示生命增量。
- `FoldoutMenu::Initialise @0x42794` 逐行 AddLabel(GetStats)，不是只显示“属性+1”。`Skill::Initialise(SkillType,Skill*) @0x60984` 对新技能显示 `Cooldown: %d`，已有技能显示 `Cooldown: %d>>%d`，负冷却不显示。
- U11 UI恢复这些文案和数值。候选行保留短摘要，点击查看完整说明；魅力四项概率不因摘要行数限制丢失。没有修改升级结果、概率或技能冷却规则。

## U12：属性项目“+5%”的确切含义

- Skill::GetStatChance @0x5ff0c 返回5；属性升级对应额外奖励概率增加5个百分点，例如20%→25%，不是乘以1.05。力量对应经验、敏捷对应盾牌、体质对应药水、幸运对应钱币；魅力四项各增加5个百分点。基础概率上限100%，装备属性贡献另外累加。
- MatchTile @0x2ac40：同回合同类结算计数小于4时不作额外奖励抽签；第4个及以后每次以 RandI(1,100,RAND_OTHER=5) <= 基础概率+装备概率 判断，成功再AddToken一次。不改变棋盘生成概率，不让整条连线统一翻倍。
- 一般例子：收集4枚普通钱币、额外钱币概率25%，前三枚各正常结算，第4枚有25%概率额外结算一次钱币。连接5枚时第4和第5枚分别判定。经验基于骷髅结算计数，剑本身不产生经验；特殊敌人的固定奖励走单独分支。法力/酸液/爆炸药水也有专门分支，不套普通药水的额外奖励逻辑。Daring在同类计数>=10时覆盖概率为100%（同函数常量10）。
- 额外的是一份资源令牌。AddResource @0x32210：普通钱币/经验令牌基础2点，再应用装备每格加成和模式等修正；药水再按每瓶治疗量治疗一次；盾牌先修复护甲，护甲已满才提供强化点（另有腐蚀等特殊规则）。因此额外盾牌并不总是额外强化点。
- 与装备“每个骷髅/钱币/盾牌+0.25收益”不同：后者是收益数值，不是上述概率；与吸血率、破甲率等其他百分比也不可混同。
