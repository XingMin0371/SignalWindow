# Privacy

## 数据流向

```text
浏览器 ⇄ 本网关 ⇄ 你配置的 AstrBot OneBot WebSocket
```

本应用不包含遥测、广告 SDK、第三方统计或云端账号系统。

## 本地保存

网关会保存：

```text
消息历史：DATA_DIR/messages.json
AstrBot 连接配置：UPSTREAMS_FILE
```

这些文件由部署者控制，不会自动上传到第三方。

## 浏览器保存

```text
HttpOnly 会话 Cookie
```

用于重新连接网关，前端 JavaScript 无法读取该 Cookie。应用不读取通讯录、位置、相机、麦克风或本机文件；选择图片时只在用户主动选择后读取图片内容。

## 远程访问

如果你通过 Tailscale、Cloudflare Tunnel 或 Caddy 暴露页面，请自行配置访问控制，并遵守所用平台的服务条款。

## 凭证和第三方服务

本应用不接收或保存 QQ 密码、QQ 登录凭证或 SnowLuma 账号密码。

AstrBot 的 OneBot accessToken 由部署者在本地配置；浏览器不会通过 `/api/config` 获取该 Token。远程访问必须自行增加 HTTPS、认证和访问控制。

本应用不包含遥测、广告或云端账号系统。部署者如果启用 Tailscale、Cloudflare、Caddy 等第三方服务，应同时遵守这些服务的隐私条款。
