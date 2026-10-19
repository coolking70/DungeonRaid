# 原版默认美术（U14 / U15）

来自 Dungeon Raid Android 1.2.11（Firedrake Games）的原版资源，按用户要求接入并推送为默认。所有文件逐字节复制；不修改`reverse/`和原APK，也不改变原素材的权利归属。

| 文件 | 只读来源 | 默认用途 |
| --- | --- | --- |
| `tiles.png` | `reverse/apktool/res/drawable-nodpi-v4/tiles.png` | 棋盘、变体、技能/属性、HUD、效果、首页 |
| `menus.png` | 同目录同名文件 | 职业/种族/天赋/缺陷、菜单组件 |
| `icons.png` | 同目录同名文件 | 400个装备图标 |
| `font.png` / `font.fnt` | drawable-nodpi-v4 / raw目录同名文件 | 英文正文 |
| `font_menu.png` / `font_menu.fnt` | drawable-nodpi-v4 / raw目录同名文件 | 英文标题 |
| `font_score.png` / `font_score.fnt` | drawable-nodpi-v4 / raw目录同名文件 | 敌人数字 |
| `splash.png` | drawable-nodpi-v4同名文件 | 加载期间启动图 |
| `icon.png` | `reverse/apktool/res/drawable-xhdpi-v4/icon.png` | 网页与主屏幕图标 |

各文件SHA-256记录在[sources.json](sources.json)，测试锁定校验值。构建仅依赖本目录和已跟踪的数据，不需要`reverse/`。

- `tools/native-art.mjs`提供原版图集坐标，沿用界面的语义资源ID；区别512px菜单图集和1024px棋盘/装备图集，不能套用A01–A03坐标。
- 默认整套游戏美术为原版；`?art=redrawn`保留旧重绘对照。重绘未覆盖的箭、破损剑盾、特殊药水仍用原版格位兜底。
- 中文及原版位图字体未收录的字形回退到Fusion Pixel。双语按钮保留实时文字；新增界面组件复用原版图形，布局与分页属于Web适配。
- 魔剑及菜单调色运行时生成；教程图示也按脚本实时绘制，不存储依赖美术位置的示意截图。
- 原版OpenFeint独立SDK页面未在此重构版实现，不引入其素材或联网入口。
- 证据与验收：[U14报告](../../docs/tasks/U14.report.md)、[U15报告](../../docs/tasks/U15.report.md)、[UI规格](../../docs/spec/10-ui-screens.md)。
