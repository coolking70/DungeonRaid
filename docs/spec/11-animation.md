# 11 动画、时间线与事件（U01）

## 时间与事件契约

下面的dt以秒计，位置为原生1×1.5坐标，转换逻辑像素时×320。原生动画经常用逐帧Euler积分，不应统一替换成固定180ms ease-out。事件名以 `src/core/combat.ts RuleEvent` 和 `board.ts BoardEvent` 为准；不存在SoundQueued、ParticleSpawned等现成事件。`ui/main.ts`的STEP_DELAY={falling:180,attack:260}是调试表现，不是原版常量。

UI持有事件发生前的棋盘快照和表现对象，逻辑推进仍调用step。TileMoved只给from/to/spawned，后续格子会占据同一槽；EffectConsumed只给id，应从先前EffectQueued缓存effect。不以动画结束回调重复Apply资源、不把TurnEnded视为所有飞行动画完成。[src/core/engine.ts、combat.ts、state.ts；ui/main.ts settle]

## 动态效果表

| 效果 | 事件/条件 | 轨迹、时长、透明度及先后 | 证据 |
|---|---|---|---|
| 下落/补充 | TileMoved，PhaseChanged(falling) | `v+=a*dt; y+=v*dt; y>=targetY`则吸附、停止、v重置1；构造v=1、a=.5。时长随距离/dt变，普通补盘完成后AdvancePhase；特殊飞行不能套此路径 | Tile::Tile @0x63f44 `0x3f800000,0x3f000000`；Process @0x628ec；Game::MoveMatchedTiles @0x2fd7c |
| 资源token | EffectQueued(kind=resource)，消费后EffectConsumed | 从来源格/显式位置飞到动态HUD目标；无目标法力token根本不创建；飞行结束与ConsumeEffect有配合，公式见下 | Token::InitialiseFromTile @0x653d0；Process @0x65200；Interface::GetTarget @0x49028 |
| 资源影子 | ChainPreview变化 | 立即以确定性收集结果调用Set*Shadow；取消/敌攻开始置-1清除；没有查到定时拖尾曲线，不能设计成每次掉血后的尾条 | ProcessResourceShadows @0x253c4；ProcessAttack @0x311b8 |
| 数值/状态飘字 | EnemyDamaged、PlayerHealth、EnemyAttack、SkillCast、PretzelScored等 | SimpleLabel：t+=dt；t≥T隐藏；y-=speed*dt；alpha=A0*(1-(t/T)^2)；默认T=1，部分持久预览T=.2并复用；固定类型1/8/9/10速度.1，type3=.08，其余Rand(.1,.2,0) | SimpleLabel ctor @0x5eb78，Initialise @0x5fbc4，Process @0x5fc64；Thumb @0x4fc8c先除T再Sqr；Game::Start @0x260ac |
| 闪光flare | EnemyDamaged、SpecialEnemyGenerated、EnemyAttack/对应技能 | 初始size-scale=.08，随机角度0..360°，位置和RGBA由调用者指定；普通过程scale+=2dt、alphaFactor-=3.5dt→若从1开始约.285714s；敌攻阶段scale+=dt、alphaFactor-=4.5dt→约.222222s，低于.5切阶段 | AddFlare @0x29894 `0x3da3d70a=.08,0x43b40000=360`；Game::Process @0x339ac；ProcessAttack @0x311b8；InitialiseFlares @0x2a548 |
| 碎裂/火花/爆裂 | TileMatched(killed/broken)、EnemyDamaged(armourLoss)、EnemyAbility、SkillCast | 每组10个四边形；T=.3；速度向量先归一化，速率s+=a*dt，再顶点+=v*dt；alpha=255*(1-(t/.3)^2)；碎裂速度Rand(1,2)、加速度Rand(-3,-10)，火花速度Rand(.1,.3)、加速度Rand(-.5,-3)；保留原端点顺序 | Particles::InitialiseFromTile @0x5af68；几何@0x5aaf8/0x5a7d4；Process @0x5b02c，Thumb @0x4b060–6c |
| 护盾两片碎裂 | EnemyAttack.armourLoss>0（原生在护甲损失分支） | p+=2dt，p>1消失，名义.5s；左右dir=±1：x=x0+dir*.08*p，y=y0-.2*(.04-(.3-p)^2)，角度=dir*90*p，alpha=255*(1-p^3)；起点左(.4859375,1.29375)、右(.5078125,1.29375) | ProcessShieldShatter @0x252ac；ProcessShieldChunk @0x251e4；Thumb @0x15210用.3-p，@0x15228/2c pow指数3；Game::Start @0x260ac设置两块UV |
| 低血心跳 | PlayerHealth后持续、hp/maxHp≤.35 | q=clamp((hp/maxHp-.15)/.2,0,1)；一次搏动持续.3+.2q，搏动间等待.1+1.9q；开始搏动播放heartbeat；高血停止新的等待，当前搏动结束；颜色前20%二次上升，后段cos，完整cos参数待取 | ProcessHeartbeat @0x48dfc；Thumb @0x38e4e–f16：.15,.2,.3,.5,.1,2；UpdateHealthColour @0x48c38 |
| 选择调暗 | ChainPreview | CanMatchType=false立即alpha150；恢复255（燃烧overlay200）；不是补间 | UpdateDimming @0x25728；Dim @0x62f8c；Undim @0x62f14 |
| 敌攻背景调暗 | PhaseChanged(enemy-attack)/EnemyAttack | 仅bc5c∈1..7且attackDimming开；黑色Quad；攻击开始赋alpha200，初始化120。具体阶段淡化需跟ProcessAttack，不得始终遮HUD | Render @0x25924；Start @0x260ac；ProcessAttack @0x311b8 |
| 主菜单 | UI-local屏幕动作 | FadeIn .5，FadeOut .3；Loading alpha以500/s减少；普通按钮随背景alpha，禁用Continue/Scores为其半值 | MainMenu::FadeIn @0x52ba0；FadeOut @0x52b7c；Process @0x52c54 |
| 放弃当前局确认 | UI-local NewGame/Challenge/Tutorial | 入/出.3；背景遮罩为面板alpha的一半；出完才执行已确认动作 | MainMenu::Process @0x52c54；0x67c=.3 |
| 折叠菜单 | MenuRequested/ConfirmMenu→MenuClosed | p=t/.3；展开x=lerp(1,.071875,p)，收起反向，即从右侧320→23px；固定y=.28125→90px；背景alpha0→180或反向；结束后才应用选择（移植须尊重step已有提交时机，显示快照可延迟） | FoldoutMenu::Process @0x41fc4；Thumb @0x32082–c8：0x3d933333=.071875；Render @0x40eb4 |
| 游戏菜单 | UI-local HUD Menu / Continue | 显示/收起均.2；遮罩与所有菜单quad逐帧插值；期间不处理按键 | GameMenu::Show @0x4430c / Process @0x44564 `0x3e4ccccd` |
| 职业页 | UI-local打开/返回 | 归一化alpha每秒±5，完成.2；拖动图标缩放有Clamp/Interpolate，端点未完整恢复 | ClassScreen::Process @0x3a598；FadeOut @0x3730c |
| 模式/名字页 | UI-local | ModeScreen显示/隐藏.3；NameScreen状态细分见未决，不能假定与Class同速 | ModeScreen::Show @0x54e68；FadeOut @0x54650；NameScreen::Process @0x58704 |
| 帮助提示 | UI-local、帮助位或FIFO | 淡入/出.2，期间不响应关闭；完全隐藏后显示队列下一项 | HelpMenu::Show @0x48190；FadeOut @0x4747c；Process @0x483a4 |
| Tooltip | UI-local hold/show/hide | alpha+=dt*255*8，夹0..240；隐藏反向减，约240/2040=.117647s；alpha为0关闭；背景/标题/各行一起变化 | Tooltip::Process @0x659c0 |
| 高分榜翻页 | UI-local拖动/左右按钮 | 见下面专节；无固定毫秒时长 | ScoreScreen::Process @0x5dba8 |
| 局终数值计数 | GameOver | death/win用不同颜色和lose/levelup；计数、图标逐项出现，部分图标间隔.2，部分阶段p+=.5dt→2秒；完整分支顺序未决 | GameOverScreen::Initialise @0x457d4；Process @0x469dc +0x194=0x3e4ccccd |

## Token积分（已从Thumb补回缩放实参）

初始化：随机方向分量dx/dy∈[-.1,.1]（`0xbdcccccd/0x3dcccccd`），归一化后长度为.1；都为0时取(.1,0)。基础速度v∈[6,7]（`0x40c00000/0x40e00000`），转向参数a∈[1,1.35]（`0x3f800000/0x3faccccd`），u=0。普通XP另外抽v∈[4,6]，尺寸(.121875,.071875)→39×23；其余复制原tile Quad。所有这些抽样都是RAND_COSMETIC=0。[Token::InitialiseFromTile @0x653d0]

每帧重新找目标，d=target-position，r=length(d)，n=d/r；u+=a*dt。

```
if u <= 1:
    stepLength = v*dt
    delta = stepLength*((1-u)*initialDirection + u*n)
else:
    stepLength = u*v*dt
    delta = stepLength*n
if stepLength > r: active=false
else:
    position += delta
    scaleX = scaleY = clamp(r/initialDistance, .2, 1)
```

注意到达判定用stepLength，不是length(delta)；scale用移动前的r。缩放范围原伪C缺失，Thumb @0x552ca–f8证明r/initialDistance、r1=`0x3e4ccccd=.2`、r2=`0x3f800000=1`。没有恒定时长、没有alpha衰减。r=0等浮点边界应另作UI防护，不能以UI防护修改规则。

目标：potion→液面；skull/XP→经验条右端；coin→当前金币列顶；shield→护甲/UP目标；法力→已绑定skillSlot；吸血variant3→生命；有敌方接收者则指向敌人中心。[Interface::GetTarget @0x49028；GetSpecialTarget @0x4b254；Token::Process @0x65200]

## 高分榜分页

当前页0..5，拖动offset=touchX-startX；首尾往外拖置0。释放时：速度> .1或offset>.5翻上一页；速度<-.1或offset<-.5翻下一页；否则回弹。速度由 `(currentX-lastX)/dt` 与旧值插值，固定权重.4；吸附每帧 `offset=.7*offset+.3*target`，target∈{-1,0,1}；距离<.00625(2px)后归零、交换三份page缓存、更新页号。固定权重依赖帧率，不能称为0.3秒动画。[ScoreScreen::Process @0x5dba8；Thumb @0x4dc86–9a：0x3ecccccd=.4；@0x4dcd0–e0：0x3e99999a=.3；CreatePage @0x5e2ec]

## RNG所有权

| 抽样 | 当前引擎是否已消费 | UI能否重抽规则RNG |
|---|---|---|
| token4次，XP额外第5次 | tokenDraws已消费，值丢弃 | 不能 |
| 碎裂3+10×3=33次；火花1+10×8=81次 | particleDraws逐次randUnitF保留种子，值丢弃 | 不能 |
| flare角度；SimpleLabel非固定速度；特殊flight速度 | flareDraw/labelDraw/flightDraw已消费，值丢弃 | 不能 |
| 音效变体RandI(0,n-1,0) | 原生GetSoundMapping在Java播放阶段抽；当前引擎未提供对应声音队列 | 不能擅自追加，需专门决定兼容策略 |
| 原创纹理粒子、无规则影响的视觉扰动 | 非原生轨迹 | 可用独立UI seed；必须标为原创近似 |

证据：T04.report.md第162行；src/core/cosmetics.ts；data/turn.json.cosmetic；GetSoundMapping @0x67ea4。当前引擎“保留消耗”不等于“提供随机结果”。优先只增事件载荷暴露已经抽出的数值（后续卡需测试）；本卡不修改引擎。UI不能为了动画调用第二套同名rule RNG，也不能用消费Effect的乱序来模拟看起来先到的token：既有引擎队列顺序仍是权威。

## U02时间线建议与未决

建议拆成ScreenStack、BoardView、HudView、Overlay、EffectTimeline、SoundScheduler；每个动画有独立elapsed、完成条件和取消策略。规则快照、显示快照分离；菜单暂停drain，GameOver清除已失效effects；存档恢复时重建表现而不重复结算或播放整轮历史音效。这些是架构建议，非逆向结论。

尚缺：不同SimpleLabelType所有覆盖的T/scale/颜色表；Label本身是静态字形容器，移动由拥有者控制，不能为它虚构Process函数；多类特殊技能飞行参数和火焰overlay逐帧纹理；死亡/Sprint/Pretzel结算完整阶段次序；职业拖动图标缩放端点；所有EffectQueued对应来源位置（当前部分资源effect只有目标/类型，需事件扩展或可靠快照关联）。这些缺口不妨碍积分器、分层、事件缓存设计，但影响逐帧保真验收。

## U04 数据暴露补记

`step()`增加只读 `cosmetics` 返回值（不进RunState/存档），记录原有 `cosmetics.ts` 抽样及其发生时的事件索引；不新增抽样。token4/5值顺序为方向dx/dy、速度、加速度、可选XP速度。固定label速度type3=.08，其余固定type1/8/9/10=.1；`SimpleLabel::Initialise @0x5fbc4`。U04保留粒子原始unit样本；把样本映射到原创粒子几何仍属于表现近似。音效仍按12号允许的独立UI种子选择变体，不借此修改规则COSMETIC流。

## U05 补证：批内并发与敌攻时间常量（2026-10-16）

- `Game::MatchTiles @0x31bcc`在同一次调用里遍历整条链，对各Tile调用MatchTile／AttackSkull，最后MoveMatchedTiles；`Game::AddToken @0x2a934`立即调用`Token::InitialiseFromTile`并递增Game+b8e0。没有该批普通资源token的发射延迟字段或逐个sleep。
- `Game::Process @0x339ac`对`[0,b8e0)`每个0xa0字节Token检查+72活动标志，并在同帧逐个调用Process。token结束才AddResource；菜单／局终分支会提前返回。所谓错落主要来自不同起点、目标、随机v/a/方向，不能据此虚构“每隔180ms发射一颗”。
- `Token::InitialiseFromTile @0x653d0`将u(+8c)置0；`Token::Process @0x65200`每个token独立执行u+=a·dt。u≤1先加大朝目标方向的权重，u>1后步长也乘u。这是**单颗随飞行时间加速**，不是按token序号越晚发射越快。批内并发使总时长接近最长飞行／下落路径，而非所有token时长之和。
- `Game::ProcessAttack @0x311b8`：stage1遮罩alpha每秒+800至200（若起始0则.25s；Start初始化120时只需.1s）；stage2/3/4 flare因子每秒-4.5，跌破.5后转换，约.1111s；完全消失约.2222s。普通伤害label透明度每秒+8（.125s），反击每秒+3（.3333s），与flare尾段重叠；stage5/6飞行v初值1、v+=20dt、progress+=vdt，progress>1结束，连续近似约.2702s/段（实际Euler依dt）；stage7遮罩每秒-900，从200至0约.2222s。不是每个敌人固定等待260ms，也不能把这些重叠段直接全加成一个精确总时长。

U05实现沿用原token积分和实际抽样，取消每个EffectConsumed独占飞行以及任意视觉事件额外.3s等待。全部已创建token独立更新，显示资源提交继续服从既有引擎FIFO；原生按飞行到达消费与引擎显式FIFO之间的C2差异仍存在，禁止为了视觉顺序改规则。敌攻合并事件当前保留1/4.5秒反馈门槛；完整stage1–7飞行／遮罩细节未声称还原。可选快速模式将表现dt乘2，默认原版速度，不增加基于序号的无证据发射间隔。点击跳过清空当前表现，停止在下一个输入／菜单／局终边界，不确认菜单。
