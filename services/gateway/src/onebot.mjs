import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { normalizeMessage } from "./message.mjs";
import { buildOneBotMessageEvent } from "./onebot-payload.mjs";

export class OneBotClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.onReply = config.onReply;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  connect() {
    if (this.stopped) return;
    const headers = {
      "X-Self-ID": String(this.config.selfId),
      "X-Client-Role": "Universal",
    };
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`;
    this.emit("status", { profile: this.config.id, label: this.config.label, connected: false, detail: "connecting" });
    let ws;
    try {
      ws = new WebSocket(this.config.wsUrl, { headers, maxPayload: 2 * 1024 * 1024, handshakeTimeout: 10_000 });
    } catch (error) {
      this.emit("status", { profile: this.config.id, label: this.config.label, connected: false, detail: error.message });
      if (!this.stopped) {
        const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt) + Math.floor(Math.random() * 500);
        this.reconnectAttempt += 1;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.emit("status", { profile: this.config.id, label: this.config.label, connected: true, detail: "connected" });
    });

    ws.on("message", (data) => {
      let payload;
      try { payload = JSON.parse(data.toString()); } catch { return; }
      if (!payload || typeof payload !== "object" || typeof payload.action !== "string") return;
      this.handleAction(payload)
        .then((response) => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ ...response, echo: payload.echo })); } catch (error) { console.error("[onebot-reply]", error.message); }
          }
        })
        .catch((error) => {
          console.error("[onebot-action]", error.message);
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ status: "failed", retcode: 1500, echo: payload.echo })); } catch (sendError) { console.error("[onebot-reply]", sendError.message); }
          }
        });
    });

    ws.on("close", () => {
      this.connected = false;
      this.emit("status", { profile: this.config.id, label: this.config.label, connected: false, detail: "disconnected" });
      if (!this.stopped) {
        const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt) + Math.floor(Math.random() * 500);
        this.reconnectAttempt += 1;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    });

    ws.on("error", (error) => {
      this.emit("status", { profile: this.config.id, label: this.config.label, connected: false, detail: error.message });
    });
  }

  async handleAction(payload) {
    try {
      if (!payload || typeof payload !== "object" || typeof payload.action !== "string") {
        return { status: "failed", retcode: 1400, data: null };
      }
      const action = payload.action;
      const params = payload.params && typeof payload.params === "object" ? payload.params : {};
      const messageType = String(
        params.message_type ||
        (action === "send_private_msg" ? "private" : action === "send_group_msg" ? "group" : params.group_id ? "group" : "private"),
      );
      if (/^send_/.test(action)) {
        const segments = Array.isArray(params.message)
          ? params.message.map((item) => `${item?.type || "?"}:${item?.data?.file ? "file" : item?.data?.url ? "url" : ""}`).join(",")
          : typeof params.message;
        const cleanLog = (value) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
        console.log("[onebot-action]", cleanLog(action), cleanLog(messageType), cleanLog(segments).slice(0, 200));
      }
      if (action === "send_private_msg" || action === "send_group_msg" || action === "send_msg") {
        const parts = normalizeMessage(params.message);
        if (!parts.length) return { status: "failed", retcode: 100, data: null };
        const conversation = messageType === "private" ? "private" : "group";
        const allowed = conversation === "private" ? this.config.privateUserIds : this.config.groupIds;
        const requested = String(conversation === "private" ? params.user_id || "" : params.group_id || "");
        let targetId = requested || allowed[0] || "";
        // Some upstreams copy the bot self_id into media actions. Map that known
        // case to the configured conversation target instead of dropping the media.
        if (!allowed.includes(targetId) && targetId === String(this.config.selfId)) targetId = allowed[0] || "";
        if (!allowed.includes(targetId)) return { status: "failed", retcode: 1403, data: null };
        const message = await this.onReply({ profile: this.config.id, conversation, targetId, parts });
        return {
          status: "ok",
          retcode: 0,
          data: { message_id: Number(message?.id?.split("-")[0]) || this.nextId() },
        };
      }
      if (action === "get_login_info") {
        return {
          status: "ok",
          retcode: 0,
          data: { user_id: Number(this.config.selfId), nickname: "Signal Window" },
        };
      }
      if (action === "get_group_list") {
        return {
          status: "ok",
          retcode: 0,
          data: this.config.groupIds.map((groupId) => ({ group_id: Number(groupId), group_name: "window" })),
        };
      }
      if (action === "get_friend_list") {
        return {
          status: "ok",
          retcode: 0,
          data: this.config.privateUserIds.map((userId) => ({ user_id: Number(userId), nickname: "owner" })),
        };
      }
      if (action === "get_group_member_info") {
        return {
          status: "ok",
          retcode: 0,
          data: { user_id: Number(params.user_id), nickname: "owner", role: "owner" },
        };
      }
      return { status: "failed", retcode: 1404, data: null };
    } catch (error) {
      return { status: "failed", retcode: 1500, data: { message: error.message } };
    }
  }

  nextId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  async send({ conversation, targetId, parts }) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("OneBot not connected");
    }
    const messageType = conversation === "group" ? "group" : "private";
    const allowed = messageType === "group" ? this.config.groupIds : this.config.privateUserIds;
    const resolved = String(targetId || allowed[0] || "");
    if (!allowed.includes(resolved)) throw new Error("target not allowed");
    const payload = buildOneBotMessageEvent({
      selfId: this.config.selfId,
      messageType,
      targetId: resolved,
      messageId: this.nextId(),
      privateUserId: this.config.privateUserIds[0] || this.config.selfId,
      parts,
    });
    if (this.ws.bufferedAmount > 1024 * 1024) throw new Error("OneBot backpressure limit exceeded");
    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(payload), (error) => error ? reject(error) : resolve());
    });
    return payload;
  }
}
