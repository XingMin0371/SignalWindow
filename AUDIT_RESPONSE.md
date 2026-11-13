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

- `HeightIndex` 的构造在分页边界仍是 O(n)；块内更新/定位是 O(√n)。消息数组的不可变追加仍会复制当前会话数组。
- `/api/profiles` 的 Settings 保存仍逐 profile 写入并重连，未合并为一次事务。
- CSP 的 `connect-src`/`img-src` 仍保留 `ws:`/`https:` 兼容范围；没有做远程图片代理。
- Cookie 仍使用 `SameSite=Strict`，没有 `__Host-` 前缀和全端吊销接口。
- 未加入 CI、SAST、依赖持续扫描和真实浏览器 FPS/INP 门禁。

以上边界写在文档里，不把“已修复”扩大为“生产级全部达标”。
