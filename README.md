# Signal Window

不依赖原第三方 QQ 客户端的多设备 AstrBot 聊天窗口。历史 UMO 中的旧前缀只用于保持已有 AstrBot 记忆连续，不代表任何隶属关系。

## 项目定位：SnowLuma 不可用后的本地兜底

这是将来 SnowLuma 彻底不可用时的一套兜底方案。

它模拟一个本地聊天页面，供 AstrBot 接入；有能力的用户可以把接口兼容到 Android。项目支持“许愿式编程”：需要什么功能可以直接向 DSH 描述，由 DSH 在当前源码和开放接口上继续实现。

它兼容通过原生桥接进入 QQ 的记忆（例如已有的 AstrBot 会话 UMO）。对于个人安装的记忆插件，可以许愿让 DSH 适配；项目接口刻意保持开放，不要求所有人使用同一套记忆实现。

不会部署的用户，可以把部署工作交给 DSH：文档按 DSH 易读、可执行的方式组织。

这个项目主要给 0 基础的小白提供框架方向，让原本桥接到 QQ 的 AstrBot 鱼不再依赖 QQ，而是在本地“复活”。项目不承诺持续更新，其他人可以自由增减和继续更新。

### 许可证与源码

本项目原创代码采用 **GNU Affero General Public License v3.0 only（AGPL-3.0-only）**。

**对于非盈利目的完全开放。** 个人使用、学习、研究、非营利社区部署、复制、修改和分发均不受额外限制；商业使用仍被 AGPL-3.0 允许，但必须遵守其源码提供义务。

原因：

```text
这是网络服务，GPL 只约束分发，不覆盖纯网络使用；
AGPL 要求修改版在向网络用户提供服务时也提供对应源码；
依赖主要是 MIT/Apache-2.0，与 AGPL-3.0 兼容；
本次未发现复制 GPL/AGPL 代码。
```

源码地址：

https://github.com/XingMin0371/SignalWindow

运行修改版并向网络用户提供服务时，必须按 AGPL-3.0 第 13 条提供对应源码。旧 MIT 版 v0.1.0 已下架；已经分发的旧副本仍受其当时的 MIT 许可证约束。v0.1.1 起适用 AGPL-3.0-only；当前版本 v0.2.5。

完整许可证见 `LICENSE`，依赖许可见 `THIRD_PARTY_NOTICES.md`，选择理由见 `LICENSE_AUDIT.md`。

## 给 DSH 的阅读顺序

```text
README.md
→ FIRST_DEPLOY.md
→ SECURITY.md
→ PRIVACY.md
→ LOCAL_BUILD.md
→ DEPLOY.md
→ LICENSE_AUDIT.md
```

DSH 可以直接按照上述文档执行检查、安装、构建和启动；遇到平台差异时，优先保留相对路径、环境变量和本机回环监听，不要写死盘符或公网地址。


```text
浏览器
  ↓ WebSocket
gateway
  ↓ OneBot v11 反向 WebSocket
一个或多个 AstrBot aiocqhttp
```

网关使用 OneBot v11 平台标识，兼容原 UMO（仅为迁移已有记忆）：

```text
snowluma:FriendMessage:<OWNER_QQ>
snowluma:GroupMessage:<GROUP_ID>
```

## 安装

需要 Node.js 24+：

```bash
pnpm install
cd apps/web
pnpm install
pnpm run build
cd ../..
node scripts/setup.mjs
pnpm start
```

`setup.mjs` 会生成 `.env` 和 `config/upstreams.json`，不需要修改源码。

任何启用了 aiocqhttp / OneBot v11 的 AstrBot 都可以接入；AstrBot 没有安装业务插件也可以。

## 当前功能

```text
私聊/群聊文字
图片（Data URL 或 URL）
表情/At 基础展示
多 AstrBot 上游
多浏览器客户端广播
登录 Token
JSON 持久化
断线重连
PWA
```

## 多 AstrBot 配置

复制示例：

```bash
cp config/upstreams.example.json config/upstreams.json
```

编辑：

```json
{
  "profiles": [
    {
      "id": "main",
      "label": "你的 AstrBot",
      "wsUrl": "ws://astrbot:6199/ws",
      "accessToken": "主实例 OneBot token",
      "selfId": "<BOT_QQ>",
      "privateUserId": "<OWNER_QQ>",
      "groupId": "<GROUP_ID>"
    },
    {
      "id": "other",
      "label": "另一个 Astr",
      "wsUrl": "ws://other-astrbot:6199/ws",
      "accessToken": "另一个实例的 OneBot token",
      "selfId": "另一个 bot QQ",
      "privateUserId": "另一个主人 QQ",
      "groupId": "另一个群号"
    }
  ]
}
```

启动时：

```bash
UPSTREAMS_FILE=./config/upstreams.json node services/gateway/src/index.mjs
```

每个 AstrBot 需要：

```text
启用 aiocqhttp / OneBot v11
暴露 6199
配置 accessToken
```

网关只会读取每个 profile 的 `wsUrl` 和 `accessToken`，不会替另一个 Astr 改人格或插件。

## 本地开发

```bash
pnpm install
node scripts/mock-astr.mjs
```

另一个终端：

```bash
ONEBOT_WS=ws://127.0.0.1:6299/ws PORT=8787 node services/gateway/src/index.mjs
```

打开：

```text
http://127.0.0.1:8787
```

## Docker

```bash
cp .env.example .env
cd infra
docker compose up -d --build
```

只需要网关时，不要启动 Caddy。需要 HTTPS 时编辑 `Caddyfile` 域名，然后：

```bash
cd infra
docker compose --profile https up -d --build
```

如果使用 Tailscale，可以不加 Caddy，直接：

```bash
tailscale serve --bg 8787
```

## 目录

```text
apps/web/public/       PWA 聊天窗口
services/gateway/src/  网关、OneBot、消息存储
config/                多实例配置示例
scripts/mock-astr.mjs  本地假 AstrBot
infra/                 Docker Compose 和 Caddy
tests/                 自动化 smoke test
```

## 安全

```text
不要公网暴露 6199
网关默认只监听 127.0.0.1
生产环境设置 GATEWAY_TOKEN
每个上游使用独立 OneBot token
优先 Tailscale
```

## 跨平台

### Windows

```powershell
node scripts/setup.mjs
pnpm start
```

程序使用相对路径和 `DATA_DIR`，不依赖固定盘符目录。浏览器访问本机地址即可。

### Linux

```bash
node scripts/setup.mjs
HOST=0.0.0.0 PORT=8787 pnpm start
```

如果对外提供 HTTPS，推荐 Caddy 或 Tailscale；不要把 8787 裸奔到公网。

### Android

Android 不安装 APK，直接用 Chrome/Edge 打开窗口地址，然后：

```text
浏览器菜单 → 添加到主屏幕
```

PWA 需要 HTTPS 才能完整安装。局域网 HTTP 可以聊天，但跨设备远程建议：

```text
Tailscale Serve / Caddy HTTPS
```

桌面端和 Android 端使用同一个地址即可，所有设备共享同一网关会话。

## 路径约定

```text
DATA_DIR        消息存储目录
UPSTREAMS_FILE  AstrBot 配置文件
PORT / HOST     监听地址
```

全部通过环境变量配置。默认值基于当前工作目录，不写死 Windows 或 Linux 路径。

## 多私聊 / 多群聊

每个 AstrBot 实例支持：

```text
privateUserIds: string[]
groupIds: string[]
```

添加实例时默认各提供一个输入行，可以继续点“添加私聊对象”或“添加群聊对象”。

历史消息和发送路由按：

```text
profile + conversation + targetId
```

区分，不再把多个私聊或多个群混在一个历史桶里。


部署、字段说明和常见问题见 [DEPLOY.md](DEPLOY.md)。


## 部署文档

- 本地构建：[LOCAL_BUILD.md](LOCAL_BUILD.md)
- 首次部署：[FIRST_DEPLOY.md](FIRST_DEPLOY.md)

## 聊天外观与背景

设置页支持三种低功耗样式：

```text
默认
玻璃（半透明 CSS，不使用实时 backdrop-filter）
透明
```

支持本地上传聊天背景：

```text
静态图片：浏览器端压缩后存入 IndexedDB
动态视频：MP4/WebM，建议不超过 8 秒、1280×720、8MB
动态播放默认关闭；切后台自动暂停
Lite 模式会隐藏动态背景
```

背景只保存在当前浏览器，不会自动上传服务器。

## 多端启动

```text
Windows：双击 START-WINDOWS.cmd
Linux：  bash start-linux.sh
Docker： cd infra && docker compose up -d --build
Android：浏览器访问，参考 ANDROID.md；PWA 不需要 APK
```

首次启动会运行 `scripts/setup.mjs`。需要 Node.js 24+ 和 pnpm。Android 不运行服务端，只作为浏览器/PWA 客户端。

兼容性矩阵见 [COMPATIBILITY.md](COMPATIBILITY.md)，规范与安全边界见 [STANDARDS.md](STANDARDS.md)。
