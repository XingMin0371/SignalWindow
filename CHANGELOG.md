# Changelog

## 0.2.8 - 2026-11-13

### 版本一致性

- 包、README、CHANGELOG、tag 统一为 0.2.8。
- `/api/health` 增加 `version` 字段，直接显示当前运行版本。
- 修正 `AUDIT_RESPONSE` 中 Fenwick 未替换的旧描述。
- 修正 `SECURITY.md` 仍列 Zod 的旧依赖清单。
- 修正 `PERFORMANCE_AUDIT.md` 的 O(√n)/O(n) 高度索引描述。

## 0.2.7 - 2026-11-13

### 文档剩余优化整合

- 前端高度索引替换为 round4 交付的 Fenwick 实现：
  - append/prepend/update/locate/topAt 为 O(log n)。
  - 1500 步随机差分测试与原模型一致。
- 历史分页增加按会话的惰性 id→位置哈希索引，重复 beforeId 分页不再每次 findIndex。
- Service Worker 安装改为逐资源 allSettled，单个图标缺失不再导致离线缓存整体失败。
- 等待 Service Worker ready 后再继续启动。
- 图片/文件选择后重置 input.value，可再次选择同一文件。

### 未合并

- 组提交、SQLite WAL、echo 关联、缩略图、请求指标、外部 store 仍未切换。
- CI 工作流未推送到远端 main（Token 无 workflow 权限），保留在源码包。

## 0.2.6 - 2026-11-13

### 跨系统与全量测试整合

- 合入 round4 补丁：36 项全量用例从 31 项缺陷降到 0，36/36 通过。
- 全仓 LF + `.gitattributes`，命令行入口改为 Node 启动器，Node 门槛降至 >=18.18。
- SPA 深链接回退、静态 Content-Length、Host/Origin 校验、413/启动退出码。
- 修复 Settings JSON 回存丢 wsUrl/Token、并发 clientId 重复落盘、null parts、上游媒体段丢失。
- 可选 `node:sqlite`、非交互 setup、陈旧锁心跳、上游握手超时、轻量版 `lite.html`。
- 移除未使用的 zod，修复 CSS 变量/老浏览器降级、文件输入重置等问题。

### 验证

- 自有测试 8/8；round4 全量 36/36；回归 5/5 通过（用 TAP reporter 兼容 Node 24 输出格式）。
- 前端 TypeScript、Vite build 通过。

## 0.2.5 - 2026-11-13

### 文档漏项整合

- 媒体响应支持单段 HTTP Range，音视频可拖动且大文件不再整段读取。
- 新增可选 `MEDIA_HOST_ALLOWLIST`；留空保持原有兼容，不改变默认行为。
- HTTPS + 可信代理下使用 `__Host-slw_session`，HTTP 继续使用 `slw_session`。
- profile 测试端点增加固定最小等待，削弱端口探测时序差。
- 图片选择增加 MIME 和大小提示，不再静默失败。

### 仍未切换

- NDJSON 仍是默认后端，SQLite WAL 未启用。
- CSP 的 ws/https 范围、文件魔数、消息数组复制、Docker 摘要未改。

## 0.2.4 - 2026-11-13

### 低风险整合

- gap 事件改为当前会话历史重同步，不再刷新页面；输入草稿用 sessionStorage 恢复（v0.2.5 补丁已落地）。
- Origin 校验支持 `REQUIRE_ORIGIN=1`，默认保留无 Origin 的 CLI/WebView 兼容。
- 可信代理 IP 归一化、IPv4 CIDR 支持和启动告警。
- DATA_DIR 单实例锁，处理容器 PID1 复用导致的陈旧锁。
- 致命异常按状态损坏/软错误窗口分级。
- 前端常驻 √ 分块增量高度索引，append/prepend/update 不再全量重建。
- Settings 保存改为单次 `PUT /api/profiles`，全部校验、一次落盘、统一重连。
- 静态资源增加 ETag/304；会话登录轮换旧 ID，支持 `all=1` 全端吊销。
- 空 Origin、数字归一化、行高 NaN/越界兜底。

### 仍未切换

- NDJSON 仍是默认存储；SQLite WAL 未启用。
- 消息数组不可变追加仍会复制当前会话数组。
- CSP 的 ws/https 范围、文件魔数校验、Docker 基础镜像摘要、CI/SAST 未补齐。

## 0.2.3 - 2026-11-13

### A 章 P0 / 性能

- gap 不再强制刷新页面；前端重新拉取当前会话历史，输入草稿通过 sessionStorage 恢复。
- Origin 校验增加 `REQUIRE_ORIGIN` 开关，默认允许无 Origin 的 CLI/WebView 客户端。
- 可信代理 IP 归一化并支持 IPv4 CIDR；`TRUST_PROXY=1` 无列表时启动告警。
- 增加 DATA_DIR 单实例锁，阻止两个网关进程互相覆盖。
- 致命异常按状态损坏/软错误窗口分级，不再所有 rejection 立即退出。
- 前端高度索引改为常驻 √ 分块增量结构，append/prepend/update 不再全量重建；增加随机等价性验证。

### 仍未清零

- 消息数组不可变追加仍有复制成本。
- profile 批量保存未事务化。
- CSP ws/https 兼容范围、Cookie 全端吊销、CI/SAST。
- SQLite WAL 后端未切换，仍使用 NDJSON。

## 0.2.2 - 2026-11-13

### 复审修复

- 修复 `/api/profiles/test` 复用旧 accessToken 并向调用方 wsUrl 发送的凭据外带路径。
- 上游地址白名单不再绕过字面私有/保留 IP 校验；回环自连网关端口被拒绝。
- 新增 `TRUSTED_PROXY_IPS`，仅可信代理的 socket 才采信 XFF；HSTS 使用同一判断。
- 全局 `unhandledRejection`/`uncaughtException` 记录后退出，交给容器重启。
- 统一上游/前端 URL 过滤；拒绝 `data:text/javascript` 等非白名单 file data URL。
- WebSocket 鉴权启用时要求 Origin；smoke test 同步使用 Origin。
- 原始 payload 在物化前检查体积；慢客户端分级 gap/断开；客户端收到 gap 后重新同步。
- 压缩快照增加 fsync 和 Windows rename 重试；SW 离线回退不再返回 undefined。
- Dockerfile 预创建并 chown 数据目录，运行镜像只复制前端 dist。

### 仍然保留

- HeightIndex 分页边界 O(n) 重建、消息数组复制。
- profile 批量保存未事务化。
- CSP 的 ws/https 兼容范围、Cookie 无 `__Host-`/全端吊销。
- 没有 CI/SAST/依赖持续扫描。

## 0.2.1 - 2026-11-13

### 安全修复

- 非回环 `HOST` 且未设置 `GATEWAY_TOKEN` 时拒绝启动；Docker Compose 强制要求 Token。
- 修复上游 `params:null` 导致未捕获 Promise 拒绝和进程退出的问题；增加全局异常记录。
- 收紧上游地址校验：字面私有/保留 IP、IPv6-mapped 元数据地址被拒绝；主机名默认需要 `UPSTREAM_HOST_ALLOWLIST`。
- `/api/profiles/:id` 不再返回上游 `accessToken`；编辑留空会沿用旧值。
- 统一上游消息 URL 白名单，拒绝 `javascript:`、HTML data URL 和 SVG data URL。
- 默认关闭 `auth.*` 子协议 Token；query token 仍为显式开关。
- 收紧 CJK 相关容器/环境：`.env` 权限、备份忽略规则、Docker 构建上下文和依赖锁。
- 限制单条消息体积，NDJSON 启动改为流式读取；慢 WebSocket 客户端显式断开；媒体请求限速并改为流式响应。

### 稳定性与测试

- 消息物化、追加、compaction 串行执行，修复压缩窗口重复落盘。
- 增加 OneBot 畸形参数、URL scheme、SSRF、压缩竞态的回归测试。
- 修复 smoke test 的会话 Cookie 登录，测试套件 8/8 通过。

### 已知边界

- `HeightIndex` 在分页边界仍会 O(n) 重建；消息数组追加仍有数组复制成本。
- `/api/profiles` 批量保存仍是逐实例写入，尚未合并为单次事务。
- 远程图片仍可能触发第三方请求，CSP 的 `connect-src`/`img-src` 仍保留兼容范围。

## 0.2.0 - 2026-11-13

### 聊天窗口与渲染

- 聊天消息改为按窗口虚拟渲染，只挂载视口附近的消息，避免长会话把整段 DOM 全部渲染出来。
- 行高改为实际测量，并用分块高度索引更新位置；图片、文件或视频加载后再测量，减少滚动错位。
- 新消息按 `requestAnimationFrame` 合并，避免每条消息都触发一次完整渲染。
- 消息行和消息片段做 memo 化，减少无关重绘。
- 时间格式化加入缓存，避免同一时间字符串反复 `toLocaleTimeString`。
- 图片加入懒加载；旧浏览器不支持 `ResizeObserver` 时回退到固定行高和媒体加载补测。
- 聊天窗口支持背景图按面板尺寸显示，不再使用全屏 fixed 背景。
- 新增背景适配：铺满、完整显示、自定义裁切。
- 自定义裁切使用最近的聊天窗口宽高比，预览与保存共用同一套 Canvas 几何计算。
- 裁切弹窗禁用遮罩点击和 Esc 关闭，避免拖动滑杆时意外关闭。
- 新增动态背景（MP4/WebM），限制 8 秒、1280×720、8MB，默认关闭自动播放，切后台暂停。
- 新增 Lite 模式，关闭动画、过渡、阴影和大面积毛玻璃，降低旧设备开销。
- 增加默认、烟熏玻璃、透明三种聊天主题。
- 玻璃和透明模式共用统一气泡质感，发送者仅通过左右对齐区分。
- 增加按时段变化的侧向暖光，清晨偏黄、正午偏白、夜间变暗偏冷，每小时更新。
- 图片背景降低侧光强度，视频背景完全关闭侧光。
- 增加透明模式局部玻璃反射、工具栏和输入区可读性遮罩。

### 历史记录与分页

- 历史改为按会话懒加载，不再在连接时为每个私聊/群聊加载全部历史。
- 每页 30 条，滚动到顶部附近并停止 80ms 后自动加载；加载完成后冷却 200ms。
- 保留“加载更早”按钮作为手动兜底。
- 使用消息 ID 锚点恢复滚动位置，关闭浏览器自动 scroll anchoring，减少顶部插入时的抖动。
- 服务端 `beforeId` 分页只复制当前页，不再先复制整段更早历史。
- 历史分页带有过期请求保护，切换会话后旧请求不会覆盖新会话。
- 设置页新增历史导入：用户自己选择私聊会话，服务端只读 AstrBot SQLite，不自动导入，不导入群聊。

### 发送、连接与稳定性

- WebSocket 支持指数退避自动重连和心跳。
- 发送加入 pending 队列、`clientId` 确认和短时幂等。
- 输入框只在服务端 ack 后清空；发送失败会保留输入并提示。
- 网关增加单客户端消息队列、消息速率限制、客户端数量和单 IP 限制。
- 服务端增加 ping/pong 死连接清理。
- 消息存储改为追加式 NDJSON，不再每条消息重写完整 JSON。
- 增加有界静态资源压缩缓存、gzip/brotli、TCP_NODELAY 和 HTTP 超时。
- 增加 API 请求限流、登录失败限流和 profile 测试限流。

### 存储、媒体与数据完整性

- 消息存储改为追加文件句柄，定期 compact，启动时保留旧格式迁移备份。
- 消息索引按会话维护；达到上限时只移除被淘汰消息的索引，不再全量重建。
- 图片/文件从消息 JSON 中拆出，写入 `data/media`，通过认证的 `/api/media` 提供服务。
- 媒体支持单文件、总容量和文件数限制，compact 后清理未引用文件。
- 修复持久文件句柄重复打开、优雅关闭和写入失败路径。
- 保留 AstrBot 的 UMO、`self_id`、`group_id`、`user_id`、`sender` 和消息顺序契约。

### 安全与浏览器兼容

- 修复用户背景图的 CSP：允许同源 `blob:` 图片和媒体，不允许脚本或任意网络源。
- 使用安全的 localStorage 封装，Safari 隐私模式和受限 WebView 不再因存储异常崩溃。
- Vite 生产目标调整为 ES2017 / Safari 12 基线。
- Lite 模式关闭全部 `backdrop-filter` 和装饰性网格背景。
- 拒绝 SVG 图片、HTML data URL 和路径穿越。
- 增加可选 `UPSTREAM_HOST_ALLOWLIST`，限制 OneBot 上游主机。
- 保留 `ALLOW_QUERY_TOKEN` 兼容开关，但默认关闭并在启用时输出安全警告。
- Windows、Linux 增加启动器；Android 提供 PWA 使用说明。
- OneBot payload 抽成纯函数，增加群聊/私聊字段回归测试。
- 增加兼容性、标准、架构、性能、压力测试、隐私和部署文档。

### 工程与构建

- 移除 Refine 运行时和不必要的依赖。
- 拆分 OneBot 事件构造、导入器、存储和网关职责。
- 清理未使用的 OneBot sequence、未使用 import 和演示配置。
- 静态资源按产物的 mtime/size 做有界压缩缓存。
- 增加源码包、版本号、隐私扫描和 GitHub Release 流程。

### 已知边界

- 真实 AstrBot 端到端和 Android 旧浏览器视觉表现仍需在真实设备上验收。
- 动态视频背景不做自定义裁切。
- 导入历史的时间戳部分来自原会话时间/提醒推算，个别时间可能不精确。
- React/Ant Design 仍有自身浏览器下限；10 年前设备建议 Lite 模式，但不能保证所有旧浏览器都支持。
