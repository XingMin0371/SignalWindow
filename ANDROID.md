# Android 使用说明

Android 不运行 Node.js 网关，也不需要 APK。Android 通过浏览器访问运行在 Windows、Linux 或 NAS 上的 Signal Window。

## 局域网使用

1. 在电脑上启动 Signal Window。
2. 确认手机和电脑在同一 Wi-Fi。
3. 电脑启动时把 HOST 设为可被局域网访问的地址，例如：

```text
HOST=0.0.0.0
PORT=8787
```

4. Android Chrome/Edge 打开：

```text
http://电脑局域网IP:8787
```

5. 设置 Gateway Token 后登录。

## 安装成 PWA

在 Android Chrome 中：

```text
浏览器菜单 → 添加到主屏幕
```

HTTPS 下 PWA 安装能力最完整；局域网 HTTP 可以聊天，但不保证离线缓存和安装提示。

## 低功耗建议

```text
设置 → 性能与显示 → 轻量模式
设置 → 聊天外观 → 玻璃或透明
```

动态背景默认关闭。Android 上建议使用静态压缩背景，避免持续视频解码。

## 远程访问

不要直接把 8787 暴露到公网。推荐：

```text
Tailscale
Cloudflare Tunnel
Caddy + 认证
```

远程使用必须设置 `GATEWAY_TOKEN`，并优先使用 HTTPS。

## 为什么默认不是 APK

Signal Window 当前是 Web/PWA，不是 Android 原生项目。APK 需要额外的 Android 包装层：

```text
TWA：HTTPS + Digital Asset Links + Android SDK
Capacitor/WebView：可走 HTTP，但隔离性较弱
```

没有 APK 不等于兼容性降低。PWA 的优点是 Windows、Linux、Android、iOS 共用同一套页面和升级路径。  
如果必须分发 APK，需要单独增加 Android wrapper、签名和构建流程，不能直接把 JavaScript 改后缀生成 APK。
