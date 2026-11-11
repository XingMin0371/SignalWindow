# Signal Window 部署与使用

## 1. 它和 SnowLuma 的关系

Signal Window **不需要 SnowLuma 运行**，也不修改 AstrBot 人格或记忆。它只作为 AstrBot `aiocqhttp` 的 OneBot v11 客户端连接。

SnowLuma、NapCat 等只是可选的旧客户端；当前部署可以只运行：

```text
Signal Window
AstrBot
```

## 2. 支持的运行方式

### Windows 本地

```powershell
node scripts/setup.mjs
pnpm start
```

打开：

```text
http://127.0.0.1:8787
```

### Linux / Docker

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
```

需要 HTTPS 时再启用 Caddy：

```bash
docker compose -f infra/docker-compose.yml --profile https up -d --build
```

或使用服务器已有 Compose。默认只监听 `127.0.0.1`，远程请用 Tailscale、Caddy 或 SSH 隧道。

### Android

用 Chrome/Edge 打开 HTTPS 地址：

```text
浏览器菜单 → 添加到主屏幕
```

PWA 安装要求 HTTPS；局域网 HTTP 可以聊天，但无法完整安装。

## 3. AstrBot 侧配置

在 AstrBot 启用 `aiocqhttp` / OneBot v11：

```text
反向 WebSocket 地址：ws://<gateway-host>:6199/ws
Access Token：与窗口里的 OneBot accessToken 一致
```

同一个 Docker 网络里注意容器名：

```text
Signal Window 写到 AstrBot：ws://astrbot:6199/ws
AstrBot 是宿主机进程时：ws://127.0.0.1:6199/ws
从另一台机器访问时：ws://<服务器局域网或 Tailscale IP>:6199/ws
```

## 4. 字段解释

| 字段 | 含义 | 示例 |
|---|---|---|
| 显示名称 | 只影响窗口里的名称 | 我的 AstrBot |
| OneBot WS 地址 | Signal Window 主动连接 AstrBot 的 WebSocket 地址 | `ws://astrbot:6199/ws` |
| OneBot accessToken | AstrBot 的 OneBot 接入 Token | `<ONEBOT_ACCESS_TOKEN>` |
| Bot QQ / self_id | 机器人 QQ | `1000000001` |
| 私聊对象 QQ | 允许在窗口里聊天的私聊对象，可多个 | `1000000002` |
| 群聊对象 | 允许在窗口里聊天的群，可多个 | `2000000001` |
| Gateway Token | 浏览器登录这个窗口的密码，不是 OneBot Token | `<GATEWAY_TOKEN>` |

### 没有访问密钥怎么办

这里有两个完全不同的 Token，不要混用。

#### 1. 窗口访问密钥 / Gateway Token

它只是登录窗口的密码。

- 首次本地使用：可以完全留空，网关会进入无登录本地模式。
- 远程使用：必须设置一个随机字符串。
- 运行 `node scripts/setup.mjs` 时，直接回车会自动生成一个并打印出来。
- Docker 使用：在 `.env` 中设置 `GATEWAY_TOKEN=...`，重启容器。

如果之前设置过但忘了，可以：

```bash
# 编辑 .env
GATEWAY_TOKEN=
# 或者在受控环境中重新生成
node scripts/setup.mjs
```

不要在网络可被他人访问时留空。

#### 2. AstrBot 的 OneBot accessToken

它由 AstrBot 的 `aiocqhttp` 平台配置决定。

- AstrBot 没有设置 `ws_reverse_token`：窗口里的 accessToken 留空。
- AstrBot 设置了 Token：窗口里必须填写完全相同的值。
- 如果两边不一致，日志通常会出现 401 或连接失败。

在 AstrBot WebUI 的 `平台 / aiocqhttp` 中查看或设置；也可以生成一个随机值后同时填入 AstrBot 和窗口。

#### 3. 不要填写示例占位符

`<ONEBOT_ACCESS_TOKEN>`、`<GATEWAY_TOKEN>` 只是文档占位符，不是可用 Token。

### 首次启动

如果还没有配置，直接启动网关后打开：

```text
http://127.0.0.1:8787
```

页面会要求填写：

```text
显示名称
OneBot WS 地址
OneBot accessToken
Bot QQ / self_id
私聊对象 QQ
群聊对象
窗口 Gateway Token
```

也可以运行：

```bash
node scripts/setup.mjs
```

## 5. 多私聊和多群

添加实例时默认各有一个输入行。

- “添加私聊对象”：增加一个私聊 QQ
- “添加群聊对象”：增加一个群号
- 私聊至少 1 个
- 群聊可以留空
- 已有实例点“编辑”即可添加或删除

聊天页顶部选择：

```text
私聊 · 1000000002
群聊 · 2000000001
```

每个对象的历史独立保存。

## 6. 回车发送设置

高级配置页新增：

```text
按回车键发送    [默认开启]
```

- 开启：Enter 发送，Shift+Enter 换行
- 关闭：Enter 换行，Ctrl+Enter 发送
- 输入法组合期间不会误发送

## 7. 附件

支持常见文件：

```text
pdf doc docx txt md csv json xls xlsx ppt pptx
zip rar 7z tar gz log xml yaml yml
```

限制：

```text
单文件最大 5 MB
图片最大 2 MB
WebSocket 帧最大 10 MB
```

注意：Signal Window 会把文件作为 OneBot `file` 消息段发给 AstrBot。AstrBot 具体是否解析 PDF/Word/压缩包，取决于它启用的消息处理插件；窗口本身只负责传输、记录和下载。

## 8. 常见问题

### 页面打不开 / ERR_CONNECTION_REFUSED

先检查你自己的网关地址和端口：

```bash
curl http://127.0.0.1:8787/
```

- 8787 不通：网关进程或容器没启动。
- 远程地址不通：检查 SSH/Tailscale/Caddy 隧道。
- 只应使用你部署的域名或本地地址，不要使用别人的示例地址。

### 登录后 401

容器重启会清空内存会话。刷新页面重新输入 Gateway Token。

### 你的 AstrBot生成回复但聊天页不显示

查看窗口日志，如果出现：

```text
retcode 1403
send_private_msg user_id: <Bot 自己的 QQ>
```

说明 AstrBot 把回复发给了 Bot 自己，而不是私聊对象。已修复：网关发送私聊事件时，`sender.user_id` 使用真实私聊对象，不再使用 `self_id`。

### OneBot 一直离线

依次检查：

```text
WS 地址是否写错
accessToken 是否一致
AstrBot 是否开启 aiocqhttp
容器网络是否能解析 astrbot
6199 端口是否被防火墙拦截
```

### 添加了私聊/群但聊天页没有

点“编辑”保存后回到聊天页刷新；选择器来自 profile 的 `privateUserIds` / `groupIds`。

### 文件发送失败

- 超过 5 MB
- AstrBot 适配器不支持 `file` 段
- 对方 QQ 账号没有文件上传权限

### 页面还是旧版

旧 Service Worker 缓存：

```text
Ctrl+F5
```

或在浏览器开发者工具里清除站点数据。

## 9. 非文字消息

窗口支持 OneBot 的：

```text
image
mface / face
record / audio
video
file
```

AstrBot 的图片和语音经常以：

```text
base64://...
```

发送；窗口会转换成浏览器可显示的 data URL。若 AstrBot 日志里的发送消息链只有：

```text
reply, text
```

说明这次 AstrBot 没有真正发出图片，窗口无法凭空显示未发送的媒体。

## 10. 安全

- 不要把 8787、6199 直接暴露到公网。
- Gateway Token 和 OneBot Token 不是同一个东西。
- 登录使用 HttpOnly 会话 Cookie，不写入 localStorage。
- 一个 Gateway Token 可以访问该网关下的全部 profile；多人使用请分别部署。
- 远程图片可能产生第三方请求，敏感环境建议使用可信图片源。
