# 原版棋盘图集（U14视觉核对）

`tiles.png` 是 Dungeon Raid Android 1.2.11 的原版1024×1024棋盘/界面图集，来自只读的 `reverse/apktool/res/drawable-nodpi-v4/tiles.png`，字节未改动。

- SHA-256：`4fc14a9d6f88a2580c7162759e8befc2eafcfa524f709f3329ef4a3f8b65ddc8`
- 来源：Firedrake Games 原版APK；不是本项目原创素材，不改变其权利归属。
- 用户在U14明确授权接入、推送原版资源以核对格子强化和变体显示。默认线上/本地棋盘使用此图集；菜单与装备图集保持现有资源。
- `?art=redrawn` 可对照A01重绘棋盘。A01尚无箭、破损剑盾和特殊药水格位，这些格位仍从本原版图集绘制，避免空白。
- 原版资源仅复制到此目录；未修改 `reverse/` 或APK。构建不需要未跟踪的 `reverse/` 目录。
- 魔剑蓝紫染色运行时使用原版RGB(150,150,255)调制，无预烘焙图片；其余变体使用原版UV，见 `docs/tasks/U14.report.md`。
