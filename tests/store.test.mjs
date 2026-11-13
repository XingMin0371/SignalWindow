import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("compaction does not duplicate an appended message", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "signal-store-"));
  process.env.DATA_DIR = dataDir;
  process.env.MAX_MESSAGES = "1";
  process.env.COMPACT_EVERY_TRIMS = "1";
  try {
    const { store } = await import(`../services/gateway/src/store.mjs?test=${Date.now()}`);
    await store.init();
    for (let index = 0; index < 4; index += 1) {
      await store.add({
        profile: "p",
        conversation: "private",
        targetId: "1",
        role: "user",
        parts: [{ type: "text", text: `m${index}` }],
      });
    }
    await store.close();
    const lines = (await readFile(path.join(dataDir, "messages.ndjson"), "utf8")).trim().split("\n");
    const texts = lines.map((line) => JSON.parse(line).text);
    assert.deepEqual(texts, ["m3"]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
