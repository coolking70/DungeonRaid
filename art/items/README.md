# A03 原创装备图标

`items.png` 是 1960×1960 RGBA 图集：20列×20行，每格98px，slot 0–399行优先。
取图坐标：`x=(slot%20)*98`，`y=floor(slot/20)*98`，宽高均为98。
图标在49逻辑像素上制作，再最近邻放大2倍；背景透明，底框由界面绘制。

- `manifest.json`：13组、80张基础图、400槽位，含来源、完整提示词、变体参数、坐标和哈希。
- `contact_sheet.png`：400槽位，实际49px显示，编号0–399，交替深浅底用于边缘检查。
- `base_contact_sheet.png`：80种基础造型的98px总览。
- `src/base/*.png`：可移植的49px原创基础图。正常重建只依赖这些图和`src/bases.json`，无需生成缓存。
- `src/recipes.json`及`src/*.generation.json`：逐张文字生成配方和原始缓存路径。原始大图保留在Codex生成缓存中。
- `check_result.json`、`check_copyright.json`、`rebuild_check.json`：自动检查结果。

## 重跑

需要Python3、Pillow、numpy。仓库根目录运行：

```sh
python3 tools/art/items_build.py
python3 tools/art/items_check.py --rebuild
python3 tools/art/items_check.py --copyright
```

只有从本机原始生成缓存重新进行裁切/量化时才需要：

```sh
python3 tools/art/items_build.py --prepare
```

`--prepare`只接受`generated_images`目录中的原始生成图；正常构建不读取`reverse/`。
`--copyright`是任务卡明确允许的数值比较例外：只读取原图像素、输出数值和哈希，不显示或导出原图裁片，不将它们提供给生成器。

分组以`data/items.json.nameMappings`左闭右开区间为准，装备类型以`slots.iconRangeInclusive`闭区间为准。
名称池内名词用于创作灵感，不代表slot具有固定装备名。铜、金、秘银、象牙色材质仅是外观，不代表稀有度、属性或价格。

全部基础图使用OpenAI内置imagegen从文字独立生成，无参考图片；程序变体由构建脚本完成。
验收细节、阈值、局限和证据见`docs/tasks/A03.report.md`。
