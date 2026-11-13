# 扩展与二次开发指南（EXTENDING）

本项目自 v0.3.0 起，作者进入维护收尾阶段。网关与前端预留了**稳定、解耦的公共扩展点**，后续维护者无需修改核心文件即可集成新功能。本文档是唯一需要阅读的扩展契约。

## 1. 网关扩展点（services/gateway/src/）

### 1.1 事件总线 `events.mjs`

一个零依赖、异常隔离的发布订阅总线。**不要在监听器里修改 payload 对象**（它是共享引用）。

```js
import { on, once, off, emit } from "./events.mjs";

// 订阅：返回一个取消订阅函数
const dispose = on("message-added", ({ message, source }) => {
  // source: "web" | "onebot"
  console.log("新消息", message.id, message.text, source);
});

once("profiles-updated", ({ ids }) => console.log("实例已变更", ids));
dispose(); // 取消订阅
```

内置事件（payload 结构即稳定契约，向后兼容只增不改）：

| 事件 | payload | 触发时机 |
|---|---|---|
| `message-added` | `{ message, source }` | 消息完成内存索引并进入写盘队列后（不等待实际落盘；web 发送 / onebot 回复） |
| `client-open` | `{ count, remoteIp }` | 浏览器 WS 建立 |
| `client-close` | `{ count, remoteIp }` | 浏览器 WS 断开 |
| `profiles-updated` | `{ ids }` | `PUT /api/profiles` 整体替换配置后 |
| `upstream-status` | `{ profile, connected, detail }` | OneBot 上游连接状态变化 |

典型用途：审计日志、消息持久化到外部数据库、Webhook 转发、指标统计。**监听器抛错只记录日志，绝不影响网关主流程**（已内置 try/catch）。

### 1.2 WS 消息类型注册表

网关对浏览器 WS 帧按 `type` 分发。新增消息类型不需要改 `index.mjs`：

```js
import { registerWsHandler } from "./index.mjs";

registerWsHandler("my-feature", async (ws, payload) => {
  // payload 是已 JSON.parse 的对象；ws 是 ws 库的 WebSocket 实例
  // 返回给客户端请用 index.mjs 导出的 safeSend（向死连接发送不会抛错/缓冲）
});
```

约定：
- `type` 使用小写 kebab-case，避免与内置 `history` / `send` / `hello` / `ack` / `error` / `gap` / `status` / `message` / `profiles` / `history-imported` 冲突。
- 处理器抛出的异常会被捕获并回传 `{ type:"error", detail:"internal error" }`，不会升级为进程级 rejection。
- 发送前做与 `send` 相同的输入校验（长度、类型、会话白名单）。

### 1.3 模块边界（请勿跨层引用）

```
env.mjs        环境变量与路径（唯一允许读 process.env 的入口之一）
upstreams.mjs  profile 归一化 / SSRF 校验 / 配置读写（无副作用的纯函数 + 两个 IO 函数）
message.mjs    消息清洗 / URL 白名单 / OneBot 段转换（纯函数，无 IO）
store.mjs      NDJSON 存储（唯一消息持久化真相，串行 writeChain）
onebot.mjs     OneBot v11 客户端（协议 + 重连 + 回压）
events.mjs     事件总线（被 index.mjs 调用，可被任何模块 import）
index.mjs      装配层：HTTP 路由 + WS 分发 + 广播 + 会话/限速
```

新增能力时：**协议转换放 message/onebot-payload，业务编排放 index 或新模块，持久化扩展放 store 的封装**。不要反向 import（store 不得 import index）。

## 2. 前端扩展点（apps/web/src/）

| 模块 | 职责 | 扩展方式 |
|---|---|---|
| `api.ts` | 全部 HTTP 调用的唯一封装 | 新增接口在此加方法，页面不得直接 fetch |
| `appearance.tsx` | 主题/背景/IndexedDB | 新主题在 `Theme` 联合类型加值 + `styles.css` 加 `html.theme-x` 规则 |
| `heightIndex.ts` | O(log n) 行高索引 | 公共 API 固定：`size/total/reset/append/prepend/update/locate/topAt/slice`，替换实现不得改签名 |
| `pages/*.tsx` | 页面（路由级 code-split） | 新页面在 `App.tsx` 的 `lazy()` + `Routes` + 菜单 items 各加一行 |
| `storage.ts` | localStorage/sessionStorage 安全封装 | 所有读写必须走这里（隐私模式/受限 WebView 不崩） |
| `public/lite.html` | 无框架 ES5 轻量版 | 旧设备入口，只允许 ES5 语法与裸 WS，禁止引入任何框架 |

视觉约定：`backdrop-filter`、`filter: blur()`、逐帧动画在主题中**禁止使用**（旧设备 GPU 成本）。质感通过静态材质（噪点贴图、bevel 高光、渐变、文字阴影）实现，参考 `styles.css` 中「玻璃质感：静态材质层」注释块。

## 3. 添加新功能的最小流程

1. **协议/数据**：在 `message.mjs` 或新模块写纯函数 + 在 `tests/` 加单测。
2. **网关行为**：优先用 `events.on(...)` 订阅，或 `registerWsHandler(...)` 加 WS 类型；必须改 HTTP 时在 `index.mjs` 路由区加分支并复用 `authorized/rateLimited/safeSend`。
3. **前端**：`api.ts` 加方法 → 新页面或现有页面接入 → `npm run build` + `tsc --noEmit`。
4. **验证**：`npm test`（8 项）+ `node round5/tests/strict.mjs`（严苛套件）+ `SW_ROOT=<你的副本> node round4/tests/full-audit.mjs`（36 项）。

## 4. 兼容性红线（合入前自查）

- 服务端：Node ≥18.18，禁止引入 `node:sqlite` 顶层硬导入（已动态可选）、`--env-file-if-exists`（Node 22.9+ 专属）。
- 前端构建目标 `es2017`；新 Web API 必须特性检测 + 降级（参考 `file.arrayBuffer()` 的 FileReader 兜底、`ResizeObserver` 降级）。
- CSS：`dvh`/`aspect-ratio`/`mask-image` 等必须配 `@supports` 或 `-webkit-` 前缀。
- 不新增运行时依赖，除非有明确收益且提供降级路径；构建期依赖需在 `pnpm-lock.yaml` 锁定。
