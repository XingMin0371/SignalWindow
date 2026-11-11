import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { normalizeMessage, partsToText, toOneBotMessage } from "./message.mjs";

export class OneBotClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.stopped = false;
    this.sequence = 0;
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
    const ws = new WebSocket(this.config.wsUrl, { headers, maxPayload: 2 * 1024 * 1024 });
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.emit("status", { profile: this.config.id, label: this.config.label, connected: true, detail: "connected" });
    });

    ws.on("message", (data) => {
      let payload;
      try { payload = JSON.parse(data.toString()); } catch { return; }
      if (!payload.action) return;
      this.handleAction(payload).then((response) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ...response, echo: payload.echo }));
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
    const { action, params = {} } = payload;
    const messageType = String(
      params.message_type ||
      (action === "send_private_msg" ? "private" : action === "send_group_msg" ? "group" : params.group_id ? "group" : "private"),
    );
    try {
      if (/^send_/.test(action)) {
        const segments = Array.isArray(params.message)
          ? params.message.map((item) => `${item?.type || "?"}:${item?.data?.file ? "file" : item?.data?.url ? "url" : ""}`).join(",")
          : typeof params.message;
        console.log("[onebot-action]", action, messageType, segments);
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
    const payload = {
      post_type: "message",
      message_type: messageType,
      self_id: Number(this.config.selfId),
      message_id: this.nextId(),
      time: Math.floor(Date.now() / 1000),
      message: toOneBotMessage(parts),
      raw_message: partsToText(parts),
      sender: {
        user_id: messageType === "private"
          ? Number(resolved)
          : Number(this.config.privateUserIds[0] || this.config.selfId),
        nickname: "Signal Window",
      },
      ...(messageType === "group"
        ? { group_id: Number(resolved) }
        : { user_id: Number(resolved) }),
    };
    if (!payload.message.length) throw new Error("empty message");
    this.ws.send(JSON.stringify(payload));
    return payload;
  }
}
