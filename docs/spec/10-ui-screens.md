# 10 界面、坐标与屏幕流转（U01）

## 读取约定和完成边界

本卡只提取规格，不改变引擎/界面。`data/ui-layout.json` 是元素索引与已确认几何；`sourceIndex` 是构造器、Initialise、Make/Render 的原始常量索引，**不是已经恢复的布局**。`rect:null` 或分量为 null 表示未决，`rectFormula` 表示随文字/状态计算；不得把 null 当作 0。常量索引的 `float32IfFloat` 只是位解释，不能把对象偏移、整数、枚举或指针误当浮点数。

地址默认 Ghidra；标明 ELF/Thumb 的地址比 Ghidra 少 `0x10000`。字符串偏移是文件偏移，独立于前两种地址。[证据：00-overview.md；functions.tsv；ELF section headers]

P3 硬约束：320×480 逻辑画布、中英切换且默认中文；烘焙字全部改用字体；美术原创重绘，字体用 OFL 子集；音效原创合成。原图片本卡只用于元素命名、文字转录，无复制/裁切；后续生成不得把原图作为输入。[来源：docs/P3-PLAN.md 用户决定]

## 坐标、缩放与输入

原生投影是 `glOrthof(0,1,1.5,0,-10,10)`；原点左上、Y 向下。本文逻辑像素 = 原生坐标 **两个轴都乘 320**，不能把 Y 乘480。`0x3f800000=1`、`0x3fc00000=1.5`、`0xc1200000=-10`、`0x41200000=10`。[Game::SetupRenderer @0x26470]

实际表面 W×H：若 W/H≥0.6666667，vh=int(H)，vw=int(vh×0.6666667)，vx=int((W-vw)/2)，vy=0；否则 vw=int(W)，vh=int(vw/0.6666667)，vx=0，vy=int((H-vh)/2)。边缘为黑色，`Game::Render` 每帧 `glClearColor(0,0,0,1)`。整数截断会有1像素边差。[SetupRenderer @0x26470；Render @0x25924]

`App::resize @0x243c8` 实际不做任何布局更新；`DungeonRaidRenderer.onSurfaceChanged` 调用 `App.init(width,height)`，构造 Game 再 SetupRenderer。U02 应重新计算 viewport，不照搬重建 Game 的生命周期副作用。这是移植建议。

Java `convertToViewCoords` 输出 `x=(eventX-vx)/vw,y=(eventY-vy)/vh`。原生 TouchStart/Drag 把 Y 再乘1.5；触摸类型 DOWN/MOVE/UP/CANCEL 分别调 TouchStart/Drag/End/Interrupted。逻辑输入应直接换算成320×480。抬起/取消都要处理，不能复用调试界面取消时仍提交有效链的实现。[DungeonRaidSurfaceView.java；Game::TouchStart @0x2442c、TouchDrag @0x24448、TouchEnd @0x24460、TouchInterrupted @0x24468；本地ui/main.ts]

`Quad` 默认中心(.5,.75)，size(1,1)，scale(1,1)，白色alpha255。实际绘制依次 translate(center)、scale、rotate；触摸规则须跟随原生 ContainsPoint，不能直接用旋转后的包围盒冒充原矩形。[Quad::Quad @0x5b170；SetSize @0x5b37c；Render @0x5b528；ContainsPoint @0x5b4b4]

`QuadStrip` 用左上角定位；默认纹理分母512。其 SetUV 输入是512图集像素坐标，除512成为UV。JSON按任务统一成1024网格，menus 的坐标×2；这不表示要把原图放大。tiles/icons 本身是1024网格。[QuadStrip::QuadStrip @0x5b5b4：+0x34=0x200；SetPosition @0x5b980；SetUV @0x5c1f0；TextureManager.getTexture]

## 屏幕状态机

原生各组件维护 visible/fading 标记，允许同时可见；不能强行还原成单一互斥枚举。以下时间单位秒。没有在代码中确认固定时长的格子明确标注未决。

| 起点→终点 | 触发/条件 | 过渡与证据 |
|---|---|---|
| 启动→主菜单 | Game::Start 完成字体、职业、存档初始化 | Loading alpha 每秒减500、菜单相反增加，255/500≈0.51；MainMenu::Process @0x52c54 |
| 主菜单→继续局内 | 点击 Continue 且存在存档 | ContinueGame；主菜单 FadeOut 0.3，@0x52b7c `0x3e99999a`；Process @0x52c54 case0 |
| 主菜单→新游戏/挑战/教程 | New Game/Challenge/Tutorial；已有存档先确认 | case1/2/3；确认面板淡入、淡出均0.3；取消不启动；@0x52c54 +0x674=0/1/2 |
| 主菜单→名字/难度/职业设置 | Game::NewGame / StartChallenge | NameScreen；StartChallenge还设置挑战状态；NewGame @0x2de68、StartChallenge @0x2de10、NameScreen::Show @0x589a0；具体入口组合见未决 |
| 名字页↔职业页 | 职业按钮/Return/Back | ClassScreen::Initialise @0x3a264；Process @0x3a598 alpha参数±5dt→0.2；FadeOut @0x3730c先Validate并SerialiseClasses |
| 职业页内部 | 四个标签 Class / Race / Perks & Flaws / Skills | SelectTab @0x39ba8 参数0..3，重置拖动/说明；不是五个独立页面 |
| 名字页↔模式页 | 挑战模式按钮/返回 | ModeScreen::Show @0x54e68 / FadeOut @0x54650，0.3 |
| 名字页→开场叙述→局内 | 开始及点击跳过/完成叙述 | IntroScreen::Initialise @0x4b668 / Process @0x4b35c；进入局内触发 start；完整交叉淡化时序未决 |
| 局内↔游戏菜单 | HUD Menu / Continue | Interface::ProcessInput @0x49738；GameMenu::Show @0x4430c / Process @0x44564；显示/收起均0.2，Show @0x4430c / Process @0x44564 `0x3e4ccccd` |
| 局内↔属性页 | HUD Stats / 关闭 | StatsMenu::Show @0x614bc / Process @0x61d84；动态高度 |
| 局内→奖励菜单→局内 | XP/Gold/UP跨门槛，MenuRequested(kind)；确认选择 | FoldoutMenu::Initialise @0x42794 / Process @0x41fc4；展开/收起各0.3；升级选2，商店/强化选1 |
| 任意允许帮助的位置→帮助→原屏幕 | HelpType位开启，当前无帮助；点击提示内关闭 | HelpMenu::Initialise @0x48348 / Show @0x48190 / FadeOut @0x4747c；淡入/出各0.2；结束后FIFO出下一条 |
| 局内→死亡/胜利结算 | GameOver；Sprint成功outcome.won | GameOverScreen::Initialise @0x457d4：死红(182,42,15)，胜绿(64,226,0)；音效lose/levelup；不是同一失败提示 |
| Pretzel结算 | 挑战mode=1 | Experience/Gold/Upgrades改为Average Length/Max Length/Total Pretzels；@0x457d4。计分阈值引用scoring.json，不按标题猜 |
| 主菜单/结算→高分榜 | Scores；有记录才启用 | ScoreScreen::Show @0x5da94 等重载；FadeOut @0x5c444=0.3；六页、每页10条，CreatePage @0x5e2ec |
| 高分榜上一/下一页 | 箭头或水平拖动 | Process @0x5dba8：页0..5，首尾不循环；逐帧插值而非固定秒数，见11-animation |
| 解锁提示→原屏幕 | 职业成长/奖杯奖励 | UnlockMenu::Show @0x66fc4；独立overlay，levelup音；详细布局/关闭时序未决 |

Android Back：Activity 在主菜单活动时调用系统返回；其他时候 Game::BackPressed 先清空帮助并淡出帮助。然后按 Class→Mode→Name、Scores、GameOver 分支返回；局内只有奖励/游戏/属性菜单都未打开才 MainMenu::FadeIn(0.5)。不能声明所有弹层 Back 都会关闭。[DungeonRaidActivity.onBackPressed；Game::BackPressed @0x26a98；MainMenu::FadeIn @0x52ba0]

生命周期：Activity 没有实现 onPause/onResume 游戏暂停屏；`App::pause @0x243cc`是空操作。Android系统暂停与“游戏菜单”应分开。后台冻结表现时钟、恢复后继续原 pending、避免重放音频，是U02建议，非原版已有行为。

## 棋盘、HUD与可见条件

棋盘6×6，格宽 `0x3e29999a=0.165625→53`；中心 `((x+.5)*53+1,(y+.5)*53+79)`，因此左上(1,79)、318×318；挑战偏移 `0x3c800000=.015625→5`。方向阈值 `0x3da9999a=.0828125→26.5`。[Game::Start @0x260ac；CalculateTilePositions @0x25f64]

连线不是Canvas圆头线：Arrow::Update @0x34f48沿链建立三角条带，法向半宽`.0140625→4.5`，直段全宽9；转角使用归一化切向、2.613126倍转角修正及`.033949878→10.863961`偏移，端点另发顶点。顶点alpha按节点序号 `100+100*i/N`。颜色由Arrow::SetColour及ProcessTileSelection设置，最终色值/各端点分支未完整恢复，不应用调试台6px圆头白线代替原规格。

选择链变化时 UpdateDimming 调 CanMatchType；不能匹配的tile/overlay/敌人数值alpha150(`0x96`)，取消调暗恢复255，燃烧overlay恢复200。这里无渐变。[Game::UpdateDimming @0x25728；Tile::Dim @0x62f8c、Undim @0x62f14]

UpdateCrossVisibility @0x2c5e8由选中链的杀伤预览控制死亡叉；移植用ChainPreview.enemies.lethal/transforms。现有预览已包含leech/spikes/fire，不能在UI重新随机模拟规则。

| HUD部件 | 逻辑几何/填充 | 原始证据 |
|---|---|---|
| 下方背景 | (0,404,320,76) | Interface::Interface @0x4a414 size(1,.2375)，底1.5 |
| 上方背景 | (0,0,320,73) | 同函数size(1,.228125)，顶0 |
| 经验条 | (110,463,100*f,10)，f=余数/100；同步裁UV | UpdateXPBar @0x49e34：.34375,1.446875,.3125,.03125 |
| 强化条 | (110,445,100*f,10) | UpdateUPBar @0x49f40：1.390625，其他同上 |
| 生命液面 | x239,width71,bottom470,height64*f；f=min(hp,maxHp)/maxHp | UpdateHealthBar @0x4a03c：.746875,.221875,1.46875,.2 |
| 生命文本 | `%d/%d`，中心x273，baseline463，scale.09 | 同函数；底层字体度量见下节 |
| 护甲文本 | 当前/最大，中心x159，baseline437，scale.09，RGB(173,177,255) | UpdateShieldValue @0x48fa8：.496875、0x3faecccd=1.365625；Interface ctor |
| 金币满列 | n=floor(gold/20)，x5,width16*n,height61,bottom476 | UpdateGoldBar @0x4a1dc：.015625,.05,.190625,1.4875 |
| 金币余列 | r=gold%20，x5+16n,width16,height3r,bottom476；r=0隐藏 | 同函数：.009375；原生把空列移到world(200,200) |
| 技能4格 | 中心x32.5/91.5/150.5/209.5，y32.5；每格53×53 | Interface ctor；ELF startup @0x38790及literal pool @0x387c8–d4，见JSON |
| 技能充能 | 底部向上高度53*(charge/cooldown)，未满RGB200，满白；空槽不处理 | UpdateSkills @0x49544 `.165625,.0828125`，顶UV `.4248047-f*.051757812` |
| Menu/Stats | (242,5,72,26)/(242,33,72,26)，clock启用时有变体 | Interface ctor；SetClockState @0x487dc |
| 毒飘字定位 | (273,443) | GetPoisonPosition @0x48774：0x3f5a6666=.853125，0x3fb13333=1.384375 |

资源影子是选择时的确定性预览，不是预计随机bonus。具体填充复用资源条函数；基础alpha：HP/UP120，XP/金币80。[Game::ProcessResourceShadows @0x253c4；Interface ctor +0x2b8/32c/3a0/414/488；SetHealthShadow/SetXPshadow/SetUPshadow/SetGoldShadow]

提示框：Tooltip按标题/属性行测量宽高，靠近底部时放到锚点上方，x溢出右边时改为1-width，x按320像素取整。普通文字scale.11；行距由 `(lineHeight-base)/lineHeight*.11` 得到。[Tooltip::Show @0x65764；InitialiseLabels @0x661a8]

帮助：宽`.98→313.6`、居中x截断为3；高度`16*行数+41.6`，文本相对x19.2、第一baseline32、后续每行16；锚点Y<.75时放下面，反之上面。显示一次即清对应help位，全部清完关闭自动帮助。[HelpMenu::Show @0x48190；InitialiseLabels @0x47eb4；Initialise @0x48348；Game::UpdateHelpState @0x24fb0]

## 字体与字符串

| 字体 | fnt行高/base/字符数 | 显示用途 |
|---|---|---|
| regular | 44 / 22 / 95 | 普通说明、帮助、HUD数值 |
| menu | 19 / 16 / 32 | 菜单标题；UseSmallCaps |
| score | 42 / 21 / 48 | 高分数字、挑战统计；UseSmallCaps |

证据：raw/font*.fnt `common`/`chars`；FontFactory.readFont；Game::SetFonts @0x2578c。fnt的size=44不表示屏幕上44px：AdjustCharacter @0x43980先除lineHeight，Label再乘自身scale和320；xoffset/xadvance还有0.5系数。帮助scale.1对应归一化行框32px，但布局baseline间隔16px；不应把这两个数混为CSS font-size/line-height。

`ui-strings.json`收录23条帮助、61段开场叙述、30个键盘表项（含空白占位）、检出的显示字面量/格式串、内联ASCII、烘焙标题。`references`解析已有enums/items/classes/specials/scoring数据中的text对象，不把格式占位符翻译掉。所有本地固定表给出ELF地址和文件偏移。长度上限按已知容器估算，未知容器保留null；本卡不编造服务端成就英文名。

## 层级（从后向前）

Game::Render @0x25924：棋盘本体→额外QuadStrip→敌人文字→overlay与死亡叉→敌攻调暗→HUD→flare→敌攻条/伤害提示→选择连线→token→粒子→SimpleLabel飘字→护盾碎片/预览提示→Interface菜单→Tooltip→主菜单/Name/Intro→Unlock→Help→GameOver。Scores/Name活动时有提前返回/专用分支。JSON layer是移植分组序号，非原生z常量。

## 未决问题（U02/U03不得静默补全）

1. NameScreen键盘/名字/难度，ClassScreen复合面板、拖动缩放、职业格及种族格最终rect，ScorePage列宽、GameOver逐项布局和Unlock仍仅部分恢复。sourceIndex提供函数、行号、原常量；需进一步Thumb参数追踪，不能称为逐屏完成。
2. Menu::SetQuad / QuadStrip::AddQuad不少浮点/栈参数被伪C丢失，尚未把所有九宫格切片和运行时拉伸尺寸化成最终元素表；已知布局与待解元素分别显式标识。
3. Arrow转角/端点和RGB、Tile火焰/冰冻overlay的周期、心跳颜色完整cos参数、Tutorial开场完整状态顺序仍需补取。
4. 名称输入上限、每个翻译容器的字符容量需按字体实测；不能拿C缓冲长度当作屏幕可容纳字符数。
5. OpenFeint/High Scores/Bonus Item/More Games属于旧服务入口；P3未授权恢复外部服务。保留原文/动作证据，是否替换为本地成就入口由后续产品决定。

输入边沿复核：TouchEnd置state=2、TouchInterrupted置3（Game @0x24460/@0x24468）。Interface技能与GameMenu按钮在2/3均检查命中；HUD Menu/Stats只检查按下命中、在2/3打开而不重查。主菜单Yes/No/Bonus在按下就动作，Foldout选项也在按下切换。不得为所有元素套同一个HTML click语义。菜单设置顺序是Continue、Sound、Help、Clock、Dimming、Smooth、Main Menu；原生GameMenu::Process @0x44564的case12/13/14分别为clock/dimming/highFramerate。
