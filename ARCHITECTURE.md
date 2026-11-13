# Architecture and extension boundaries

## Data invariants

The following values are part of the compatibility contract and must not be
rewritten by presentation or storage optimizations:

```text
profile.id
profile.selfId
privateUserIds / groupIds
post_type
message_type
self_id
user_id
group_id
message_id
message
raw_message
sender
UMO / conversation key
message order
```

AstrBot memory continuity depends on the group/private UMO remaining stable.

## Gateway boundaries

```text
http server          transport, static files, API routing, rate limits
session auth         HttpOnly session, token checks
WebSocket hub        clients, heartbeat, reconnect state
onebot client        upstream connection and action routing
onebot-payload.mjs   pure OneBot v11 event construction
message.mjs          normalization and sanitization
store.mjs            message NDJSON, indexes, media materialization
upstreams.mjs        profile validation and persistence
```

`onebot-payload.mjs` is deliberately pure: protocol fields can be tested
without opening a network connection.

## Storage format

```text
data/messages.ndjson   one compact JSON message per line
data/messages.json     legacy input; renamed to messages.json.migrated
data/media/            content-addressed media files, quota + compaction cleanup
```

The store keeps a per-conversation index and pages history. It does not rewrite
the complete history for every message.

## Extension points

The current implementation is intentionally small, but these boundaries can be
replaced without changing OneBot compatibility:

```text
Store:        NDJSON today; SQLite/PostgreSQL later
MediaStore:   local files today; S3/object storage later
Transport:    OneBot v11 today; another bridge later
Auth:         gateway token today; OAuth/SSO later
Members:      human/browser clients today; multi-bot members later
```

## Stability rules

- Only append durable messages after validation.
- A send is acknowledged only after the OneBot event is handed to the upstream.
- The client resends a pending send after reconnecting.
- `clientId` is used for short-term idempotency.
- WebSocket heartbeat removes dead clients.
- The gateway rejects malformed profiles, unsafe data URLs, oversized requests,
  and exceeded rate limits.
- No migration deletes the original `messages.json`; it is retained as
  `messages.json.migrated`.

## History import

`astrbot-import.mjs` opens the AstrBot SQLite database read-only and imports
only selected private targets that already exist in SignalWindow profiles.
Settings drives the selection through authenticated API calls; there is no
automatic import on startup.
