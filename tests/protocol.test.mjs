import test from "node:test";
import assert from "node:assert/strict";
import { buildOneBotMessageEvent } from "../services/gateway/src/onebot-payload.mjs";
import { sanitizeParts } from "../services/gateway/src/message.mjs";

test("group OneBot event keeps AstrBot-compatible fields", () => {
  const event = buildOneBotMessageEvent({
    selfId: "123456",
    messageType: "group",
    targetId: "654321",
    messageId: 1700000000000,
    privateUserId: "123456",
    parts: [{ type: "text", text: "hello" }],
  });
  assert.equal(event.post_type, "message");
  assert.equal(event.message_type, "group");
  assert.equal(event.self_id, 123456);
  assert.equal(event.group_id, 654321);
  assert.equal(event.message_id, 1700000000000);
  assert.equal(event.raw_message, "hello");
  assert.deepEqual(event.message, [{ type: "text", data: { text: "hello" } }]);
  assert.deepEqual(event.sender, { user_id: 123456, nickname: "Signal Window" });
});

test("private OneBot event keeps sender as the private peer", () => {
  const event = buildOneBotMessageEvent({
    selfId: "123456",
    messageType: "private",
    targetId: "777777",
    messageId: 1,
    privateUserId: "123456",
    parts: [{ type: "text", text: "hi" }],
  });
  assert.equal(event.user_id, 777777);
  assert.equal(event.sender.user_id, 777777);
  assert.equal(event.group_id, undefined);
});

test("data URL policy rejects SVG and HTML", () => {
  const parts = sanitizeParts([
    { type: "image", url: "data:image/svg+xml;base64,PHN2Zy8+" },
    { type: "image", url: "data:image/png;base64,iVBORw0KGgo=" },
    { type: "file", name: "x", url: "data:text/html,<b>x</b>" },
    { type: "text", text: "ok" },
  ]);
  assert.deepEqual(parts.map((part) => part.type), ["image", "text"]);
  assert.ok(parts[0].url.startsWith("data:image/png"));
});
