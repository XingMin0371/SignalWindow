# Stress test record

Environment: local Windows host, Node.js 24.21, temporary data directory,
fake OneBot upstream. No production AstrBot data was touched.

## 10 concurrent clients / message burst

```text
Clients:                 10
Scheduled sends:         400 messages
Message cap:             200 (forces trim path)
Acknowledged sends:      400
Upstream messages:       400
Elapsed:                 4,688 ms
Average ack latency:     4 ms
p95 ack latency:         8 ms
Health request latency:  1.2 ms
```

The important regression tested here: when the in-memory message cap is full,
the store must remove only evicted messages from the index. It must not rebuild
the full index for every new message. Static assets are served from a bounded
compressed cache after the first request.

## 3000-message history / 10 clients

```text
Seeded history:          3000 messages
Clients:                 10
History page request:    30 messages each (historical run used 40)
Responses:               10 / 10
Returned per client:     30 (historical run used 40)
Total response time:     11 ms
```

## Browser rendering

The source uses measured virtual rows, requestAnimationFrame message batching,
memoized rows, lazy images and optional Lite mode. A real browser FPS/INP test
still requires a browser or Android device; this environment cannot spawn one
reliably.

## Known limits

- The backend test uses text messages, not large media.
- The recorded stress run did not cover the compaction threshold; a serialized add/compact regression test is now included in the test suite.
- The fake upstream does not model AstrBot model latency.
- Render FPS was not measured on physical Android hardware.
