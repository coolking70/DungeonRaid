# Dungeon Raid 重写 / 移植 —— 执行者须知

本仓库的目标是用 TypeScript 重写 Android 版 Dungeon Raid 1.2.11（Firedrake Games，2012），并打包成能在当前 64 位 Android 手机上运行的应用。

## 权威资料（规格来源）

- `reverse/` 下的材料是**规格**，不要凭记忆或网上资料编造规则。
  - `reverse/native/libDungeonRaidJni.so`：armeabi-v7a 版原生库，游戏逻辑全在这里（C++，导出符号未剥离）。
  - `reverse/native/ghidra/`：Ghidra 反编译出的伪 C，按函数拆分。
  - `reverse/native/strings.txt`、`disasm-thumb.txt`：字符串表、Thumb 反汇编。
  - `reverse/jadx/`：Java 层反编译结果。`wrappers/*` 是 SWIG 生成的接口，其中的枚举顺序和数值是权威的。
  - `reverse/apktool/`：资源，包括贴图 `res/drawable-nodpi-v4`、音效 `res/raw/*.ogg`、位图字体 `*.fnt`。
- 遇到无法确认的地方，写进对应规格文档的「未决问题」，**不要猜**。
- 每条规格结论都要附上证据：函数名或地址、常量值、字符串偏移。

## 结构约定

- `docs/PLAN.md`：路线图。
- `docs/spec/`：规格文档。
- `docs/tasks/`：任务卡。
- `src/core/`：纯规则引擎，不得依赖 DOM、Canvas 或计时器；随机数用可注入的种子 RNG。
- `src/ui/`：表现层（Canvas 2D、输入、音频）。
- `data/`：从原版提取出的数据表（JSON），每个文件头部注明来源函数。
- 测试使用 Vitest；规则层的每条行为都要有测试锁定。

## 硬性规则

- 不修改 `reverse/` 下的任何文件，也不修改原 APK。
- 原版美术和音效**仅供个人使用**，不要提交到任何公开远端。
- 每张任务卡完成后，在 `docs/tasks/<卡号>.report.md` 写报告，内容包括：做了什么、证据、测试结果、未决问题。
