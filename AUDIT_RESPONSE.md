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

- 前端已接入常驻 `SqrtHeightIndex`，append/prepend/update 不再全量重建；消息数组的不可变追加仍会复制当前会话数组。
- `/api/profiles` 的 Settings 保存仍逐 profile 写入并重连，未合并为一次事务。
- CSP 的 `connect-src`/`img-src` 仍保留 `ws:`/`https:` 兼容范围；没有做远程图片代理。
- Cookie 仍使用 `SameSite=Strict`，没有 `__Host-` 前缀和全端吊销接口。
- 未加入 CI、SAST、依赖持续扫描和真实浏览器 FPS/INP 门禁。

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
- v0.2.3：增量高度索引完成；仍未清零 profile 批量保存、CSP 宽范围、Cookie 全端吊销、CI/SAST。

## v0.2.4 低风险整合

- A-1：gap 历史重同步、草稿恢复，不再 reload。
- A-2：`REQUIRE_ORIGIN` 可选强制，默认兼容无 Origin 客户端。
- A-3：代理 IP 归一化/CIDR/启动告警。
- A-4：DATA_DIR 单实例锁，含容器 PID1 陈旧锁处理。
- A-5：致命异常软硬分级。
- A-7：gap 仅重同步当前会话。
- B.2：常驻 SqrtHeightIndex，随机等价测试通过。
- G.4：profile 保存改为 PUT 单事务校验与一次写盘。
- 静态 ETag/304、会话轮换/全端吊销。

未切换：SQLite 后端、消息外部 store、CSP 收紧、文件魔数、CI/SAST。
