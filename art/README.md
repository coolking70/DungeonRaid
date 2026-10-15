# A01 原创棋盘图集

`tiles.png` 是 2048×2048 RGBA 图集，75 个 106×106 格位；坐标按
`docs/tasks/A01.prompt.md` 的原版逻辑坐标乘 2，其余像素全透明。

## 重建与检查

环境：Python 3、Pillow、numpy。无需 Node、API key、网络或原版图像。

```sh
python3 tools/art/build_atlas.py
python3 tools/art/check_atlas.py
```

构建只读 `art/generations.json` 和 `art/src/base/*.png`，生成最终图块、图集、
manifest、棋盘预览与全图块联系表。不要修改构建生成的 `art/src/*.png`；
改动应落在处理后的 base 图块或构建参数中。

- `preview.png`：固定种子 1001 的 6×6 棋盘，左侧 106 px、右侧 64 px，
  敌人叠加示例攻击、防御和生命数字。
- `contact_sheet.png`：75 格逐个以 64 px 显示，附编号／名称。
- `manifest.json`：每格的 UV、来源、完整生成提示词、程序变体参数和 SHA-256。
- `generations.json`：每次内置 imagegen 生成的原始缓存路径、提示词、原图哈希和预处理参数。
- `src/base/`：40 个经裁切、量化、去背景处理的原创中间图块。
- `src/`：75 个最终不透明图块。

原始生成图只保留在 Codex 的 `generated_images` 缓存；项目不收录原始大图。
若缓存仍在，可执行 `python3 tools/art/prepare_sources.py` 重做预处理，再构建。
该预处理脚本拒绝 `reverse/` 输入；普通重建不依赖这些缓存路径。

## 只读原版数值对比

```sh
python3 tools/art/check_atlas.py --copyright
```

仅此选项按任务卡「版权自检」例外读取原版对应格位，计算像素差与局部 SSIM。
不导出原版裁片、不显示原版图像，也不将原版像素传给生成或构建流程。
固定阈值：RGB 相似度 < 0.90，SSIM < 0.80；阈值在读取原版之前设定。
黑底、白底分别合成，报告较高值。数值只用于筛查近似图像，不是法律结论。

普通自检写 `check_result.json`，原版数值对比写 `check_copyright.json`。
敌人差异检查覆盖全部 496 对，64 px 整格及中央区域平均 RGB 差均须大于 12/255。
