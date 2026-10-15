# Dungeon Raid APK 分析报告

- 文件：`6c943188-0402-45d0-86da-174c77982b4f.apk`（SHA-256 `9e7ba024ee8ceefc0edc075dea7fd3462ff228179e872d6f1cf6245cff63e95d`）
- 工具：REA 6.4.0（`../rea`，JADX headless 0.7.1）+ apktool 3.0.2 / apksigner 辅助
- 日期：2026-10-15

## 基本信息

| 项 | 值 |
| --- | --- |
| 包名 / 版本 | `com.fireflame.dungeonraid` 1.2.11 (versionCode 14) |
| minSdk / targetSdk | 8 / 未声明（按 8 处理） |
| 类数 / 资源数 | 237 / 145 |
| 原生库 | `libDungeonRaidJni.so`，仅 `armeabi`、`armeabi-v7a`（32 位），无 arm64 |
| 签名 | 仅 v1；证书 `CN=chen, OU=zf, O=zf, L=hn, ST=hb, C=cn`，2017-09-16 生成，不是原开发者签名 |
| 权限 | INTERNET、WRITE_EXTERNAL_STORAGE、GET_ACCOUNTS、ACCESS_NETWORK_STATE |

## 结论一：未发现恶意代码，但这是第三方重打包版本

代码由三部分组成：

1. **游戏本体**（`com.fireflame.dungeonraid.*` 和 `wrappers.*`）：Java 层只负责 UI、声音和纹理，游戏逻辑在 JNI 里。
2. **OpenFeint SDK**（`com.openfeint.*`）：2011 年前后的成绩/社交 SDK，该服务已于 2012 年关闭。
3. **虫虫游戏（ccplay.cc）启动壳**（`com.fireflame.dungeonraid.s6.*`，共 7 个类）：由渠道注入。

逐项核查：

- **启动壳**：`StartActivity` 被设成 LAUNCHER，它先检查 assets 里有没有数据包需要解压到 `/data/data` 或 SD 卡。本 APK 的 assets 里只有一个字体，所以不会解压任何东西，直接进入 `WelcomeActivity`。`WelcomeActivity` 显示一张内嵌在代码里（Base64 PNG）的「虫虫游戏 ccplay.cc」品牌图，3 秒倒计时后读取 meta-data `PSTART`，启动原游戏的 `DungeonRaidActivity`。整个过程没有联网、没有动态加载、没有收集信息。
- **网络地址**：整个 dex 里只有 `api.openfeint.com` 和 `ads.openfeint.com` 两个地址，都属于 OpenFeint SDK，而且服务早已下线。
- **`Runtime.exec`**：只出现在 `OpenFeint Util.run`，由 `createSymbolic` 调用，作用是执行 `ln -s` 建软链接，属于 SDK 原有逻辑。
- **GET_ACCOUNTS**：`Util5.getAccountNameEclair` 会读取第一个 Google 账号的邮箱，只在 OpenFeint 注册引导界面（IntroFlow）用来预填。这是隐私上不太好的旧做法，但不是恶意行为。
- **加密 / 反射**：`javax.crypto` 只出现在 `OpenFeint Encryption`（本地数据加密），反射只用于 SDK 的兼容层和 WebNav 的 action 分发。
- **原生库**：导入表只有 `libc`、`libm`、`libGLESv1_CM`、`liblog`、`libdl`、`libstdc++`，其中 libc 只用到字符串/数学/`clock`/`exit`/`sscanf` 这类函数。没有 socket、exec、dlopen 外部文件，也没有可疑字符串。
- **没有**以下任何一项：DexClassLoader 动态加载、短信或电话 API、IMEI/设备号读取、已安装应用枚举、安装其他 APK、开机自启、设备管理器。

**风险提示**：签名不是原作者的，无法证明 `.so` 与原版完全一致。不过从导入表和字符串看，它是纯游戏逻辑库，没有可疑能力。

## 结论二：在新系统上的兼容性

| 问题 | 影响 |
| --- | --- |
| targetSdk = 8 | Android 14 起拒绝安装 targetSdk < 23 的应用，Android 15 起门槛提高到 24。正常方式**装不上**。 |
| 原生库只有 32 位 | 只支持 64 位的设备（Pixel 7 及之后、不少 2023 年以后的骁龙/天玑旗舰）**根本无法运行**。 |
| `.so` 有 TEXTREL（文本重定位） | 一旦把 targetSdk 提到 23 或更高，系统链接器会拒绝加载这个库，游戏启动就崩溃。所以「只改 targetSdk 重打包」这条路**走不通**。 |
| OpenFeint 使用 `org.apache.http`（20 个类） | 如果 targetSdk 提到 28 或更高，还需要声明 `org.apache.http.legacy`。服务本身已经死了，最好直接移除。 |
| 只有 v1 签名、WRITE_EXTERNAL_STORAGE、preferExternal | 在旧 target 下仍然可用，影响不大。 |

### 可行方案（按成本从低到高）

1. **原样侧载（手机支持 32 位时）**：
   `adb install --bypass-low-target-sdk-block <apk>`
   可以绕过 Android 14/15 的 targetSdk 安装限制。系统会弹「此应用专为旧版 Android 打造」的提示，但能运行。前提是手机 CPU 仍然支持 32 位应用。
2. **清理版重打包**：用 apktool 去掉虫虫壳（把 LAUNCHER 改回 `DungeonRaidActivity`）、去掉 OpenFeint 入口和 GET_ACCOUNTS，保持低 targetSdk，用自己的 key 重新做 v1+v2 签名。这样更干净，但安装仍然要走方案 1，32 位限制也还在。
3. **真正适配新手机（64 位、高 targetSdk）**：必须换掉 `libDungeonRaidJni.so`。可以逆向这个 JNI 库，或者按游戏规则重写逻辑（例如用 Web/JS 或 Kotlin 重新实现），再配一个新的 Android 外壳。Java 侧的 `wrappers.*`（DungeonRaidJNI 接口、枚举、物品/技能/敌人类型）可以作为重写时的规格参考。

## 复现命令

```sh
REA=../rea/.tools/bin/rea
$REA inspect-android-package <apk> --json
$REA search-android-classes <apk> ""
$REA inspect-android-method <apk> com.fireflame.dungeonraid.s6.app.StartActivity onCreate
```
