# Signal Window 首次部署

本文只讲“第一次把 Signal Window 部署起来”。本地构建流程看 [LOCAL_BUILD.md](LOCAL_BUILD.md)。

## 1. 部署前准备

需要：

```text
Node.js 24（裸机部署）
或 Docker + Docker Compose
一个 AstrBot
AstrBot 已启用 aiocqhttp / OneBot v11
```

先规划：

```text
Gateway Token       窗口登录密码
OneBot accessToken  AstrBot 的接入 Token
窗口端口            默认 8787
```

没有密钥也可以：

- 仅本机使用：Gateway Token 留空
- AstrBot 没有设置 ws_reverse_token：OneBot accessToken 留空

不要填写文档里的占位符。

## 2. 方式 A：Docker 首次部署

### 2.1 准备环境文件

```bash
cd <SIGNAL_WINDOW_SOURCE_DIR>
cp .env.example .env
```

编辑 `.env`：

```text
GATEWAY_TOKEN=<随机字符串，或留空>
HOST=127.0.0.1
PORT=8787
```

### 2.2 启动

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

首次构建会自动构建前端。默认只暴露：

```text
127.0.0.1:8787
```

不会自动暴露到公网。

### 2.3 HTTPS

需要 HTTPS 时编辑：

```text
infra/Caddyfile
```

把示例域名替换为你自己的域名，然后：

```bash
docker compose -f infra/docker-compose.yml --profile https up -d --build
```

Caddy 会负责证书。没有域名时不要启用 Caddy。

### 2.4 查看状态

```bash
docker compose -f infra/docker-compose.yml ps
docker logs <窗口容器名> --tail 100
```

## 3. 方式 B：Linux 裸机首次部署

### 3.1 安装依赖并构建

```bash
cd <SIGNAL_WINDOW_SOURCE_DIR>
pnpm install
cd apps/web
pnpm install
pnpm run build
cd ../..
```

### 3.2 首次配置

```bash
node scripts/setup.mjs
```

生成：

```text
.env
config/upstreams.json
```

### 3.3 启动

```bash
pnpm start
```

生产环境建议用 systemd/supervisor 托管，并只监听：

```text
HOST=127.0.0.1
```

远程入口使用 Tailscale、SSH 隧道或 Caddy，不要直接公开 8787。

## 4. AstrBot 配置

在 AstrBot 的 `平台 / aiocqhttp` 中设置：

```text
反向 WebSocket 端口：6199
ws_reverse_token：可选
```

Signal Window 中填写：

```text
OneBot WS 地址：
  同机裸机：ws://127.0.0.1:6199/ws
  同一 Docker 网络：ws://astrbot:6199/ws
  远程主机：ws://<ASTRBOT_HOST>:6199/ws

OneBot accessToken：
  AstrBot 没设置 Token：留空
  AstrBot 设置 Token：填写完全相同的值
```

## 5. 首次打开

打开：

```text
http://127.0.0.1:8787
```

如果设置了 `GATEWAY_TOKEN`，先输入窗口 Token。

然后填写：

```text
显示名称
OneBot WS 地址
OneBot accessToken
Bot QQ / self_id
私聊对象 QQ
群聊对象
```

保存后等待：

```text
OneBot 在线
```

## 6. 验证清单

```bash
curl http://127.0.0.1:8787/api/health
```

认证后应看到：

```json
{
  "ok": true,
  "onebot": true,
  "onebots": {
    "<profile>": true
  }
}
```

检查：

- 页面能打开
- 首次配置表单能保存
- 实例状态为在线
- 私聊能收到回复
- 群聊目标选择正确

## 7. 首次部署常见问题

### 页面打不开

检查：

```bash
curl http://127.0.0.1:8787/
```

- 进程/容器是否启动
- 端口是否映射
- 防火墙是否拦截
- 是否只监听了 `127.0.0.1`

### 登录后 401

容器重启会清空会话。刷新页面重新输入 Gateway Token。

### OneBot 离线

检查：

```text
WS 地址
OneBot accessToken
AstrBot aiocqhttp 是否启用
6199 是否可达
Docker 网络里的 astrbot 主机名
```

### 首次配置没有保存

确认：

```text
config/ 可写
UPSTREAMS_FILE 指向可写位置
```

### 图片/文件发不出去

AstrBot 必须支持对应的 OneBot 消息段。窗口本身只负责转发和记录。

### 页面报错或仍是旧版

```text
Ctrl+F5
```

或清除站点数据。

## 8. 部署安全

```text
不要把 8787 直接暴露公网
不要把 6199 直接暴露公网
远程使用 Tailscale 或 Caddy HTTPS
Gateway Token 和 OneBot accessToken 分开保存
不要提交 .env 或 config/upstreams.json
```

## 9. 更新

拉取新源码后重新构建：

```bash
pnpm install
cd apps/web
pnpm install
pnpm run build
cd ../..
```

Docker：

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

更新前备份：

```text
config/upstreams.json
data/
```
