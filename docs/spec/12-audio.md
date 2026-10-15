# 12 音效规格（U01）

证据来自原生QueueSound调用、Sound包装枚举、Java SoundEngine与OGG容器头。未试听音频，未解码PCM或分析波形；下面的听感文字是根据文件名/触发语义提出的**原创合成方向**，不是对原录音的听觉鉴定。

## 播放规则与时序

- 实际是38类（id 0–37），不是P3规划中概数39；`Sound.java`的`SOUND_COUNT=38`。70个文件，变体数由`GetSoundVariations @0x678c4`、Ghidra表`0x6e390`（ELF `0x5e390`）读取；名字来自`GetSoundName @0x6770c`。
- `Game::QueueSound @0x2979c`仅在声音开关`+0x142f6`非零时入队；不做同帧同类去重。`GetNextSound @0x24758`按读游标依序取出，空队列返回-1。
- `DungeonRaidRenderer.onAppRendered`在渲染后持续取声直到-1，再处理成就队列。声音由原生表现阶段排队，不能只在整轮结束统一播放。
- `GetSoundMapping @0x67ea4`调用`RandI(0, variationCount-1, 0)`：COSMETIC路随机选变体，非顺序轮换。即使一变体也执行这个调用；具体同端点是否推进RNG以RandI实现为准。
- `SoundEngine`用`new SoundPool(8, 3, 100)`：最多8路，Android STREAM_MUSIC=3。播放参数`play(id, volume, volume, 1, 0, 1.0f)`：左右等音量、优先级1、不循环、原速无音高随机化。音量为系统音乐音量/currentMax；资源加载/平台抢占策略不能推断成自定义八声FIFO。
- 本卡不定义规则层新事件。下表事件名指现有GameEvent对接候选；`UI-local`表示按钮/帧更新/结算计数自身触发。`GameOver`产生后每个展示阶段仍各自排声，不能按一个GameOver一次播放所有声音。

## 类型、时长与原创方向

时长=最后有效Ogg granule/sampleRate，保留精确samples/rate在JSON；下表秒数四舍五入6位。读取的仅是容器页及Vorbis identification头。原始文件只作为证据路径，S01交付全新合成文件。

| id / 名称 | 文件：秒 | 原创声音方向 |
|---|---|---|
| 0 / click | click1.ogg：0.033605 | 短促按键轻响 |
| 1 / coinstart | coinstart1.ogg：0.131519；coinstart2.ogg：0.158549；coinstart3.ogg：0.100136 | 金币开始聚拢的金属轻响 |
| 2 / coin | coin1.ogg：0.101224；coin2.ogg：0.129546；coin3.ogg：0.084717 | 清脆金币落袋声 |
| 3 / swordstart | swordstart1.ogg：0.180930；swordstart2.ogg：0.174512；swordstart3.ogg：0.195510 | 拔剑或挥剑前奏 |
| 4 / potion | potion1.ogg：0.184853；potion2.ogg：0.161270；potion3.ogg：0.232925 | 液滴与饮用声 |
| 5 / potionstart | potionstart1.ogg：0.201859；potionstart2.ogg：0.327438；potionstart3.ogg：0.201859 | 瓶塞或药液晃动声 |
| 6 / shield | shield1.ogg：0.137506；shield2.ogg：0.158912；shield3.ogg：0.161088 | 盾牌金属修复声 |
| 7 / shieldstart | shieldstart1.ogg：0.140045；shieldstart2.ogg：0.109206；shieldstart3.ogg：0.100499 | 举盾金属轻响 |
| 8 / up | up1.ogg：0.253243；up2.ogg：0.200998；up3.ogg：0.245261 | 强化能量短音 |
| 9 / xp | xp1.ogg：0.223492；xp2.ogg：0.195193；xp3.ogg：0.227120 | 经验吸收的明亮短音 |
| 10 / abilityready | abilityready1.ogg：2.017052 | 技能就绪的上行提示 |
| 11 / shop | shop1.ogg：0.905057 | 商店开启提示音 |
| 12 / levelup | levelup1.ogg：0.935397 | 升级的上行短乐句 |
| 13 / upgrade | upgrade1.ogg：0.800884 | 装备强化完成提示 |
| 14 / skull | skull1.ogg：0.306417；skull2.ogg：0.516100；skull3.ogg：0.542336 | 骨骼干涩碰撞 |
| 15 / armour | armour1.ogg：0.560181；armour2.ogg：0.396190 | 金属格挡冲击 |
| 16 / armourbreak | armourbreak1.ogg：0.176939 | 金属碎裂 |
| 17 / damage | damage1.ogg：0.322902 | 受伤钝击 |
| 18 / start | start1.ogg：4.061315 | 出发提示短乐句 |
| 19 / ability | ability1.ogg：0.420136 | 施法能量脉冲 |
| 20 / freeze | freeze1.ogg：0.520522 | 冰冻结晶 |
| 21 / teleport | teleport1.ogg：0.774626 | 空间移动的扫频 |
| 22 / shatter | shatter1.ogg：0.355556 | 碎片崩解 |
| 23 / boost | boost1.ogg：0.210068 | 增益上行音 |
| 24 / explosive | explosive1.ogg：0.630023 | 变形或蓄爆提示 |
| 25 / slash | slash1.ogg：0.457120 | 利刃切割 |
| 26 / attackmiss | attackmiss1.ogg：0.173061 | 挥击落空 |
| 27 / attackhit | attackhit1.ogg：0.374150；attackhit2.ogg：0.508866；attackhit3.ogg：0.436689 | 挥击命中 |
| 28 / explosion | explosion1.ogg：0.840272；explosion2.ogg：0.770249；explosion3.ogg：0.910295 | 短促爆裂 |
| 29 / poison | poison1.ogg：0.210068；poison2.ogg：0.210068；poison3.ogg：0.210068 | 毒液嘶响 |
| 30 / blunt | blunt1.ogg：0.139887；blunt2.ogg：0.151497；blunt3.ogg：0.165646 | 低沉钝击 |
| 31 / help | help1.ogg：0.118435 | 帮助轻提示 |
| 32 / heartbeat | heartbeat1.ogg：0.359161；heartbeat2.ogg：0.346576；heartbeat3.ogg：0.305964；heartbeat4.ogg：0.305964 | 低频心跳 |
| 33 / lose | lose1.ogg：1.610522 | 失败下行乐句 |
| 34 / doorcreak | doorcreak1.ogg：1.063900 | 门轴吱呀 |
| 35 / jump | jump1.ogg：0.158526 | 跳跃短滑音 |
| 36 / bless | bless1.ogg：0.481020 | 祝福明亮和声 |
| 37 / quake | quake1.ogg：0.893583 | 地震低频隆隆 |

## 全部调用点索引

`data/sounds.json.callSites`保存每个调用的文件、行号、原始调用、分支附近原文、skillId及事件候选；以下逐个列出177个调用，不能把同一函数的不同分支合并成一条无条件触发。另有177条`assemblyCallSites`作为机器指令层交叉检查。地址默认Ghidra；显式ELF/Thumb地址需加0x10000才与伪C对齐。

| 伪C调用点（函数地址:行） | 场景函数 / 技能case | 音效 | 对接候选 |
|---|---|---|---|
| `00029800:12` | Game::QueueTileSound | 5 potionstart | ChainPreview |
| `00029800:15` | Game::QueueTileSound | 24 explosive | ChainPreview |
| `00029800:19` | Game::QueueTileSound | 14 skull | ChainPreview |
| `00029800:22` | Game::QueueTileSound | 1 coinstart | ChainPreview |
| `00029800:25` | Game::QueueTileSound | 7 shieldstart | ChainPreview |
| `00029800:28` | Game::QueueTileSound | 3 swordstart | ChainPreview |
| `00029800:31` | Game::QueueTileSound | 8 up | ChainPreview |
| `0002985c:12` | Game::SetTimeToPromotion | 14 skull | SpecialEnemyGenerated |
| `0002985c:16` | Game::SetTimeToPromotion | 14 skull | SpecialEnemyGenerated |
| `00029ad8:55` | Game::TeleportEnemy | 21 teleport | EnemyAbility |
| `0002ac40:59` | Game::MatchTile | 28 explosion | TileMatched |
| `0002ac40:128` | Game::MatchTile | 28 explosion | TileMatched |
| `0002d18c:49` | Game::ProcessVampires | 23 boost | EnemyAbility |
| `0002d294:26` | Game::AddRevengeHealth | 14 skull | EnemyAbility |
| `0002d350:14` | Game::Resurrect | 22 shatter | EnemyAbility |
| `0002d350:15` | Game::Resurrect | 14 skull | EnemyAbility |
| `0002d584:67` | Game::RandomiseTile | 16 armourbreak | TileGenerated |
| `0002defc:149` | Game::AttractShieldsSwords | 23 boost | EnemyAbility |
| `0002e22c:147` | Game::AttractSkulls | 14 skull | EnemyAbility |
| `0002e55c:114` | Game::BreakRandomShieldSword | 16 armourbreak | EnemyAbility |
| `0002e6bc:122` | Game::ConvertRandomTiles | 24 explosive | EnemyAbility |
| `0002e84c:12` | Game::MimicDefence | 23 boost | EnemyAbility |
| `0002e898:132` | Game::FreezeTiles | 20 freeze | EnemyAbility |
| `0002ea40:23` | Game::MakeAcidPotion | 24 explosive | EnemyAbility |
| `0002eb4c:23` | Game::ConvertSwordToSkull | 14 skull | EnemyAbility |
| `0002ecb8:42` | Game::DestroyUpgrade | 22 shatter | EnemyAbility |
| `0002eda0:53` | Game::FleeUp | 35 jump | EnemyAbility |
| `0002eeb0:131` | Game::ThrowSkull | 26 attackmiss | EnemyAbility |
| `0002f154:45` | Game::LowerSkulls | 5 potionstart | EnemyAbility |
| `0002f250:29` | Game::StabAttack | 27 attackhit | EnemyAbility |
| `0002f250:30` | Game::StabAttack | 17 damage | EnemyAbility |
| `0002f370:131` | Game::JumpEnemy | 35 jump | EnemyAbility |
| `0002f630:81` | Game::AttackSkull | 29 poison | EnemyDamaged |
| `0002f960:49` | Game::CheckEndGame | 19 ability | PlayerHealth, GameOver |
| `0002fcd8:15` | Game::Stab | 27 attackhit | EnemyAbility |
| `0002fcd8:16` | Game::Stab | 17 damage | EnemyAbility |
| `000300d4:21` | Game::RunAwayEnemy | 35 jump | EnemyAbility |
| `000311b8:45` | Game::ProcessAttack | 14 skull | EnemyAttack, PlayerHealth |
| `000311b8:84` | Game::ProcessAttack | 27 attackhit | EnemyAttack, PlayerHealth |
| `000311b8:255` | Game::ProcessAttack | 15 armour | EnemyAttack, PlayerHealth |
| `000311b8:274` | Game::ProcessAttack | 16 armourbreak | EnemyAttack, PlayerHealth |
| `000311b8:290` | Game::ProcessAttack | 30 blunt | EnemyAttack, PlayerHealth |
| `000311b8:333` | Game::ProcessAttack | 3 swordstart | EnemyAttack, PlayerHealth |
| `000311b8:367` | Game::ProcessAttack | 17 damage | EnemyAttack, PlayerHealth |
| `00032210:25` | Game::AddResource | 17 damage | EffectConsumed, PlayerHealth |
| `00032210:39` | Game::AddResource | 4 potion | EffectConsumed, PlayerHealth |
| `00032210:51` | Game::AddResource | 4 potion | EffectConsumed, PlayerHealth |
| `00032210:78` | Game::AddResource | 17 damage | EffectConsumed, PlayerHealth |
| `00032210:94` | Game::AddResource | 9 xp | EffectConsumed, PlayerHealth |
| `00032210:164` | Game::AddResource | 2 coin | EffectConsumed, PlayerHealth |
| `00032210:204` | Game::AddResource | 8 up | EffectConsumed, PlayerHealth |
| `00032210:241` | Game::AddResource | 6 shield | EffectConsumed, PlayerHealth |
| `0003289c:42` | Game::EndOfTurn | 10 abilityready | TurnEnded |
| `0003289c:151` | Game::EndOfTurn | 22 shatter | TurnEnded |
| `0003289c:166` | Game::EndOfTurn | 4 potion | TurnEnded |
| `0003289c:182` | Game::EndOfTurn | 29 poison | TurnEnded |
| `000330c0:248` | Game::ProcessInput | 27 attackhit | ChainPreview, EnemyDamaged |
| `000330c0:250` | Game::ProcessInput | 26 attackmiss | ChainPreview, EnemyDamaged |
| `000330c0:302` | Game::ProcessInput | 4 potion | ChainPreview, EnemyDamaged |
| `000339ac:183` | Game::Process | 2 coin | EffectConsumed |
| `000339ac:316` | Game::Process | 4 potion | EffectConsumed |
| `000339ac:397` | Game::Process | 17 damage | EffectConsumed |
| `000339ac:460` | Game::Process | 25 slash | EffectConsumed |
| `00034740:80` | Game::HealOrBless | 36 bless | EnemyAbility |
| `00034740:86` | Game::HealOrBless | 36 bless | EnemyAbility |
| `0003a598:129` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:137` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:148` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:171` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:209` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:220` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:279` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:285` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:302` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:311` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:336` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:353` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:364` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:377` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:383` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:577` | ClassScreen::Process | 0 click | UI-local |
| `0003a598:683` | ClassScreen::Process | 0 click | UI-local |
| `00041d54:36` | FoldoutMenu::ProcessInput | 1 coinstart | MenuSelectionChanged, MenuClosed |
| `00041d54:51` | FoldoutMenu::ProcessInput | 8 up | MenuSelectionChanged, MenuClosed |
| `00041d54:57` | FoldoutMenu::ProcessInput | 9 xp | MenuSelectionChanged, MenuClosed |
| `00041d54:104` | FoldoutMenu::ProcessInput | 0 click | MenuSelectionChanged, MenuClosed |
| `00041d54:140` | FoldoutMenu::ProcessInput | 11 shop | MenuSelectionChanged, MenuClosed |
| `00041d54:143` | FoldoutMenu::ProcessInput | 13 upgrade | MenuSelectionChanged, MenuClosed |
| `00041d54:146` | FoldoutMenu::ProcessInput | 12 levelup | MenuSelectionChanged, MenuClosed |
| `00042794:208` | FoldoutMenu::Initialise | 11 shop | MenuRequested |
| `00042794:400` | FoldoutMenu::Initialise | 12 levelup | MenuRequested |
| `00042794:911` | FoldoutMenu::Initialise | 13 upgrade | MenuRequested |
| `00044564:37` | GameMenu::Process | 0 click | UI-local |
| `00044564:65` | GameMenu::Process | 0 click | UI-local |
| `000457d4:141` | GameOverScreen::Initialise | 33 lose | GameOver |
| `000457d4:144` | GameOverScreen::Initialise | 12 levelup | GameOver |
| `000469dc:78` | GameOverScreen::Process | 27 attackhit | GameOver |
| `000469dc:241` | GameOverScreen::Process | 2 coin | GameOver |
| `000469dc:267` | GameOverScreen::Process | 2 coin | GameOver |
| `000469dc:286` | GameOverScreen::Process | 2 coin | GameOver |
| `000469dc:310` | GameOverScreen::Process | 2 coin | GameOver |
| `000469dc:379` | GameOverScreen::Process | 10 abilityready | GameOver |
| `000469dc:385` | GameOverScreen::Process | 2 coin | GameOver |
| `000469dc:435` | GameOverScreen::Process | 14 skull | GameOver |
| `00048dfc:47` | Interface::ProcessHeartbeat | 32 heartbeat | PlayerHealth |
| `00049738:39` | Interface::ProcessInput | 0 click | UI-local |
| `00049738:66` | Interface::ProcessInput | 0 click | UI-local |
| `00049738:70` | Interface::ProcessInput | 0 click | UI-local |
| `0004b35c:51` | IntroScreen::Process | 18 start | UI-local |
| `00052c54:105` | MainMenu::Process | 0 click | UI-local |
| `00052c54:114` | MainMenu::Process | 0 click | UI-local |
| `00052c54:173` | MainMenu::Process | 10 abilityready | UI-local |
| `00052c54:193` | MainMenu::Process | 0 click | UI-local |
| `00052c54:281` | MainMenu::Process | 0 click | UI-local |
| `00054e8c:30` | ModeScreen::Process | 0 click | UI-local |
| `00054e8c:44` | ModeScreen::Process | 0 click | UI-local |
| `00057a10:275` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:299` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:312` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:335` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:356` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:387` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:413` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:437` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:457` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:493` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:580` | NameScreen::ProcessInput | 0 click | UI-local |
| `00057a10:598` | NameScreen::ProcessInput | 0 click | UI-local |
| `0005dba8:117` | ScoreScreen::Process | 0 click | UI-local |
| `0005dba8:137` | ScoreScreen::Process | 0 click | UI-local |
| `00060210:14` | Skill::Activate / skill=0 | 19 ability | SkillCast |
| `00060210:21` | Skill::Activate / skill=1 | 20 freeze | SkillCast |
| `00060210:25` | Skill::Activate / skill=2 | 19 ability | SkillCast |
| `00060210:29` | Skill::Activate / skill=3 | 19 ability | SkillCast |
| `00060210:33` | Skill::Activate / skill=4 | 19 ability | SkillCast |
| `00060210:38` | Skill::Activate / skill=5 | 22 shatter | SkillCast |
| `00060210:42` | Skill::Activate / skill=6 | 19 ability | SkillCast |
| `00060210:46` | Skill::Activate / skill=7 | 21 teleport | SkillCast |
| `00060210:50` | Skill::Activate / skill=8 | 24 explosive | SkillCast |
| `00060210:54` | Skill::Activate / skill=9 | 19 ability | SkillCast |
| `00060210:58` | Skill::Activate / skill=10 | 19 ability | SkillCast |
| `00060210:62` | Skill::Activate / skill=11 | 25 slash | SkillCast |
| `00060210:66` | Skill::Activate / skill=12 | 19 ability | SkillCast |
| `00060210:70` | Skill::Activate / skill=13 | 19 ability | SkillCast |
| `00060210:74` | Skill::Activate / skill=14 | 19 ability | SkillCast |
| `00060210:78` | Skill::Activate / skill=15 | 19 ability | SkillCast |
| `00060210:82` | Skill::Activate / skill=16 | 23 boost | SkillCast |
| `00060210:89` | Skill::Activate / skill=17 | 23 boost | SkillCast |
| `00060210:96` | Skill::Activate / skill=18 | 23 boost | SkillCast |
| `00060210:103` | Skill::Activate / skill=19 | 23 boost | SkillCast |
| `00060210:110` | Skill::Activate / skill=20 | 19 ability | SkillCast |
| `00060210:114` | Skill::Activate / skill=21 | 26 attackmiss | SkillCast |
| `00060210:118` | Skill::Activate / skill=22 | 27 attackhit | SkillCast |
| `00060210:126` | Skill::Activate / skill=23 | 14 skull | SkillCast |
| `00060210:130` | Skill::Activate / skill=24 | 34 doorcreak | SkillCast |
| `00060210:137` | Skill::Activate / skill=25 | 19 ability | SkillCast |
| `00060210:141` | Skill::Activate / skill=26 | 37 quake | SkillCast |
| `00060210:145` | Skill::Activate / skill=27 | 28 explosion | SkillCast |
| `00060210:149` | Skill::Activate / skill=28 | 28 explosion | SkillCast |
| `00060210:153` | Skill::Activate / skill=29 | 24 explosive | SkillCast |
| `00060210:157` | Skill::Activate / skill=30 | 27 attackhit | SkillCast |
| `00060210:161` | Skill::Activate / skill=31 | 26 attackmiss | SkillCast |
| `00060210:165` | Skill::Activate / skill=32 | 14 skull | SkillCast |
| `00060210:174` | Skill::Activate / skill=33 | 19 ability | SkillCast |
| `00060210:179` | Skill::Activate / skill=34 | 14 skull | SkillCast |
| `00060210:186` | Skill::Activate / skill=35 | 19 ability | SkillCast |
| `00060210:195` | Skill::Activate / skill=36 | 2 coin | SkillCast |
| `00060210:196` | Skill::Activate / skill=36 | 2 coin | SkillCast |
| `00060210:197` | Skill::Activate / skill=36 | 2 coin | SkillCast |
| `00060210:201` | Skill::Activate / skill=37 | 19 ability | SkillCast |
| `00060210:209` | Skill::Activate / skill=38 | 27 attackhit | SkillCast |
| `00060210:213` | Skill::Activate / skill=39 | 23 boost | SkillCast |
| `00060210:217` | Skill::Activate / skill=40 | 28 explosion | SkillCast |
| `00060210:221` | Skill::Activate / skill=41 | 28 explosion | SkillCast |
| `00061d84:64` | StatsMenu::Process | 0 click | UI-local |
| `00061d84:183` | StatsMenu::Process | 0 click | UI-local |
| `00066fc4:31` | UnlockMenu::Show | 12 levelup | ClassLevelChanged, TrophyClaimed |

## 调度约束、覆盖与未决

资源链的start声来自`QueueTileSound @0x29800`选择预览，资源收集声来自token/结算流程，两者不是一组音效的重复通知；护甲、破甲、钝击、闪避、命中、损血分别保留。技能id分支在`Game::SkillActivate`中可叠加多个声音，不应一律替换成ability。`help`（31）有文件和枚举，本次未找到QueueSound调用，不能为了填满表而给每次帮助打开追加声音。

伪C有13处省略了sound参数，已逐处回到Thumb补回：6处ProcessAttack、ClassScreen点击、NameScreen点击、FoldoutMenu商店选择，以及GameOver的4处逐图标计数。后4处的r1=2由入口`cmp r1,#2`分支证明，期间无写r1；FoldoutMenu则由`cmp r1,#1`证明，并非凭“商店”名字猜测。详情在callSites.assemblyEvidence。

当前移植引擎没有SoundQueued事件，音频选变体的COSMETIC抽样也未统一消费。U02/S01须单独决定兼容策略：可以先用独立音频seed做表现近似；若要求原生COSMETIC完整状态对齐，则需要在后续规则任务中补音频排队与抽样并加测试。UI不得直接推进现有规则RNG。

仍需：将每条分支条件进一步转为可执行的事件过滤器（尤其同一事件包含多个资源/敌人/菜单选项的情况）、结算每阶段计数的完整时间表、确认目标平台实际混音与并发抢占行为。原版没有证据支持音乐常驻循环、音高随连击变化、所有声音自动去重；本卡不加入这些规则。
