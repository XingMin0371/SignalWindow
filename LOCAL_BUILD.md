# Signal Window 本地构建

本文只讲“从源码在本机构建并运行”。首次部署到服务器请看 [FIRST_DEPLOY.md](FIRST_DEPLOY.md)。

## 1. 环境

需要：

```text
Node.js 18.18+ 或更高
pnpm 9 或更高
```

检查：

```bash
node --version
pnpm --version
```

如果系统没有 pnpm，可以先用 Corepack：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Windows、Linux 和 macOS 使用同一套相对路径流程。

## 2. 进入源码目录

```bash
cd <SIGNAL_WINDOW_SOURCE_DIR>
```

不要写死某个人的绝对路径，直接在你的源码目录执行即可。

## 3. 安装网关依赖

```bash
pnpm install
```

## 4. 构建前端

前端在 `apps/web` 下独立安装和构建：

```bash
cd apps/web
pnpm install
pnpm run build
cd ../..
```

构建产物会生成到：

```text
apps/web/dist
```

网关会从这个目录提供页面。

## 5. 首次配置

```bash
node scripts/setup.mjs
```

会生成：

```text
.env
config/upstreams.json
```

字段说明：

```text
显示名称
AstrBot OneBot WS 地址
OneBot accessToken
Bot QQ / self_id
私聊对象 QQ
群聊对象
窗口监听地址
窗口端口
Gateway Token
```

没有密钥时：

- 本机使用可以留空 `GATEWAY_TOKEN`
- AstrBot 没有 `ws_reverse_token` 时，OneBot accessToken 也留空
- 不要填写 `<GATEWAY_TOKEN>` 这类占位符

## 6. 启动

```bash
pnpm start
```

打开：

```text
http://127.0.0.1:8787
```

## 7. 开发模式

网关热重载：

```bash
pnpm dev
```

前端开发服务器另开终端：

```bash
cd apps/web
pnpm run dev
```

Vite 开发服务器会把 `/api` 和 `/ws` 代理到本机网关。

## 8. AstrBot 侧

AstrBot 只需要启用 `aiocqhttp` / OneBot v11。

反向 WebSocket 地址按运行方式填写：

```text
本机进程：ws://127.0.0.1:6199/ws
Docker 网络：ws://astrbot:6199/ws
远程主机：ws://<ASTRBOT_HOST>:6199/ws
```

## 9. 验证

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/config
```

首次没有配置时，`/api/config` 应返回：

```json
{
  "profiles": [],
  "setupRequired": true
}
```

打开页面应出现首次配置表单。

## 10. 常见构建问题

### `pnpm` 不存在

安装 Node 18.18+（推荐 20/22 LTS）后执行 `corepack enable`，或按官方方式安装 pnpm。

### `apps/web/dist` 不存在

没有构建前端。执行：

```bash
cd apps/web
pnpm install
pnpm run build
```

### 页面 404

确认网关启动目录是源码根目录，且：

```text
apps/web/dist/index.html
```

存在。

### 端口被占用

修改 `.env`：

```text
PORT=另一个端口
```

然后重启 `pnpm start`。

### 页面还是旧版本

```text
Ctrl+F5
```

或在开发者工具里清除站点数据。

## 兼容性构建目标

Vite 生产目标为 ES2017 与 Safari 12 基线。React 18/Ant Design 5 仍有自己的浏览器下限；旧设备建议开启 Lite 模式和静态背景。详见 `COMPATIBILITY.md`。
