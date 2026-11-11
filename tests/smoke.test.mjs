import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(import.meta.dirname, "..");
const node = process.execPath;

async function waitFor(url, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function waitForMessage(ws, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("message timeout")), timeout);
    const onMessage = (raw) => {
      let payload;
      try { payload = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(payload)) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(payload);
    };
    ws.on("message", onMessage);
  });
}

test("gateway relays text and image to mock AstrBot", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "snowluma-window-"));
  const mock = spawn(node, ["scripts/mock-astr.mjs"], {
    cwd: root,
    env: { ...process.env, MOCK_PORT: "6399" },
    stdio: "ignore",
  });
  const gateway = spawn(node, ["services/gateway/src/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      ONEBOT_WS: "ws://127.0.0.1:6399/ws",
      PORT: "8788",
      GATEWAY_TOKEN: "test",
      SELF_ID: "1000000001",
      PRIVATE_USER_ID: "1000000002",
      GROUP_ID: "2000000001",
      DATA_DIR: dataDir,
    },
    stdio: "ignore",
  });

  try {
    await waitFor("http://127.0.0.1:8788/api/health");
    const ws = new WebSocket("ws://127.0.0.1:8788/ws?token=test");
    await waitForMessage(ws, (payload) => payload.type === "hello");
    const reply = waitForMessage(ws, (payload) => payload.type === "message" && payload.message.role === "assistant");
    ws.send(JSON.stringify({
      type: "send",
      conversation: "private",
      parts: [{ type: "text", text: "测试" }, { type: "image", url: "data:image/png;base64,AA==" }],
    }));
    const payload = await reply;
    assert.ok(payload.message.text.includes("测试"));
    ws.close();
  } finally {
    mock.kill();
    gateway.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
});
