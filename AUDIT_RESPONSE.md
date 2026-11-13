# 代码审查回应

对应审查报告：`SignalWindow-代码审查报告.md`，基线 `v0.2.0 / 3875f89`。

## 已修复

- P0 默认空 Token 的公网启动路径：非回环地址无 Token 时拒绝启动，Compose 要求显式 Token。
- P0 上游 `params:null` 可触发的未捕获拒绝：补结构校验、catch 和全局异常记录。
- P1 SSRF：字面私有/保留 IP、IPv4-mapped 元数据地址拒绝；主机名默认要求 allowlist。
- P1 完整 profile Token 回传：profile 读取接口不再返回 accessToken；留空保留旧 Token。
- P1 压缩竞态：物化、内存追加、文件追加和 compaction 串行化。
- P1 上游 URL scheme：统一拒绝脚本和 HTML/SVG data URL。
- P1 密钥备份和 Docker 上下文：忽略 `.bak`/配置，`0600` 权限，修复 Dockerfile 锁文件和运行用户。
- P2 慢客户端静默丢消息：超过 1 MB 直接断开，让客户端重连补历史。
- P2 单条消息体积、NDJSON 流式加载、媒体请求限速和流式响应。
- P2 前端 IndexedDB 连接关闭和裁切图片缓存上限 1。
- P2 smoke test 改为 Cookie 登录，测试 8/8 通过。
- 服务端移除启动日志中的完整 wsUrl；profile 测试错误不再回显底层异常。
- PWA 非哈希资源改网络优先，缓存版本更新。

## 仍然存在的边界

- 前端使用 Fenwick O(log n) 高度索引；消息数组不可变追加仍会复制当前会话数组。
- CSP 的 `connect-src`/`img-src` 仍保留 `ws:`/`https:` 兼容范围；没有做远程图片代理。
- 文件内容魔数校验、NDJSON → SQLite WAL、Docker 基础镜像 digest 未实现。
- 会话已有登录轮换和 `all=1` 吊销，但没有审计日志和自动化吊销策略。
- `.github/workflows/ci.yml` 在源码包中；当前 GitHub Token 无 workflow 权限，未推送到远端 main。
- 没有 SAST、依赖持续扫描和真实浏览器 FPS/INP 门禁。

以上边界写在文档里，不把“已修复”扩大为“生产级全部达标”。

## v0.2.2 复审补充

- N-01：Dockerfile 预创建 `/app/data`、`/app/config` 并 chown 给 node，运行镜像只复制 dist。
- N-02：profile test 不再合并旧 accessToken；addProfile 仅在 id 和 wsUrl 都相同时沿用旧令牌。
- N-03：致命异常记录后进程退出，不再继续服务。
- N-04：白名单不再跳过字面私有/保留 IP；回环自连网关端口被拒，允许清单主机名仍受 DNS 边界限制。
- N-05：新增可信代理 IP 列表，XFF/HSTS 仅对可信 socket 生效。
- N-06：文件 data URL 改为显式允许类型，`data:text/javascript` 被拒；链接补 `noopener`。
- N-07：原始 payload 在物化前检查体积。
- N-08：1–4 MB 发送 gap，超过 4 MB 断开；前端 gap 后重新同步。
- N-09：SW 离线回退返回 504，不再把 undefined 交给 respondWith。
- N-10：快照 fsync，Windows rename 重试；trim 仍是数组移动。
- N-11：运行镜像只包含 dist，基础镜像摘要仍未固定。
- v0.2.3：增量高度索引完成；profile 批量保存、Cookie 全端吊销、CI 已在后续版本补齐，CSP 仍保留兼容范围。

## v0.2.4 低风险整合

- A-1：gap 历史重同步、草稿恢复，不再 reload。
- A-2：`REQUIRE_ORIGIN` 可选强制，默认兼容无 Origin 客户端。
- A-3：代理 IP 归一化/CIDR/启动告警。
- A-4：DATA_DIR 单实例锁，含容器 PID1 陈旧锁处理。
- A-5：致命异常软硬分级。
- A-7：gap 仅重同步当前会话。
- B.2：高度索引先前为 SqrtHeightIndex，v0.2.7 已替换为 Fenwick O(log n)。
- G.4：profile 保存改为 PUT 单事务校验与一次写盘。
- 静态 ETag/304、会话轮换/全端吊销。

未切换：SQLite 后端、消息外部 store、CSP 收紧、文件魔数、CI/SAST。

## v0.2.5 文档漏项收尾

- 媒体 Range、可选媒体域名白名单、HTTPS `__Host` Cookie。
- profile test 固定延迟，图片输入类型/大小提示。

未做：任意 http(s) 默认域名收敛（需配置白名单才生效）、文件魔数、SQLite、CSP 收紧、Docker digest。

## v0.2.6 round4 合入

- 36/36 全量审计通过；内置 8/8；回归 5/5（TAP reporter）。
- 修复跨平台启动、SPA 回退、Content-Length、Host/Origin、Settings 回存、并发幂等、null parts、上游媒体段、锁心跳、握手超时、轻量版与老浏览器降级。
- 移除未使用 zod；Node 门槛 >=18.18；Docker/CI 配置随源码交付。
- GitHub Token 无 workflow 权限，CI 工作流未推送到 main，但保留在源码包。

## v0.2.7 剩余优化

- Fenwick O(log n) 高度索引已替换，随机差分测试通过。
- 历史分页哈希索引已合入，分页与 trim 等价性测试通过。
- SW 安装 allSettled、ready 等待、文件 input reset。
- 组提交、SQLite、echo、缩略图、请求指标、外部 store 仍未合并。

## v0.2.8 版本一致性

- 包、README、CHANGELOG、发布 tag 统一为 0.2.8。
- `/api/health` 返回运行版本，便于确认实际部署版本。
- 修正 Fenwick/Zod/性能文档的旧描述。

## v0.2.99 最终交付

- 事件总线、WebSocket 处理器注册、扩展文档。
- 消息合并写盘、20 段限制、遗留会话合并修复。
- 玻璃静态质感、轻量模式实色兜底、前端来源标记索引。
- 修复合并写盘顺序、空 MIME 图片、索引前插/整页替换、OneBot 回包异常。
- 严苛测试 18/18，全量 36/36，自有 8/8，回归 5/5。

## v0.3.0 最终检查

- 全链路检查修复：合并写盘失败重试、空 MIME 图片、AVIF、OneBot 回包、事件快照、畸形 URL、未知 API、WebSocket 升级异常。
- 恢复旧 accessToken 仅在相同上游地址复用的安全边界。
- 会话/限流/幂等键增加容量上限。
- 严苛测试 18/18，自有测试 8/8，TypeScript 与生产构建通过。
- 大批量 15,000 条写入、5,000 条压缩、重启一致性通过。
- Docker 镜像实际构建并启动成功；前端启动脚本、非 root 用户和数据目录均可用。
