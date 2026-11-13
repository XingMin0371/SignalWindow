# Performance Audit

## Gateway

| Finding | Change |
|---|---|
| Every message serialized and rewrote full history | Append-only NDJSON; no per-message full rewrite |
| Non-atomic writes could corrupt JSON | temp file + rename |
| Reconnect at fixed 3s | exponential backoff + jitter, max 30s |
| Slow WebSocket consumers accumulated memory | 1 MB send threshold, 8 MB disconnect |
| Unbounded client/message counts | client cap 100, per-IP 20, 60 messages/10s |
| Slow HTTP clients | header/request/keep-alive timeouts |
| Profile writes block request | async atomic write |
| Full history list scan | per-conversation index; paged 30-message responses |
| Full index rebuild after every capped message | remove only evicted messages |
| 10 concurrent clients / 400 messages | ack avg 4 ms, p95 8 ms |
| 3000-message history / 10 clients | 10 pages in 11 ms |
| History loaded for every target at connect | lazy load for the selected conversation only |
| Long DOM | windowed rendering with measured rows and overscan |
| O(n) height offsets on each measurement | block-decomposed height index; block updates/lookup are O(√n), page-boundary construction is still O(n) |
| Repeated static compression | bounded in-memory compressed asset cache |
| Blocking browser storage | safe localStorage wrapper with memory fallback |
| Uncompressed static assets | gzip/brotli for text assets |
| Broken socket required refresh | exponential reconnect |
| Sends could be lost on disconnect | pending queue + server acknowledgement |
| Full-input cleared before acknowledgement | input retained until ack |
| No request-level API limit | 120 requests/10s per IP; profile tests 10/min |
| Images/files embedded in message JSON | materialized to private media files and served as URLs |
| Client opened with every target history | browser requests only the selected conversation |
| WebSocket payloads uncompressed | per-message deflate enabled |
| Capped history rebuilt full index | incremental eviction index |
| Default target history fallback scanned all messages | legacy bucket filter only |

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
antd
react-flow
codemirror
recharts
```

The unused Refine runtime was removed entirely. Remaining typical output:

```text
initial app chunk   ~10 KB
react               ~182 KB
antd                ~925 KB
routes              ~2–42 KB each
```

Ant Design remains the largest shared chunk. Further reduction would require replacing Ant Design with a smaller component layer, which trades development stability for startup size.

## Browser runtime

- History is loaded on demand for the selected conversation, not for every target.
- History loads 30 messages per page and auto-loads after an 80ms scroll idle near the top.
- Older-page requests are anchored by message id; browser scroll anchoring is disabled to avoid double correction.
- History imports are user-selected in Settings and read AstrBot SQLite read-only.
- Chat rows are measured and windowed by scroll position; only visible rows plus overscan are mounted (fixed-height fallback when ResizeObserver is unavailable).
- Images use native lazy loading where supported.
- A Lite mode toggle disables animation, backdrop filters, and shadows.
- The WebSocket reconnects with exponential backoff and resends one pending message after reconnect.
- Chart polling is 3 seconds and retains 24 points.
- Service worker bypasses all `/api` requests.
- No synchronous blocking APIs in render paths.

## Residual risks

1. The initial Ant Design chunk is still large on slow mobile networks.
2. The chat log uses windowed rendering; the height index is incremental, but message-array append still copies the current conversation array.
3. Media files are retained unless manually cleaned; message metadata remains capped.
4. Media has a 512 MiB / 5000-file default quota and unreferenced files are pruned after compaction.
5. Recharts and CodeMirror are loaded only on their pages, but they are still sizable.

## Verification

- Production Vite build succeeds with route/vendor chunks.
- Real AstrBot main profile remains connected after reload.
- Session and WebSocket handshake verified.
- Static assets use immutable cache; HTML/PWA files use no-cache.
