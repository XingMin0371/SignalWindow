# Performance Audit

## Gateway

| Finding | Change |
|---|---|
| Every message serialized and rewrote full history | 250ms debounced batch write |
| Non-atomic writes could corrupt JSON | temp file + rename |
| Reconnect at fixed 3s | exponential backoff + jitter, max 30s |
| Slow WebSocket consumers accumulated memory | 1 MB send threshold, 8 MB disconnect |
| Unbounded client/message counts | client cap 100, per-IP 20, 60 messages/10s |
| Slow HTTP clients | header/request/keep-alive timeouts |
| Profile writes block request | async atomic write |
| Full history list scan | capped at 4000 messages; response limit 200 |

## Frontend

Routes are lazy-loaded:

```text
ChatPage
ProfilesPage
TopologyPage
DiagnosticsPage
SettingsPage
```

Vendor bundles are split:

```text
react / react-dom / react-router
refine
antd
react-flow
codemirror
recharts
```

Typical production output:

```text
initial app chunk   ~10 KB
react               ~182 KB
refine              ~183 KB
antd                ~925 KB
routes              ~2–42 KB each
```

Ant Design remains the largest shared chunk. Further reduction would require replacing Ant Design with a smaller component layer, which trades development stability for startup size.

## Browser runtime

- History is capped by the gateway before reaching the client.
- Images are loaded lazily by Ant Design Image.
- Chart polling is 3 seconds and retains 24 points.
- Service worker bypasses all `/api` requests.
- No synchronous blocking APIs in render paths.

## Residual risks

1. The initial Ant Design chunk is still large on slow mobile networks.
2. The chat log is not virtualized; very long histories may cost rendering time.
3. Full message persistence still serializes the capped history in the Node event loop; the debounce prevents per-message blocking but a very large history can cause a short pause.
4. Recharts and CodeMirror are loaded only on their pages, but they are still sizable.

## Verification

- Production Vite build succeeds with route/vendor chunks.
- Real AstrBot main profile remains connected after reload.
- Session and WebSocket handshake verified.
- Static assets use immutable cache; HTML/PWA files use no-cache.
