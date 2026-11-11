# Security Audit

## Scope

Gateway HTTP/WebSocket, profile configuration, auth/session, static assets, message storage, browser client, PWA cache, deployment assumptions.

## Mainstream findings and fixes

| Area | Finding | Fix |
|---|---|---|
| Auth | Bearer token persisted in `localStorage` | HttpOnly + SameSite=Strict session cookie |
| WebSocket | Token could appear in URL/query | Cookie auth; query token disabled by default |
| Auth | String comparison timing leak | `crypto.timingSafeEqual` |
| Brute force | No login throttling | 10 failures / IP / 60s |
| CSRF | Cookie auth could be cross-site | SameSite=Strict + WebSocket Origin check |
| Path traversal | Prefix check was insufficient | `path.relative` containment check |
| SSRF | Profile URL could target cloud metadata | ws/wss only; metadata/link-local blocks |
| XSS | React + CSP | No `dangerouslySetInnerHTML`; script-src self |
| Headers | Missing browser hardening | CSP, frame deny, nosniff, referrer, permissions, COOP/CORP |
| DoS | Unbounded WebSocket clients/messages | connection caps, per-IP caps, message rate limit |
| Slow client | Unbounded send buffer | bufferedAmount thresholds/terminate |
| HTTP | Slowloris/header timeouts | 10s header / 15s request / 5s keep-alive |
| Secrets | Config/message file permissions | `0600` files, `0700` data dir, atomic rename |

## Niche findings and fixes

| Area | Finding | Fix |
|---|---|---|
| PWA | Service worker could cache API responses | API/WS fetch bypass |
| PWA | Stale old shell | cache version `v4`, navigation network-first |
| Storage | Legacy localStorage token | removed on startup |
| Upstream | Reconnect storm | exponential backoff + jitter, max 30s |
| Upstream | Oversized event payload | 2 MB client payload cap |
| Logging | Query token leakage | query token opt-in only |
| Auth | Session fixation | 32-byte random session IDs |
| Auth | Old sessions persist | 12h TTL + periodic cleanup |
| Privacy | Profile IDs leak before login | config/health redacted when unauthenticated |
| Config | Non-atomic writes | temp file + rename |

## Residual risks

1. A single gateway token grants access to every profile on that gateway.
2. Remote images in chat can trigger third-party requests; `Referrer-Policy: no-referrer` reduces but does not eliminate IP exposure.
3. The app is HTTP by default; TLS must be supplied by Caddy, Tailscale, or another trusted reverse proxy.
4. Rate limiting is per socket IP; behind a proxy all users may share one bucket unless `TRUST_PROXY`/edge rate limits are configured.
5. No per-message end-to-end encryption; storage and transport are protected by deployment controls.

## Verification performed

- Profile URL allow/block tests for metadata and `file://`.
- Session cookie login returns `HttpOnly; SameSite=Strict`.
- Authenticated `/api/config` returns profiles; unauthenticated returns none.
- Authenticated WebSocket handshake with cookie succeeds.
- Security headers present on API responses.
- Build and headless render smoke tests.
