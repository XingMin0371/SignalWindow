# Changelog

## 2026-11-12

- Private history import is now user-selected in Settings; automatic import removed. Scroll loading uses 30 per page, idle-triggered auto-load, and anchored scroll restoration.
- Added one-shot read-only importer for AstrBot private history; group history is not imported.
- Fixed CSP for local blob backgrounds, guarded localStorage, added ES2017/Safari 12 build target, full Lite blur fallback, block-decomposed height index, batched message appends, static compression cache, and safer legacy history lookup.
- Fixed the capped-history index rebuild hotspot; stress test: 10 clients / 400 messages, ack average 4 ms, p95 8 ms; 3000-message history for 10 clients in 11 ms.
- Added measured virtual chat rows, incremental history paging, and frame-batched message updates.
- Added WebSocket reconnect, send queue, acknowledgement, and idempotency.
- Added NDJSON message store, content-addressed media, media quota, and compaction cleanup.
- Added gzip/brotli static assets and API rate limits.
- Added low-power default/glass/transparent themes and local static/dynamic backgrounds.
- Added Lite mode, Windows/Linux launchers, Android PWA guidance, compatibility and standards documents.
- Removed unused Refine runtime, demo config, unused OneBot sequence, and unused imports.

