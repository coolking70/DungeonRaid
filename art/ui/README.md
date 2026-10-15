# A02 原创界面素材

本目录只包含原创 OpenAI 内置 imagegen 产物及其程序处理结果。没有原版裁片，也没有把原版图片用于生成、描摹或配色。

## 使用与重建

```sh
python3 tools/art/ui_build.py
python3 tools/art/ui_check.py
python3 tools/art/ui_check.py --copyright
```

依赖 Python 3、Pillow、numpy。普通重建只使用本仓库的 `src/base/`、来源 JSON、规格 JSON 和 A01 原创棋盘预览素材，不需要网络或生成缓存。首次导入/重新处理缓存可执行 `python3 tools/art/ui_build.py --prepare`；缓存原图路径写在 `src/records/*.json`，原图留在 Codex `generated_images` 中。

- `ui.png`：RGBA，2 倍逻辑分辨率，每个逻辑像素严格对应 2×2 像素，建议 nearest 采样、关闭 mipmap。
- `manifest.json.assets`：实际打包的图块，各 `rect=[x,y,w,h]` 为图集像素，彼此无重叠。
- `manifest.json.elements`：规格逻辑元素，包含 90 个语义图标和 UI 元素。多个元素可通过 `asset` 复用同一图块，因此这些绑定的 rect 可以相同。
- `logicalSize`：元素已确认的逻辑尺寸。`null` 代表动态或未决；不得将其解释为零或用底图尺寸代替。
- `sourceSize`：共用底图的设计尺寸，不是未解复合面板的最终尺寸。
- `nineSlice`、`sliceMargins`：边距顺序左、上、右、下，单位为逻辑像素；`sliceMarginsAtlas` 为两倍的图集像素。拉伸中间和边条，四角保持原尺寸。图标不可九宫格拉伸。
- `states`：引用实际图块或指定灰化、alpha、叠加框。选中外框需要按目标图标尺寸九宫格拉伸；锁图标保持自身大小并放在角落，不能铺满整个图标。
- `source` / `prompt` / `sourceId` / `sourceFile` / 哈希：每个图块的真实生成提示词、来源与处理链。

所有标题、按钮字、属性数值由 UI 字体绘制。`render=font/solid-color/external-atlas/dynamic-icon` 是显式的无图绑定，不是缺图。键盘复用按钮底、网格复用槽框，文本和布局仍由 UI 实现。

## HUD 与效果

经验紫、金币金、强化蓝是本套原创配色，不声称来自原版取色。三种资源共用 `hud.resource.slot`。资源填充裁切而非九宫格拉伸；选择预览 alpha 使用规格值。

`hud.health` 为红液体层，`hud.health.frame` 为瓶身层，位置对齐。液面应在 `fillBounds`（逻辑 left/top/right/bottom）内从底部向上裁切，然后叠加瓶身。`hud.health.bottle` 保留合成原始图，便于检查分层。

金币整列使用 `hud.gold-full`，部分列使用 `hud.gold.column`；具体列数和裁切高度读取原规则。护甲图标为 `hud.armour.icon`，数值仍由字体绘制。

技能框中央开口为 49×49，外框 53×53。`charging`/`ready`/`disabled` 提供区别明显的框色；技能图标的充能裁切按 `charge/cooldown`，不是将槽框缩放。

毒、燃烧、冰冻状态标记，死亡叉、光斑、可着色粒子、护盾左右片及帮助尖角见 manifest.effects。补件尺寸是原创设计种子，原生 UV 或动画周期未解的部分没有伪造常量。

## 检查图

- `contact_sheet.png`：全部实际图块；语义图标同时列出 32px 样本。
- `preview.png`：三个 320×480 逻辑画面的并排示意：主菜单、HUD、折叠菜单。只验风格与清晰度，不作为未解原生布局的证据。
- `states_preview.png`：按钮三态、技能框四态、不同宽度九宫格。
- 所有预览文字均由脚本字体叠加，不存在于交付图集中。

`ui_check.py` 独立从规格提取覆盖集合，检查透明区、2 倍像素、逻辑尺寸、所有 4,005 对图标、状态引用、来源与哈希。数字差异只筛查重复近似，不能替代联系表的人工辨识。

`--copyright` 是任务卡授权的只读数值比较例外：对应原版 UV 缩到 64px，在黑/白底计算 RGB 相似度及局部 SSIM，阈值分别 0.90 / 0.80（沿用 A01）。不显示、不保存原版裁片。原生 UV 未决、字体和代码绘制项明确列入 notApplicable，不假装已完成比较。
