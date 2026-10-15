# 04 装备、商店与强化（T02）

完整名称、原文描述、字符串文件偏移、槽位属性池和图标范围见 [items.json](../../data/items.json)。JSON 由 tools/extract-t02.py 只读 ELF/伪 C 生成。UpgradeType 是原生整数 0…19，不是 wrapper 的 StatType，不给它伪造 Java 枚举名。[证据：ItemUpgrade::InitStats @0x51ae4；Item::GenerateStats @0x50ee4]

## 槽位、初始装备与数据单位

| ItemType | 初始非零属性 | 图标闭区间 | 强化基础池（原生属性 ID，每项等权） |
| --- | --- | --- | --- |
| 0 Weapon | 0:2 | 0…79 | 0,1,2,3,4,6,8,9 |
| 1 Helmet | 11:1 | 80…159 | 6,7,10,11,12,13,17 |
| 2 Armour | 11:2；Slim 时为 1 | 240…319 | 10,11,12,14,15,17,18,19 |
| 3 Shield | 11:1 | 160…239 | 0,1,11,12,13,15,16 |
| 4 Accessory | 10:10；Pretzel 为 0 | 320…399 | 5,8,9,10,17,18,19 |

证据：Item::GenerateStats @0x50ee4 的旧装备空指针分支；Initialise @0x4c0ec 的 g_*Range；ItemUpgrade::GetRandomStat @0x51db8。普通无特性新局因而 W=2、B=3、最大/当前护甲=4、最大/当前 HP=50（基础40+饰品10）；属性 STR/DEX/VIT/LUK=1 不在 UpdateStats 中再换算一次初始基础值。[证据：InitNewGame @0x2d7a4；UpdateStats @0x26c94]

## 20 项属性如何汇总

每项在 Item+94+4×ID 存 int32；通常为非负整数。下表中的 sum 是五件装备之和。B/W 与 02 完全同义。[全表证据：UpdateStats @0x26c94；GetFloatValue @0x5179c；消费者见末列]

| ID | 语义 | 汇总与消费 |
| --- | --- | --- |
| 0 | 武器伤害 | W=sum(0)，每把剑贡献 W；魔法剑×5；ProcessTileSelection |
| 1 | 基础伤害 | B 的装备附加部分 +sum(1) |
| 2 | 吸血百分比 | sum(2)/100×链预览 D，截断后治疗；不是逐敌实际伤害比例 |
| 3 | 毒 | 直接攻击幸存敌人，三个毒槽各 +sum(3)；Poisonous 免疫；AttackSkull |
| 4 | 穿甲 | 阈值=min(95,50+sum(4))；Cautious 起点30；逐点 R(0,100,5)<阈值 |
| 5 | 冷却 | **存在性布尔** any(stat>0)，不是数值求和；从无到有现有技能 CD−1，消失时+1；新技能见03 |
| 6 | XP 收益 | xpBonus=min(2.0,0.25×sum(6))；进入 token 小数累加槽 |
| 7 | 金币收益 | goldBonus=min(2.0,0.25×sum(7))；同上 |
| 8 | STR | 附加 STR=sum(8)，B+sum(8)，XP 额外 token 概率 +5×sum(8) 百分点 |
| 9 | LUK | 附加 LUK=sum(9)，每药治疗+sum(9)，金币额外 token 概率+5×sum(9) |
| 10 | 最大 HP | 最大 HP+sum(10)；Pretzel 不加 |
| 11 | 最大护甲 | maxArmour=sum(11) |
| 12 | 反伤 | spikes=sum(12)，格挡阶段对各旧骷髅 AttackSkull(spikes,false)，敌防御仍生效 |
| 13 | UP 收益 | upBonus=min(2.0,0.25×sum(13))；修甲 token 不使用，转 UP 才用 |
| 14 | 耐久 | breakThreshold=max(5,50−sum(14))；Defiler 短路为每点必损 |
| 15 | 削弱 | weaken=sum(15)，格挡阶段旧骷髅攻击减此值，最低1 |
| 16 | 修甲 | 每盾修复+sum(16)，不直接提高护甲上限 |
| 17 | 再生 | regen=sum(17)，EndOfTurn 玩家毒之前治疗并钳最大 HP |
| 18 | DEX | 附加 DEX=sum(18)，每盾修复+sum(18)，盾额外 token 概率+5×sum(18) |
| 19 | VIT | 附加 VIT=sum(19)，HP+5×sum(19)（Pretzel不加），药水额外 token 概率+5×sum(19) |

基础四种 bonus 概率选择奖励时钳100；装备增加部分独立保留，MatchTile 用相加后的阈值。收益属性 6/7/13 的“25%”实际增加每 token 的 0.25 点小数收益，不能把默认 2 点乘 1.25；Sprint 与 boost 对基础/小数的乘法见 02。[证据：GetFloatValue @0x5179c；AddResource @0x32210；MatchTile @0x2ac40]

换装/降级重算时：HP 附加上限增加则当前 HP 同增差额；上限降低只将当前 HP 钳到新上限。当前护甲保持原有缺口：`max(0,newMax−(oldMax−oldCurrent))`。不能一律回满，也不能把失去最大 HP 一律作为等量伤害。[证据：UpdateStats @0x26c94]

## 强化抽样、门槛与步长

四个强化候选的槽抽样见03。每件候选在它的升序 set 池中等权选一项；属性权重均 1，过滤后重新等权。[证据：ItemUpgrade::Initialise @0x523c8；GetRandomStat @0x51db8]

过滤顺序影响 RNG：不允许冷却时移除5；非 Sprint 总会先作 `R(0,totalWeaken,4)`，非零才移除15（即使该槽原来没有15，也消费此抽样）；Sprint 直接移除15，不作该抽样。再检查 10/2/6/13/7/14/4 的资格，最终 `R(0,n−1,4)` 按升序索引取项。[证据：GetRandomStat @0x51db8]

| 属性 | IsUpgradeAllowed 门槛 | 一次增量 | 一次降量 |
| --- | --- | --- | --- |
| 2 吸血 | 全装总量<25 | 总量<15:5；15…20:3；≥21:2 | 总量<18:5；18…22:3；≥23:2 |
| 4 穿甲 | 当前总穿甲<95 | 10 | 10 |
| 6/7/13 收益 | 对应派生小数 bonus<2.0 | 1（=0.25） | 1 |
| 10 HP | 非 Pretzel | 10（Pretzel 0） | 同增量 |
| 14 耐久 | `100−min(breakThreshold,100)<90` | 令 d=100−breakThreshold；d≤69:10，70…79:5，80…85:3，≥86:2 | d≤74:10，75…82:5，83…87:3，≥88:2 |
| 3 毒 | 无额外门槛 | 2 | 2 |
| 17 再生 | 无额外门槛 | Faithful 为2，否则1 | 同增量 |
| 其余 | 无上述门槛；5另受 allowCooldown | 1 | 1 |

证据：IsUpgradeAllowed @0x517b8；GetStatUpgrade @0x51888；GetStatDowngrade @0x5193c。耐久异常 breakThreshold>100 时退回10。门槛检查的是**当前派生总量**，不是将下一次增量裁到门槛；例如24吸血可加2到26。IncreaseStat/ReduceStat 各加/减上述步长后最低钳0，再 MakeStats。Devourer 也调用 ReduceStat，T01 的“减1”已更正。[证据：Item::IncreaseStat @0x4dbb8；ReduceStat @0x4dbe0；DestroyUpgrade @0x2ecb8]

## 商店装备生成

每件候选先随机图标，再生成名字，最后按旧装备生成属性；三件候选的整个生成过程交织在抽槽之间。图标/名称/概率使用 ITEM=2；饰品选择新增属性时调用 GetRandomStat，另消费 UPGRADE=4。不得让“只改变显示名称”悄悄改变同一路后续属性抽样。[证据：Item::Initialise(Item*) @0x515f8；GenerateName @0x4c35c；GenerateStats @0x50ee4]

生成前清全部属性，旧装备正值属性组成升序 set。以下概率均为 `Rand(0,1,2)<p`；每个旧属性单独抽样，没有提到的分支不补抽随机数。[全表证据：GenerateStats @0x50ee4]

| 槽 | 主属性 | 其余旧正值属性的转移 |
| --- | --- | --- |
| Weapon | 0=old0+1，从集合去掉0 | 每项15%减降级步长、钳0，并再给0加1；否则原值复制 |
| Helmet | 11=old11+1，去掉11 | 每项20%进入改变分支：若允许升级、此前未升级过其他项且第二抽<50%，该项加升级步长并记已升级；否则该项减降级步长、甲+1；未进入则复制 |
| Armour | 首抽20%：11=old11+2，其余全复制 | 首抽未中：11=old11+1；每项10%降级并甲+1，否则复制 |
| Shield | 11=old11+1，去掉11 | 对属性0：70%降级并甲+1。其余各20%降级；降级后另抽20%给武器伤害0+1，否则甲+1；没降级则复制 |
| Accessory | 10=old10+GetStatUpgrade(10)/2，去掉10 | 每项10%降级，再 GetRandomStat(Accessory,false) 并加一步；否则复制。末尾 Pretzel 必加一随机属性，其他模式50%加；此次 allowCooldown 取决于新饰品5是否为0 |

必须保留升序逐项赋值：饰品中早先随机加到尚未遍历的属性，之后的 `new[i]=old[i]` 可以覆盖该增量，不应改写成“复制完再统一施加变动”。生成不保证每个单项只升不降；名称也不编码属性品质。

名字结构是 `prefix + "  " + suffix`（两个空格）。初始 prefixAnchor/displayPrefix 都为−1，显示 Novice。共有148个有序词缀：旧 anchor<N−12 时新 anchor/display 都抽 `[old+1,old+10]`；否则 anchor 保留，display 抽 `[oldAnchor,N−1]`。再根据图标范围选名词表中的一个索引，每条等权，保留重复拼写。数据包含13组名词和1组词缀的原始序列；不是按字符串去重后的集合。[证据：GenerateName @0x4c35c；InitialiseNames @0x4dc24；items.json 的 names/nameMappings]

商店额外卷轴：通常25%概率，Sauren 为50%（浮点 ITEM 抽样）。成功后随机选三个按钮之一附上卷轴，再抽一次决定是否走10%的候选过滤豁免。遍历原生 ID 0…41，排除 Wish，Pretzel 另排除 Treasure Chamber；要求 IsSkillUnlocked 和 CanActivate；其余过滤见 I1。最终用 ITEM 随机选择一个候选并 Initialise。购买先 SetItem、UpdateStats，再直接 Skill::Activate；不装备该技能，也不经 Interface 的 Dragonkin 手动施放钩子。[证据：FoldoutMenu::Initialise @0x42794；Process @0x41fc4；Interface::ProcessInput @0x49738]

## 未决问题

- **I1 卷轴过滤的内存含义**：伪 C 在10%豁免外检查 `*(int*)(game+(skillId+0x30d6)*4)==0`，即 `game+c358+4*skillId`，并非遍历四个已装备 Skill 对象。汇编 @0x331e6…0x331f0 已独立确认 `r2=skillId+0x30d6; ldr [game,r2,lsl#2]; cbz`。这超出四技能指针数组，随 ID 访问后续计数/标志等内存；尚不能赋予统一业务名称或认定意图是“已有技能除外”。P2应隔离为待定兼容策略，取得原版固定状态商店样例/完整相邻布局后再决定如何复现，不擅自按文字意图替代。
- **I2 已关闭**：数据校验发现 g_accessoriesRange 的上界为399，回查汇编补全伪 C 丢失的最后一项：Potion名词表映射图标 `[380,400)`，它属于饰品外观。disasm @0x3f19e…0x3f1b6 在Rune映射后以r8作vector、r6=0x17c作下界、r3=0x190作上界，传给mapping插入函数；@0x3efaa…0x3f0a0 的r8是连续16个Potion名词的接收vector。JSON现覆盖0…399全部图标。
- 商店 float32 分支与完整初始 RNG 轨迹仍受 T01 B1/B2 的初始化问题约束；这里证明候选生成顺序，不宣称与原版种子 golden trace 已对齐。
