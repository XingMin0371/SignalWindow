import fs from "node:fs/promises";
import path from "node:path";
import { partsToText } from "./message.mjs";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const FILE = path.join(DATA_DIR, "messages.json");
const MAX_MESSAGES = Number(process.env.MAX_MESSAGES || 4000);

class Store {
  constructor() {
    this.messages = [];
    this.writeChain = Promise.resolve();
    this.seq = 0;
    this.saveTimer = null;
    this.revision = 0;
    this.lastSavedRevision = 0;
  }

  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await fs.chmod(DATA_DIR, 0o700).catch(() => {});
    try {
      const raw = await fs.readFile(FILE, "utf8");
      this.messages = JSON.parse(raw);
      if (!Array.isArray(this.messages)) this.messages = [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.messages = [];
    }
    // Keep the original single-upstream history readable.
    for (const message of this.messages) {
      if (!message.profile) message.profile = "main";
    }
  }

  list(profile, conversation, targetId, defaultTargetId, limit = 200) {
    return this.messages
      .filter((m) => m.profile === profile && m.conversation === conversation)
      .filter((m) => {
        if (!targetId) return true;
        if (m.targetId) return m.targetId === targetId;
        return targetId === defaultTargetId;
      })
      .slice(-limit);
  }

  async add({ profile = "main", conversation, targetId = "", role, parts, source = "web" }) {
    const message = {
      id: `${Date.now()}-${++this.seq}`,
      profile,
      conversation,
      targetId,
      role,
      parts,
      text: partsToText(parts),
      source,
      time: new Date().toISOString(),
    };
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this.revision += 1;
    this.scheduleSave();
    return message;
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch((error) => console.error("store write failed", error));
    }, 250);
    this.saveTimer.unref?.();
  }

  async flush() {
    if (this.revision === this.lastSavedRevision) return this.writeChain;
    const revision = this.revision;
    const snapshot = JSON.stringify(this.messages, null, 2);
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      const temporary = `${FILE}.${process.pid}.tmp`;
      await fs.writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporary, FILE);
      this.lastSavedRevision = revision;
    });
    await this.writeChain;
    if (this.revision !== this.lastSavedRevision) this.scheduleSave();
    return this.writeChain;
  }
}

export const store = new Store();
