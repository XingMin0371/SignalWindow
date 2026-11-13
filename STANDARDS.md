# Standards and security review

## Protocol

- OneBot v11 message event fields are kept as the compatibility contract.
- AstrBot UMO, group id, user id, self id, sender, message id and raw message
  are not rewritten by storage or rendering changes.
- `services/gateway/src/onebot-payload.mjs` is a pure builder covered by a
  protocol regression test.

## Security baseline

Implemented:

```text
HttpOnly SameSite=Strict session cookie
bearer/session authentication
rate limits for API, login failures, WebSocket messages and profile tests
CSP, frame denial, nosniff, referrer policy, permissions policy
path containment for static files and media
content-addressed media names
data URL MIME allowlist; SVG and HTML data URLs rejected
optional UPSTREAM_HOST_ALLOWLIST against SSRF
media size and total quota
WebSocket ping/pong and dead-client removal
atomic profile writes and private file modes
```

Intentional limits:

```text
single shared gateway token is not a multi-tenant authorization system
private-network upstream URLs are allowed unless UPSTREAM_HOST_ALLOWLIST is set
media retention is quota/compaction based, not a full lifecycle manager
no native Android/iOS package is shipped
```

## Web and accessibility

- PWA manifest with icons, scope, display and theme color.
- Responsive viewport, safe-area padding, mobile composer.
- File inputs have accessible names.
- Keyboard Enter/Ctrl+Enter and Shift+Enter behavior documented.
- Images use lazy loading; dynamic backgrounds are opt-in and paused off-screen.

## Licensing and distribution

- Original code: AGPL-3.0-only.
- Dependency notices: `THIRD_PARTY_NOTICES.md`.
- License decision and code-borrowing audit: `LICENSE_AUDIT.md`.
- No telemetry, cloud account system or external analytics is included.
