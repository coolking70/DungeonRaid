# 07 P2 行为用例清单（T02）

本文件是待实现的 Vitest 行为清单，**不是已经通过的游戏测试**。每行独立 fixture；默认 Classic/Normal、无未列特性、技能、其他特殊敌人，随机值由按路队列注入，指定阶段以外不推进动画/敌攻/回合末。坐标左上(0,0)。期望写“token”时断言事件生成，写“入账”时显式消费事件，避免把两阶段混在一起。float32、含端点 RandI 和遍历顺序遵守01。原生证据编号/地址随行给出。

## 连线、战斗、资源与阶段

| ID | 前置状态 | 操作 | 期望 | 证据 |
| --- | --- | --- | --- | --- |
| C01 | 三金币八邻接，未冻结 | 按顺序连线并提交 | 三格收集，进入一次敌方回合 | CanMatchType @0x645ac；ProcessInput @0x330c0 |
| C02 | 仅两金币 | 连线松手 | 清选择，无资源、无普通敌方回合 | ProcessInput 有效长度>2 |
| C03 | 链A,B,C,D | 重新触到B | 链回退至A,B，C,D贡献与selected清除 | ProcessTileSelection @0x2c8dc |
| C04 | 普通药水冻结；普通骷髅冻结 | 分别尝试首选 | 药水拒绝，骷髅允许 | CanMatchType |
| C05 | 箭头剑A，中间金币B，远端骷髅C | A→B→C，提交 | B为忽略格，有效长度2，不完成普通链；增加第四有效格后B仍不收集 | CanMatchType；ProcessInput |
| C06 | 活巫妖与命匣各一个 | 分别接剑/金币 | 活体接剑；命匣接金币，不接普通剑 | CanMatchType enemy32/countdown |
| C07 | Cocky，恰3金币 | 提交 | 消除但无奖励，仍进入回合 | MatchTiles @0x31bcc |
| C08 | Cocky，剑/剑/可杀骷髅 | 提交 | 击杀仍产生XP，非“整链无收益” | MatchTiles；AttackSkull @0x2f630 |
| C09 | B3,W2，普通剑+魔法剑+两骷髅 | 预览/提交 | D=15，两敌各受整份15；不是分配15 | ProcessTileSelection；MatchTiles |
| C10 | C09且BoostDamage | 预览 | D=27，基础3不翻倍 | ProcessTileSelection |
| C11 | B3,W2，一把破剑、一活骷髅 | 计算贡献 | 破剑贡献0，基础贡献3；不足三格仍不能提交 | ProcessTileSelection |
| C12 | 敌E5,H20，传入d7；破甲抽值均100 | AttackSkull | H18，E5；先挡甲后破甲 | AttackSkull |
| C13 | 敌E5,H20,d3，pierce50，抽49/50/100 | AttackSkull | H20，E4，恰三抽；50不成功 | AttackSkull，R(0,100,5)<50 |
| C14 | 普通敌E0,H1,d1，装备毒2 | 直接攻击 | 击杀；不再消费破甲/上毒/Orc抽样 | AttackSkull早退 |
| C15 | 敌E5,H10,d0，武器毒2 | 直接攻击未死敌 | H不减，三个毒槽各+2 | AttackSkull；AddPoison @0x62ad4 |
| C16 | D15，吸血20%，敌甲100 | 提交有效攻击链并消费吸血事件 | 治疗3，即使实际敌HP损失0 | ProcessTileSelection；Process @0x339ac |
| C17 | 汇总敌攻8，当前甲5，破损三次成功 | 普通攻击结算 | HP−3，当前甲2；不是后续敌人利用已经磨掉的甲追加伤害 | ProcessAttack @0x311b8 |
| C18 | 上轮玩家毒4，本轮毒攻2全部格挡 | 普通攻击 | 不增加持续毒，原4仍保留 | ProcessAttack |
| C19 | 上轮毒4，本轮毒攻7且穿透 | 普通攻击 | 持续毒变7，不是11 | ProcessAttack |
| C20 | 当前甲3/5，修甲3，两个盾token | 顺序消费 | 第一修到5且溢出丢失，第二转UP+2 | AddResource @0x32210 |
| C21 | xpCarry0，xpBonus0.25，普通模式 | 消费4个XP token | XP总增加9，carry0；不是每token2.5 | AddResource |
| C22 | XP条98，等级1 | 消费普通XP token | XP累计+100，余0，等级2，菜单0一次；基础属性未自动加 | AddResource |
| C23 | 金币/UP条各98，甲已满 | 各消费一个对应token | 分别菜单1/2，累计各+100 | AddResource |
| C24 | 测试专用异常大carry使单token入账跨两百 | 消费该token | 只累计100、排一个菜单、余数%100；不循环发菜单 | AddResource单if |
| C25 | 同类型计数3，bonus20，OTHER下次20 | 收集第4个普通格 | 基础token外再发一个；计数前三不作bonus抽样 | MatchTile @0x2ac40 |
| C26 | Daring，混合链总长10但金币计数5 | 收集金币 | 不因总长10直接保证额外token | MatchTile的每类型计数 |
| C27 | 旧冻结骷髅/本轮新骷髅/旧普通骷髅各一 | CountAttackers | 只计旧普通且GetAttack>0者 | CountAttackers @0x24e2c |
| C28 | HP10,max20,regen3,poison4 | 只推进玩家回合末治疗/毒阶段 | 先13再9 | EndOfTurn @0x3289c |
| C29 | 敌毒队列[2,3,4]，HP20 | 推进敌人毒阶段 | HP18，队列[3,4,0] | GetPoison @0x62b0c；EndOfTurn |
| C30 | 当前技能充能4/CD10，有Mage | 回合末 | 不自然+1，但技能Deactivate仍发生 | EndOfTurn |

## 全部32种特殊敌人

每行至少锁定一个独有分支，生成倍率另从01构造参数化用例。涉及随机选目标时注入最小索引，另加边界索引参数化，保留集合顺序。

| ID / EnemyType | 前置状态 | 操作 | 期望 | 证据 |
| --- | --- | --- | --- | --- |
| E01 Boss | 固定其A/D/H的旧Boss，无其他能力 | 调ActivateAbility | 不凭空生成Boss主动技能；其普通攻击照A结算 | ActivateAbility @0x64c78无case1；GenerateStats @0x63098 |
| E02 Spiky | 有效链含两个Spiky，D10 | 提交并结算尖刺 | 玩家只受一份10直伤，不是20，甲不抵挡 | ProcessTileSelection @0x2c8dc；Process |
| E03 Golden | 倒计时1 | 能力阶段 | 计时0，无奖励消除并补盘 | ActivateAbility；RunAwayEnemy @0x300d4 |
| E04 Healer | 两个其他受伤骷髅 | 能力阶段 | 两者都回到各自最大HP；无伤者分支改最多两者攻击+1 | HealOrBless @0x34740/@0x34614 |
| E05 Invisible | Halfling宿敌，Invisible在场 | 生成一个普通骷髅 | 其防御为同fixture无Invisible时的2倍 | GenerateStats @0x63098 |
| E06 Acidic | 唯一普通药水，另有法力药 | 能力阶段 | 普通药变酸，法力药不入候选 | MakeAcidPotion @0x2ea40 |
| E07 Flaming | 攻击3，八邻有普通格和Flaming | 能力阶段 | 普通邻格着火伤害3，另一个Flaming跳过；重复允许累加 | IgniteTiles @0x29be0 |
| E08 Freezing | 恰两个未冻非特殊目标，另一个特殊敌人 | 能力阶段 | 两个不同目标冻结，特殊敌人不冻 | FreezeTiles @0x2e898 |
| E09 Poisonous | 玩家Elf，旧毒4，Poisonous在场 | 喝普通药；再直接用毒武器攻击该敌 | 治疗但玩家毒不清；敌毒槽不增加 | AddResource；AttackSkull |
| E10 Kamikaze | 倒计时1，HP玩家9，邻骷髅/金币各一 | 能力阶段 | 玩家HP4，自己无奖离场，邻金币收集，邻骷髅不因爆炸被杀 | ExplodeEnemy @0x2b2e4；MatchTile |
| E11 Overseer | 唯一剑，Trap已开 | 能力阶段 | 剑经SetType变骷髅，新骷髅当前HP1，最大HP另保留 | ConvertSwordToSkull @0x2eb4c |
| E12 Corrosive | 当前甲1/5，普通盾token | 消费token | UP+2，当前甲仍1 | AddResource |
| E13 Thief | 盘面仅1金币，金币条10 | 能力阶段 | 偷该1格无奖，不再从条中补扣第二点 | StealGold @0x34a68/@0x348e8 |
| E14 Chaotic | 唯一可交换普通格 | 能力阶段 | Chaotic移到目标，换回原位的格无奖消除 | JumpEnemy @0x2f370 |
| E15 Mage | 当前技能charge3/CD8 | 推进回合末充能段 | charge仍3，主动法力token仍可另加1 | EndOfTurn；AddResource |
| E16 Assassin | 位于底行，攻击3，玩家HP10/甲100 | 能力阶段 | HP4，甲不抵挡 | StabAttack @0x2f250 |
| E17 Doppelganger | 玩家当前甲3/最大8，敌甲10 | 能力阶段 | 敌防御变3，不是最大甲8 | MimicDefence @0x2e84c |
| E18 Alchemist | 至少2个有效普通格，固定目标/RNG | 能力阶段 | 最多2个不同目标各RandomiseTile一次；允许新类型等于旧类型 | ConvertRandomTiles @0x2e6bc |
| E19 Unstable | Changeling宿敌，倒计时1，TILE序列包含剑 | 能力与重填 | 排除剑重抽，允许骷髅；不沿用普通传送的排除骷髅 | TeleportEnemy @0x29ad8；RandomiseTile |
| E20 Vampire | 当前/最大HP10，攻击3，玩家普通攻击阶段将受穿透 | ProcessVampires，两种种族参数化 | 普通种族保持10；Werewolf宿敌变当前/最大13 | ProcessVampires @0x2d18c；AddHealth @0x63a5c |
| E21 Vengeful | 攻击4，本链击杀3 | AddRevengeHealth | 攻击7，HP不因函数名而增加 | AddRevengeHealth @0x2d294 |
| E22 Trampling | 唯一完整普通剑，另有箭头剑 | 能力阶段 | 普通剑破损，箭头不入候选 | BreakRandomShieldSword @0x2e55c |
| E23 Greasy | 一列只有顶行骷髅，下方非骷髅；排除自身 | 能力阶段 | y=0也检查，其下格无奖消除 | LowerSkulls @0x2f154；disasm @0x1f17c |
| E24 Alpha | 一个邻域外骷髅，一个邻域内非骷髅 | 能力阶段 | 二者交换，各候选只用一次 | AttractSkulls @0x2e22c |
| E25 Magnetic | 邻域外一个剑，邻域内一个特殊敌人 | 能力阶段 | 允许交换，目的地不因特殊敌人身份被排除 | AttractShieldsSwords @0x2defc |
| E26 Brute | 唯一旧普通骷髅HP7，另有新骷髅 | 能力阶段并消费投掷token | 旧骷髅无奖移除，variant3伤害7；新骷髅不选 | ThrowSkull @0x2eeb0；AddResource |
| E27 Armoured | 同一D，分别向上/向下离开敌格 | GetDamageType | 向上NORMAL，向下BLOCKED；不要求前一格也在同列下方 | GetDamageType @0x644bc |
| E28 Devourer | 倒计时1，选中装备仅HP属性10 | 能力阶段 | HP属性减10至0并UpdateStats，不是减1；计时重置5 | DestroyUpgrade @0x2ecb8；ReduceStat @0x4dbe0 |
| E29 Defiler | 玩家甲5，汇总敌攻3，OTHER队列空 | 普通格挡 | 护甲变2，HP不减，破损不消耗随机数 | ProcessAttack @0x311b8 |
| E30 Meat Shield | 两个未选MeatShield，链攻击另一个普通敌D10 | 提交 | 普通敌直接链伤害被挡；两个MeatShield各受10（再算各自防御） | GetDamageType；MatchTiles |
| E31 Fleeing | 位于y1 | 能力阶段，再下一次能力 | 先向上到y0；下一次无奖离场；下落移动另测Stab扣GetAttack | FleeUp @0x2eda0；Stab @0x2fcd8 |
| E32 Lich | 活巫妖HP1，D足够 | 直接击杀后连续两次能力 | 首次转命匣不发击杀奖；首个能力只清延迟；第二次按当前turn重生成复活 | AttackSkull；ActivateAbility |
| E33 Lich毒路径 | 活巫妖HP1，毒首项1 | 只推进敌人毒阶段 | 直接MatchTile发特殊奖励，不转命匣 | EndOfTurn；MatchTile |

## 技能、装备与职业

| ID | 前置状态 | 操作 | 期望 | 证据 |
| --- | --- | --- | --- | --- |
| P01 | 普通敌A5/D4，特殊敌A5/D4 | Shatter | 普通A1/D0，特殊不变 | ShatterDefence @0x28554 |
| P02 | 普通敌A0/D0 | Shatter | 攻击仍0，不提高到1 | 同上 |
| P03 | 新技能Heal，无装备CD属性 | 获取 | level1,CD15,charge15，立即可用 | Skill::Initialise @0x60984 |
| P04 | Heal level1/CD15/charge10 | 升级 | level2/CD14/charge10；效果仍收集普通药水 | Skill::Initialise；Activate |
| P05 | 两件装备均有cooldown属性，旧无此属性，技能CD15 | UpdateStats两次 | 首次CD14，第二次仍14；不按两件减2、不重复累减 | UpdateStats @0x26c94 |
| P06 | P05后移除一件、再移除最后一件 | 分别UpdateStats | 前次仍CD14，最后恢复15 | 同上 |
| P07 | Cunning，已装备3技能 | 加入第4个新技能，再升级它 | 新增时CD−1，升级仅正常等级减1不再次扣Cunning | SetSkill @0x2be04 |
| P08 | HP1，LastStand开 | CheckEndGame；随后令HP0再检查 | 首次不消耗；第二次回满并清current/next，不清毒 | CheckEndGame @0x2f960 |
| P09 | Trap开，固定生成特殊敌人最大HP30 | RandomiseTile | 当前HP1、最大30、发Premonition事件 | RandomiseTile @0x2d584 |
| P10 | TreasureChamber开，非Sprint | 普通补盘 vs CollectBoard补盘 | 普通强制金币不抽类型；CollectBoard期间14dab=1按TILE抽类型，退出复位0 | CollectBoard @0x30a2c；RandomiseTile |
| P11 | Rune开，03的3×3方框，中间普通骷髅 | 提交Rune阶段 | 直接收集中心，不走AttackSkull；中心换特殊敌人则不收集 | ProcessRune @0x2b560 |
| P12 | Rune开，03的20格外圈 | 仅Rune执行 | 内部16格中除特殊敌人外均收集；不包含边界链本身 | ProcessRune |
| P13 | Rune开，03的四点自交小结 | 预览/执行 | 没有内部格；不按几何交点创造节点 | ProcessRune |
| P14 | 正常输入前施放boost；另一fixture在14d94=1时施放 | EndOfTurn轮换 | 前者消失；后者保留到下一行动，next清零 | Activate @0x60210；EndOfTurn |
| P15 | Earthquake固定72个OTHER坐标值 | 施放 | x外y内36次swap，每次抽x再y；不保证每格只换一次 | Earthquake @0x2a2ac |
| P16 | 护甲4，敌E3/H20 | ExplosiveArmour | 传入8，敌HP15；玩家当前甲仍4 | ExplodeArmour @0x31050；AttackSkull |
| P17 | 连续施放Hack与Slash，同回合有特殊敌人 | 第二次施放 | 触发CollectBoard，特殊敌人保留，两组合标志清零 | ConvertColumnToSwords；CollectRandomRow |
| P18 | 职业全部10级 | 请求Adventurer技能池/替换列表 | 允许0…39；40/41仍不在正常候选 | IsSkillUnlocked @0x248e8；GetSkillPool |
| P19 | 专门构造保存ID40/41的Skill字节 | 读取/分发 | 保留原生ID并走Shock/Awe，不映射为不存在wrapper枚举 | Skill::Deserialise @0x5ffb0；Activate |
| P20 | 新Ranger，局内等级1、技能数0 | XP升2并生成菜单 | 先消费第一抽后覆盖候选为Volley；尚未选择前仍无技能 | FoldoutMenu::Initialise @0x42794 |
| P21 | 3个技能，第一个候选是新技能 | 生成第二候选 | 只从原有可升级技能中选；不能同时提供两个新技能占到5槽 | 同上 |
| P22 | Sprint已有技能X | 生成升级菜单 | X移出池，Trap也移除；新技能level5/CD基础−4 | FoldoutMenu；Skill::Initialise |
| P23 | 总吸血14/15/20/21/24参数化 | GetStatUpgrade(2) | 分别5/3/3/2/2；24仍有升级资格 | GetStatUpgrade @0x51888；IsUpgradeAllowed @0x517b8 |
| P24 | 总吸血17/18/22/23参数化 | GetStatDowngrade(2) | 分别5/3/3/2 | GetStatDowngrade @0x5193c |
| P25 | 耐久d=69/70/79/80/85/86 | 获取升级步长 | 分别10/5/5/3/3/2 | GetStatUpgrade |
| P26 | 旧护甲max5/current2，新max8 | UpdateStats | current5，保留3点缺口 | UpdateStats |
| P27 | 旧HP上限50/current20，新上限40 | UpdateStats | current仍20；若旧current45则钳40 | UpdateStats |
| P28 | 普通模式抽武器强化，weaken总量0 | 生成候选 | 仍先消费UPGRADE的R(0,0)，再抽最终属性；Sprint跳过前一抽 | GetRandomStat @0x51db8 |
| P29 | 非初始未满级职业、还有锁定职业 | 点Trophy，OTHER先1或0参数化 | 1升级当前；0再抽一个锁定职业；不是按职业文案条件判断 | ProcessInput Trophy分支 |
| P30 | 职业等级2/3/5/7/9/10 | 查询编辑资格 | 新perk槽分别在3/7/9；5可换种族；替换数2/2/4/6/8/10 | IsPerkUnlocked；GetReplacementSkillsAllowed；Validate |
| P31 | ManaPotion技能29未满，另一技能Heal未满，再一技能已满 | 创建法力token | 仅Heal可选；固定OTHER抽样绑定其槽；没有Heal时token隐藏且不治疗 | Interface::GetSpecialTarget @0x4b254；Token::InitialiseFromTile |

## 计分、成就、存档与结束条件

| ID | 前置状态 | 操作 | 期望 | 证据 |
| --- | --- | --- | --- | --- |
| S01 | Classic X100,G20,U30,t10，技能level1与2 | GetScore | 460 | GetScore @0x2f868 |
| S02 | Sprint X3,G3,U3，胜利false/true | GetScore | 两种均0，不得先总和除4 | GetScore |
| S03 | Sprint X8,G12,U16 | GetScore胜利false/true | 9/18 | GetScore |
| S04 | Pretzel k=4/5/9/10/14/15 | 计分 | 4/10/18/30/42/100 | ProcessPretzels @0x2bcd8 |
| S05 | Pretzel旧avgTimes10=16、count3，本链k2 | 结算 | avgTimes10=17，count4；保留每次截断 | MatchTiles |
| S06 | Sprint turn99，HP足够到100尾段 | 完整EndOfTurn | 通过中间检查后置胜利、分数翻倍、发Survivor | EndOfTurn；CheckEndGame |
| S07 | Sprint turn99，玩家毒本轮可杀且无LastStand | 完整EndOfTurn | 进入turn100但在尾段前失败，无翻倍/Survivor | 同上 |
| S08 | 酸药伤害恰等于当前HP，Normal | 消费 | HP0触发结束，但不发Disintegrated（严格<0）；多1伤害才发 | AddResource @0x32210 |
| S09 | Easy，发Bloodlust和MissionAccomplished | QueueAchievement | 前者被抑制，后者保留 | QueueAchievement @0x281cc |
| S10 | Slash/Fireball/Charge/CollectBoard四标志全真 | CheckShockAwe | 发成就63；不依赖不可获取的技能40/41 | CheckShockAwe @0x28318 |
| S11 | Item仅属性0=2与11=1非零 | 序列化 | 4个头字节后mask=0x801，小端01 08 00 00；再i32的2、1 | Item::Serialise @0x4bb90 |
| S12 | Skill字节[33,255,0,1] | 读取 | ID33,CD−1,charge−1,level1 | Skill::Deserialise |
| S13 | 首两格类型0、4，其余合法 | 序列化棋盘类型 | 首字节0x04；18个类型字节，行优先 | SerialiseState @0x265f4 |
| S14 | 敌毒[2,0,0]，其余字段固定 | 序列化Tile | 毒尾写02 00，共2字节；[2,3,4]则3字节无额外0 | Tile::Serialise @0x62c28 |
| S15 | 当前职业配置含替换槽1…19 | 序列化局内/完整职业 | 26/47字节，首对默认特性和首技能不在块里 | SerialiseGameState @0x361ac；SerialiseFullState @0x36494 |
| S16 | RNG0…5均赋不同种子 | 保存当前局 | 仅1…5，顺序固定；0不能假装也能恢复 | SerialiseState；DeserialiseState2 |
| S17 | Pretzel avgTimes10=300 | 原版布局写读 | 当前布局写44；新实现若采用宽字段需明确版本选择 | SerialiseState低字节写入 |
| S18 | 某类榜单满10条，新分低于最末 | AddScore | 原版覆写末位，不丢弃新条 | ScoreScreen::AddScore @0x5cc5c |
| S19 | 同分已有两条 | AddScore同分新条 | 插在已有同分后面；保存lastIndex用于高亮 | 同上 |
| S20 | 8项非零Item，Normal | 序列化 | 排成就72；仅7项则无 | Item::Serialise |

## 尚不能写成断言的运行对照卡

- V01：同帧多个token分别跨XP/金/UP条，吸血与尖刺/火伤到达竞争（T01 C2）：需要原版逐帧/事件日志，不能先规定所有治疗先于伤害。
- V02：多个移动类特殊敌人、被标记消除格与立即补盘的同回合遍历（T01 C3）：需要原版轨迹；已知单体用例仍按原顺序实现。
- V03：商店卷轴原始内存筛选I1、旧存档首部S1、成就I_SEE A1：取证后再补断言。
- V04：初始全盘固定种子golden trace仍依赖01 B1/B2；上述用例允许直接构造状态并注入随机队列，不以一个未证实的新局生成器作为所有测试前置。
