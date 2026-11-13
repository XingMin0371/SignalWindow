import test from "node:test";
import assert from "node:assert/strict";

test("OneBot null params does not reject or crash", async () => {
  const { OneBotClient } = await import("../services/gateway/src/onebot.mjs");
  const client = new OneBotClient({
    id: "test",
    label: "test",
    selfId: "1000000001",
    privateUserIds: ["1000000002"],
    groupIds: [],
  });
  const result = await client.handleAction({ action: "send_msg", params: null });
  assert.equal(result.status, "failed");
  assert.equal(result.retcode, 100);
});

test("upstream URL schemes are filtered", async () => {
  const { normalizeMessage } = await import("../services/gateway/src/message.mjs");
  const parts = normalizeMessage([
    { type: "file", data: { name: "x", url: "javascript:alert(1)" } },
    { type: "file", data: { name: "x", url: "data:text/html,<b>x</b>" } },
    { type: "image", data: { url: "data:image/svg+xml;base64,PHN2Zy8+" } },
    { type: "text", data: { text: "ok" } },
  ]);
  assert.deepEqual(parts.map((part) => part.type), ["text"]);
});

test("private and mapped metadata upstreams are rejected without allowlist", async () => {
  const { normalizeProfile } = await import("../services/gateway/src/upstreams.mjs");
  delete process.env.UPSTREAM_HOST_ALLOWLIST;
  const base = { id: "x", label: "x", selfId: "1000000001", privateUserId: "1000000002" };
  for (const wsUrl of ["ws://10.0.0.5:22/ws", "ws://192.168.1.10:6199/ws", "ws://[::ffff:169.254.169.254]:80/ws"]) {
    assert.throws(() => normalizeProfile({ ...base, wsUrl }));
  }
  assert.doesNotThrow(() => normalizeProfile({ ...base, wsUrl: "ws://127.0.0.1:6199/ws" }));
});
