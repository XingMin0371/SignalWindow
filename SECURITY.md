# Security

## 默认安全边界

- 网关默认监听 `127.0.0.1`，不会自动暴露公网。
- 生产环境必须设置 `GATEWAY_TOKEN`。
- 配置页只在通过 Token 后允许写入 profile。
- OneBot accessToken 不会通过 `/api/config` 或 `/api/profiles/:id` 返回给浏览器；编辑时留空会沿用旧值。
- 配置写入 `upstreams.json` 时使用临时文件替换，权限为 `0600`。
- 静态文件路径使用 `path.resolve` + `path.relative`，拒绝目录穿越。
- WebSocket 使用 HttpOnly 会话 Cookie 鉴权；query token 和 `auth.*` 子协议 token 默认关闭，仅在显式环境变量开启时兼容。
- 登录失败按来源 IP 做 60 秒 10 次限流。
- 响应包含 CSP、`X-Frame-Options: DENY`、`nosniff`、Referrer-Policy、Permissions-Policy。
- HTTPS 反向代理下由 Caddy/Tailscale 管理证书。

## 部署要求

- 不要把 `8787`、`6199`、数据库文件直接暴露到公网。
- 推荐 Tailscale、Cloudflare Tunnel，或 Caddy + Authelia。
- 不要把 `.env`、`config/upstreams.json` 提交到公开仓库。
- 定期轮换 `GATEWAY_TOKEN` 和各 AstrBot 的 OneBot accessToken。

## 浏览器存储

窗口 Token 不再写入 `localStorage`。登录后由网关签发 `HttpOnly + SameSite=Strict` 会话 Cookie，前端 JavaScript 无法读取 Token。旧版本遗留的 `snowluma_window_token` 会在启动时清除。共享设备使用完建议关闭浏览器或等待会话过期。

## 依赖许可证

当前前端主要依赖：React、Ant Design、React Flow、CodeMirror、Recharts、Driver.js、Zod，均为 MIT 或 Apache-2.0 类宽松许可证。发布前应保留各自 LICENSE/NOTICE，并按实际锁定版本复核。

## 性能与可用性防护

- HTTP 请求头超时 10 秒，请求超时 15 秒，Keep-Alive 5 秒。
- WebSocket 最大 100 个连接，每 IP 最多 20 个。
- 单连接 10 秒最多 60 条消息。
- 慢客户端 bufferedAmount 超过 1 MB 会被断开，客户端重连后重新拉取历史，避免静默丢消息。
- 消息物化、追加和 compaction 在同一串行链中执行；compaction 使用临时文件原子替换。
- OneBot 重连使用指数退避和随机抖动，最大 30 秒。
- 前端按页面拆包，Ant Design、React Flow、CodeMirror、图表分别独立 chunk。

## 已知边界

- 单网关 Token 授权后可以查看该网关下的全部 profile。多人使用应各自部署独立网关或增加 per-profile 授权层。
- 聊天气泡中的远程图片可能触发第三方请求；生产环境建议通过受控图片代理或只使用可信来源。

## Windows 报毒说明

本项目以 Node.js/JavaScript 源码形式发布，压缩包内不包含 `.exe`、安装器、驱动或混淆的可执行文件。

Windows 安全软件仍可能因为以下行为给出启发式告警：

```text
本地启动 HTTP/WebSocket 服务
监听 8787 端口
接收和转发聊天消息
写入本地消息历史
脚本自动生成配置
使用 Node.js 运行时
压缩包来源不明或未签名
```

这些行为本身不等于恶意行为。请不要为了运行项目而全局关闭 Windows Defender、关闭 SmartScreen 或授予管理员权限。

建议：

```text
1. 从本仓库源码自行构建，不要运行来源不明的二次打包文件。
2. 运行前扫描压缩包和目录。
3. 只允许专用/私有网络访问。
4. 如果被误报，上报给安全软件厂商并附上源码和哈希。
5. 不要把安全软件白名单作为长期解决方案。
```

项目不包含自动启动、计划任务、注册表持久化、浏览器密码读取、键盘记录或远程控制功能。

## 提权警告说明

正常使用不需要管理员/UAC 权限。

默认监听：

```text
127.0.0.1:8787
```

因此不需要管理员权限，也不需要修改系统目录。不要用“以管理员身份运行”启动 Node.js、启动脚本或浏览器。

可能的提权提示来源：

```text
Windows 防火墙首次放行本地端口
Docker Desktop 自身需要虚拟化/服务权限
反向代理或系统服务安装
用户自行把端口改到 1024 以下
```

这些都是操作系统或 Docker 的提示，不是本项目要求提权。  
如无必要，不要在管理员账户下运行，也不要把项目注册成高权限 Windows 服务。将 `PORT` 改为 1024 以上的非特权端口即可。

## 其他安全性说明

```text
默认只监听本机回环地址
不要将 8787、6199 或 OneBot 端口直接暴露公网
远程访问优先使用 Tailscale、Cloudflare Tunnel 或带认证的 Caddy
必须设置 GATEWAY_TOKEN
每个 AstrBot 使用独立 OneBot accessToken
不要把 .env、upstreams.json、消息历史提交到公开仓库
```

本项目是本地桥接框架，不包含 QQ 登录、QQ 协议逆向、验证码绕过、风控绕过或账号盗用能力。它不会替你连接 QQ，也不能绕过平台限制。

## 法律与合规说明

```text
本项目与腾讯、QQ、SnowLuma、AstrBot 均无隶属或授权关系。
使用者必须只处理自己有权访问的账号、群聊和消息。
不得用于侵犯隐私、骚扰、诈骗、绕过访问控制或其他违法行为。
使用 AstrBot、QQ、SnowLuma、OneBot 及相关服务时，应遵守各自服务条款。
导出的聊天记录、记忆和图片由部署者自行保管并承担合规责任。
本项目不提供任何明示或暗示的担保，不承诺持续更新或适配所有平台。
```

如果所在地区或平台不允许此类本地桥接、数据导出或自动化，请停止使用。

## 许可证与网络源码义务

本项目原创代码从 v0.1.1 起采用 **AGPL-3.0-only**。

**对于非盈利目的完全开放。** 个人使用、学习、研究、非营利社区部署、复制、修改和分发均不受额外限制；商业使用仍被 AGPL-3.0 允许，但必须遵守其源码提供义务。

```text
自用、修改、研究：允许
分发：需遵守 AGPL-3.0
作为网络服务提供修改版：必须向网络用户提供 Corresponding Source
商业使用：允许，但不能借此绕过 AGPL 的源码义务
```

源码入口：

https://github.com/XingMin0371/SignalWindow

v0.1.0 仍按 MIT 授权，不能追溯撤销。完整许可证见 `LICENSE`，选择理由见 `LICENSE_AUDIT.md`，依赖许可见 `THIRD_PARTY_NOTICES.md`。

## 上游与代理安全

- `UPSTREAM_HOST_ALLOWLIST` 可限制 OneBot WS 目标主机，设置后只允许列表中的主机。
- 不要在生产环境开启 `ALLOW_QUERY_TOKEN=1`；它会把网关 Token 放进 URL 和代理日志。
- 媒体上传目前限制单文件大小，但长期运行仍应设置磁盘配额和清理策略。
- 图片 data URL 仅接受常见位图 MIME，拒绝 SVG；文件 data URL 拒绝 HTML/SVG。

## 聊天背景

用户上传的聊天背景保存在浏览器 IndexedDB，不会自动上传网关。静态图片在浏览器端压缩；动态视频限制大小、时长和分辨率，默认不自动播放，切后台暂停。Lite 模式关闭动态背景。

规范映射和已知边界见 `STANDARDS.md`，浏览器/系统矩阵见 `COMPATIBILITY.md`。

## 本地 blob 资源

用户上传的聊天背景使用浏览器本地 `blob:` URL。CSP 只对同源图片和本地 blob 放行：

```text
img-src ... blob:
media-src 'self' blob:
```

不会把 `blob:` 加入脚本或网络连接白名单。背景数据只保存在当前浏览器 IndexedDB。

## 历史导入

AstrBot 私聊历史导入必须由已登录用户在设置页勾选。服务端只挂载 AstrBot 数据目录为只读，接口只接受配置中已存在的私聊 target；群聊不导入。默认不会自动导入。

## 单实例与代理

- `DATA_DIR/gateway.lock` 阻止两个网关进程共用同一数据目录；异常退出后旧 PID 会被检测并清理。
- `REQUIRE_ORIGIN=1` 时才强制浏览器 Origin；默认允许无 Origin 的 CLI/WebView 客户端。
- `TRUST_PROXY=1` 必须配合 `TRUSTED_PROXY_IPS`（支持 IPv4 和 CIDR）；否则不采信 XFF。
- 可选 `MEDIA_HOST_ALLOWLIST` 限制远程媒体域名；留空保持现有兼容行为。
- HTTPS 且可信代理下使用 `__Host-slw_session`，HTTP 继续使用 `slw_session`。
