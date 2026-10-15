# Dungeon Raid 重写 / 移植路线图

- 起点：Android 版 1.2.11 APK。逻辑全部在 32 位原生库 `libDungeonRaidJni.so` 里（C++，导出符号完整），Java 层只负责外壳、输入、音频和 GL 纹理。
- 目标：能在 64 位 Android 14–16 上运行，targetSdk ≥ 35，同时提供网页版。
- 背景：原版无法直接适配，原因见 `../APK分析报告.md`。

## 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 规则引擎 | TypeScript 纯函数 + 种子 RNG | 可以用 Vitest 完整测试，便于和原版逐条对照 |
| 表现层 | Canvas 2D（Vite） | 原版是 2D 精灵加 GLES1 四边形，Canvas 足够 |
| Android 封装 | Capacitor | 产出 arm64 APK、高 targetSdk，没有原生 so 的包袱 |
| 美术 / 音效 | 先复用原版资源（仅个人使用） | 需要公开发布时，再走自己的像素素材产线替换 |

## 执行分工

- **Codex（gpt-6-astra）**：规格提取、规则引擎、数据表。这些都能用测试或证据在沙箱里自证。
- **Claude**：派发任务卡、验收（读 diff、重跑测试、抽查证据）、表现层联调和截图、Android 打包与模拟器验证。
- 派发方式见 `docs/WORKFLOW.md`。

## 阶段

| 阶段 | 内容 | 产出 | 验收 |
| --- | --- | --- | --- |
| P0 逆向资料 | apktool / jadx / Ghidra 全量反编译，整理进 `reverse/` | `reverse/` | 已完成（Claude） |
| P1 规格提取 | 从反编译结果还原规则：棋盘、连线、伤害、敌人、升级 / 技能 / 物品、种族 / 职业 / 难度 / 模式、计分、存档格式 | `docs/spec/*.md` 和 `data/*.json` | 每条规格都有证据；枚举与 SWIG wrapper 一致；抽查 10 条反编译证据 |
| P2 规则引擎 | `src/core`：棋盘生成与下落、连线判定、回合结算、敌人行为、成长系统、游戏结束与计分 | 代码和单元测试 | Vitest 全绿；按种子回放的确定性测试 |
| P3 表现层 | 渲染、触摸拖线、动画、音效、菜单、帮助页 | `src/ui` | 浏览器截图，并与原版截图对照 |
| P4 外围系统 | 存档（localStorage / Capacitor Preferences）、职业解锁与成就、本地高分榜（替代 OpenFeint） | | 存档往返测试 |
| P5 Android 封装 | Capacitor 工程，arm64，targetSdk 35 | APK | 在 Android 15 模拟器上安装并试玩 |
| P6 行为对照 | 在支持 32 位的模拟器（API 30 arm64 镜像）里跑原版 APK，逐项对照手感和数值 | 差异清单 | 用户试玩确认 |

## 当前状态

- 2026-10-15：完成 P0。
- 2026-10-15：T01 验收通过（Codex gpt-6-astra，约 40 分钟）。产出 `docs/spec/00–02` 和 `data/enums.json`（20 个枚举、315 项）。Claude 独立复核：枚举项数、字符串偏移、Healer 目标数为 2、Spiky 反伤为一份 D、吸血公式，全部相符。未决问题见 `docs/tasks/T01.report.md`。
- 2026-10-15：T02 验收通过，**P1 规格阶段完成**。产出 `docs/spec/03–07`、`data/items.json` 和 `data/classes.json`，以及 114 条行为用例。Claude 独立复核：重新提取后 SHA-256 一致；42 项技能冷却表与二进制 `0x6f8c0` 逐字节一致；Wish 施放后被移除；Devourer 降级步长的修正有据（ReduceStat→GetStatDowngrade）。T01 的未决项 O1、B3、C1、B4 已关闭；仍待原版运行验证的是 B1、B2、C2、C3、C4、I1、S1、A1，见 `docs/tasks/T02.report.md`。
- 下一步：P2 规则引擎（T03）。先实现已闭合的单体规则，并把 07 中的用例写成 Vitest 测试。
