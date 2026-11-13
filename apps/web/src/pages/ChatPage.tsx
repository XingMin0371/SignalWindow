import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Empty, Image, Input, Select, Space, Spin, Tag, Typography } from "antd";
import { FileAddOutlined, PictureOutlined, SendOutlined } from "@ant-design/icons";
import type { Message, MessagePart, Profile } from "../types";
import { safeGet, safeSet } from "../storage";
import { BackgroundSurface, rememberChatAspect } from "../appearance";
import { SqrtHeightIndex } from "../heightIndex";

type Conversation = "private" | "group";
type Target = { key: string; conversation: Conversation; targetId: string; label: string };
type Pending = {
  clientId: string;
  payload: Record<string, unknown>;
  text: string;
  image: string;
  file: { name: string; mime: string; size: number; url: string } | null;
};

const PAGE_SIZE = 30;
const ROW_HEIGHT = 88;
const OVERSCAN = 6;
const AUTO_LOAD_THRESHOLD = 96;
const timeFormatCache = new Map<string, string>();

function targetsFor(profile: Profile | undefined): Target[] {
  if (!profile) return [];
  return [
    ...(profile.privateUserIds || []).map((targetId) => ({ key: `private:${targetId}`, conversation: "private" as const, targetId, label: `私聊 · ${targetId}` })),
    ...(profile.groupIds || []).map((targetId) => ({ key: `group:${targetId}`, conversation: "group" as const, targetId, label: `群聊 · ${targetId}` })),
  ];
}

function historyKey(profile: string, conversation: Conversation, targetId: string): string {
  return `${profile}:${conversation}:${targetId}`;
}

function formatTime(value: string): string {
  const cached = timeFormatCache.get(value);
  if (cached) return cached;
  const formatted = new Date(value).toLocaleTimeString("zh-CN");
  if (timeFormatCache.size > 1000) timeFormatCache.clear();
  timeFormatCache.set(value, formatted);
  return formatted;
}

function makeClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChatPage({ profiles }: { profiles: Profile[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [targetKey, setTargetKey] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState<{ name: string; mime: string; size: number; url: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [enterToSend, setEnterToSend] = useState(() => safeGet("signal_enter_send") !== "0");
  const [connected, setConnected] = useState(false);
  const [onebots, setOnebots] = useState<Record<string, boolean>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const heightsRef = useRef(new Map<string, number>());
  const [measureVersion, setMeasureVersion] = useState(0);
  const loadingOlderRef = useRef(false);
  const heightIndexRef = useRef(new SqrtHeightIndex());
  const indexedKeyRef = useRef("");
  const indexedIdsRef = useRef<string[]>([]);
  const autoLoadTimerRef = useRef(0);
  const autoLoadBlockedUntilRef = useRef(0);
  const prependAnchorRef = useRef<{ id: string; top: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const historySeq = useRef(0);
  const prependHeightRef = useRef(0);
  const atBottomRef = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(0);
  const incomingRef = useRef<Message[]>([]);
  const incomingRafRef = useRef(0);
  const activeRef = useRef<{ profileId: string; target: Target | undefined }>({ profileId: "", target: undefined });
  const draftKeyRef = useRef("");

  useEffect(() => () => {
    if (autoLoadTimerRef.current) window.clearTimeout(autoLoadTimerRef.current);
  }, []);

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  const targets = useMemo(() => targetsFor(profiles.find((profile) => profile.id === profileId)), [profiles, profileId]);
  useEffect(() => {
    if (!targets.some((target) => target.key === targetKey)) setTargetKey(targets[0]?.key || "");
  }, [targets, targetKey]);
  const target = targets.find((item) => item.key === targetKey) || targets[0];

  useEffect(() => {
    activeRef.current = { profileId, target };
  }, [profileId, target]);

  const draftKey = target ? `signal_draft:${profileId}:${target.conversation}:${target.targetId}` : "";
  useEffect(() => {
    if (!draftKey) return;
    if (draftKeyRef.current !== draftKey) {
      draftKeyRef.current = draftKey;
      setText(safeGet(draftKey) || "");
      return;
    }
    safeSet(draftKey, text);
  }, [draftKey, text]);

  useEffect(() => {
    const updateSetting = () => setEnterToSend(safeGet("signal_enter_send") !== "0");
    window.addEventListener("storage", updateSetting);
    window.addEventListener("signal-enter-send", updateSetting);
    return () => {
      window.removeEventListener("storage", updateSetting);
      window.removeEventListener("signal-enter-send", updateSetting);
    };
  }, []);

  // A single reconnecting socket. Pending sends survive a reconnect and are
  // transmitted once the socket is open again.
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`, ["signal-window"]);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        const pending = pendingRef.current;
        if (pending) ws.send(JSON.stringify(pending.payload));
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        const delay = Math.min(30000, 1000 * 2 ** attempt++);
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onmessage = (event) => {
        let payload: any;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (payload.type === "hello") {
          setConnected(true);
          setOnebots(payload.onebots || {});
        }
        if (payload.type === "status") {
          setOnebots((current) => ({ ...current, [payload.profile]: Boolean(payload.onebot?.connected) }));
        }
        if (payload.type === "history") {
          if (payload.requestId && payload.requestId !== String(historySeq.current)) return;
          const key = historyKey(payload.profile, payload.conversation, payload.targetId);
          setMessages((current) => {
            if (!payload.prepend) return { ...current, [key]: payload.messages || [] };
            const existing = current[key] || [];
            const existingIds = new Set(existing.map((item) => item.id));
            const older = (payload.messages || []).filter((item: Message) => !existingIds.has(item.id));
            return { ...current, [key]: [...older, ...existing] };
          });
          setHistoryLoading(false);
          loadingOlderRef.current = false;
          autoLoadBlockedUntilRef.current = Date.now() + 200;
          setLoadingOlder(false);
          setHasMore(Boolean(payload.hasMore));
        }
        if (payload.type === "message") {
          incomingRef.current.push(payload.message as Message);
          if (!incomingRafRef.current) {
            incomingRafRef.current = requestAnimationFrame(() => {
              incomingRafRef.current = 0;
              const batch = incomingRef.current.splice(0);
              setMessages((current) => {
                const next = { ...current };
                const additions = new Map<string, Message[]>();
                for (const item of batch) {
                  const key = historyKey(item.profile, item.conversation, item.targetId);
                  const list = additions.get(key) || [];
                  list.push(item);
                  additions.set(key, list);
                }
                for (const [key, list] of additions) next[key] = [...(next[key] || []), ...list];
                return next;
              });
            });
          }
        }
        if (payload.type === "gap") {
          const active = activeRef.current;
          const socket = wsRef.current;
          setSendError("实时连接落后，正在重新同步");
          if (active.target && socket?.readyState === WebSocket.OPEN) {
            setHistoryLoading(true);
            setHasMore(true);
            socket.send(JSON.stringify({
              type: "history",
              profile: active.profileId,
              conversation: active.target.conversation,
              targetId: active.target.targetId,
              limit: PAGE_SIZE,
              requestId: String(++historySeq.current),
            }));
          }
          return;
        }
        if (payload.type === "ack") {
          const pending = pendingRef.current;
          if (!pending || payload.clientId !== pending.clientId) return;
          pendingRef.current = null;
          setSending(false);
          setSendError("");
          setText((current) => (current === pending.text ? "" : current));
          setImage((current) => (current === pending.image ? "" : current));
          setFile((current) => (current === pending.file ? null : current));
          setFileError("");
        }
        if (payload.type === "error") {
          const pending = pendingRef.current;
          if (!pending || !payload.clientId || payload.clientId === pending.clientId) {
            pendingRef.current = null;
            setSending(false);
            setSendError(String(payload.detail || "发送失败"));
          }
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (incomingRafRef.current) cancelAnimationFrame(incomingRafRef.current);
      wsRef.current?.close();
    };
  }, []);

  // Only the selected conversation is requested. This avoids downloading
  // every private/group history when a browser connects.
  useEffect(() => {
    if (!connected || !target) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const requestId = String(++historySeq.current);
    setHistoryLoading(true);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHasMore(false);
    prependHeightRef.current = 0;
    atBottomRef.current = true;
    ws.send(JSON.stringify({
      type: "history",
      profile: profileId,
      conversation: target.conversation,
      targetId: target.targetId,
      limit: PAGE_SIZE,
      requestId,
    }));
  }, [connected, profileId, target?.conversation, target?.targetId]);

  const activeProfile = profiles.find((profile) => profile.id === profileId);
  const key = historyKey(profileId, target?.conversation || "private", target?.targetId || "");
  const visible = messages[key] || [];

  useEffect(() => {
    const element = logRef.current;
    if (!element) return;
    const syncViewport = () => {
      setViewportHeight(element.clientHeight);
      const page = element.parentElement;
      if (page) rememberChatAspect(page.clientWidth, page.clientHeight);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useLayoutEffect(() => {
    const element = logRef.current;
    if (!element) return;
    const anchor = prependAnchorRef.current;
    if (anchor) {
      const logTop = element.getBoundingClientRect().top;
      const row = [...element.querySelectorAll<HTMLElement>("[data-message-id]")]
        .find((item) => item.dataset.messageId === anchor.id);
      if (row) {
        const delta = row.getBoundingClientRect().top - logTop - anchor.top;
        element.scrollTop += delta;
        prependAnchorRef.current = null;
        prependHeightRef.current = 0;
        setScrollTop(element.scrollTop);
        return;
      }
    }
    if (prependHeightRef.current) {
      const delta = element.scrollHeight - prependHeightRef.current;
      element.scrollTop += delta;
      prependHeightRef.current = 0;
      prependAnchorRef.current = null;
      setScrollTop(element.scrollTop);
      return;
    }
    if (atBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      setScrollTop(element.scrollTop);
    }
  }, [visible.length, key, measureVersion]);

  // Incremental sqrt index: append/prepend/update do not rebuild the whole
  // visible array; block metadata is the only O(blocks) part.
  const heightIndex = useMemo(() => {
    const index = heightIndexRef.current;
    const ids = visible.map((message) => message.id);
    const known = indexedIdsRef.current;
    if (indexedKeyRef.current !== key || ids.length < known.length) {
      index.reset();
      for (const message of visible) index.append(message.id, heightsRef.current.get(message.id) || ROW_HEIGHT);
    } else if (ids.length > known.length) {
      const prefixSame = known.every((id, position) => ids[position] === id);
      const suffixSame = known.every((id, position) => ids[position + ids.length - known.length] === id);
      if (prefixSame) {
        for (let position = known.length; position < visible.length; position += 1) {
          index.append(visible[position].id, heightsRef.current.get(visible[position].id) || ROW_HEIGHT);
        }
      } else if (suffixSame) {
        index.prepend(visible.slice(0, ids.length - known.length).map((message) => ({
          id: message.id,
          height: heightsRef.current.get(message.id) || ROW_HEIGHT,
        })));
      } else {
        index.reset();
        for (const message of visible) index.append(message.id, heightsRef.current.get(message.id) || ROW_HEIGHT);
      }
    }
    indexedKeyRef.current = key;
    indexedIdsRef.current = ids;
    return index;
  }, [visible, key]);
  const totalHeight = heightIndex.total;
  const start = Math.max(0, heightIndex.locate(scrollTop) - OVERSCAN);
  const end = Math.min(heightIndex.size, heightIndex.locate(scrollTop + viewportHeight) + OVERSCAN);
  const shown = heightIndex.slice(start, end);

  const measureRow = useCallback((id: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    height = Math.min(100000, height);
    heightsRef.current.set(id, height);
    if (heightIndex.update(id, height)) setMeasureVersion((value) => value + 1);
  }, [heightIndex]);

  function onLogScroll() {
    const element = logRef.current;
    if (!element || scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setScrollTop(element.scrollTop);
      setViewportHeight(element.clientHeight);
      if (autoLoadTimerRef.current) window.clearTimeout(autoLoadTimerRef.current);
      if (
        element.scrollTop < AUTO_LOAD_THRESHOLD &&
        hasMore && !loadingOlder && !historyLoading &&
        Date.now() >= autoLoadBlockedUntilRef.current
      ) {
        autoLoadTimerRef.current = window.setTimeout(() => {
          if (logRef.current && logRef.current.scrollTop < AUTO_LOAD_THRESHOLD) loadOlder();
        }, 80);
      }
    });
  }

  function loadOlder() {
    const ws = wsRef.current;
    if (!target || !visible.length || loadingOlder || loadingOlderRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const log = logRef.current;
    const logTop = log?.getBoundingClientRect().top || 0;
    const firstVisible = log
      ? [...log.querySelectorAll<HTMLElement>("[data-message-id]")]
          .find((item) => item.getBoundingClientRect().bottom > logTop + 1)
      : undefined;
    prependAnchorRef.current = firstVisible
      ? { id: firstVisible.dataset.messageId || "", top: firstVisible.getBoundingClientRect().top - logTop }
      : null;
    prependHeightRef.current = log?.scrollHeight || 0;
    ws.send(JSON.stringify({
      type: "history",
      profile: profileId,
      conversation: target.conversation,
      targetId: target.targetId,
      beforeId: visible[0].id,
      limit: PAGE_SIZE,
      requestId: String(++historySeq.current),
    }));
  }

  function send() {
    if (pendingRef.current || sending || !target) return;
    const parts: MessagePart[] = [];
    if (text.trim()) parts.push({ type: "text", text: text.trim() });
    if (image) parts.push({ type: "image", url: image, alt: "图片" });
    if (file) parts.push({ type: "file", url: file.url, name: file.name, mime: file.mime, size: file.size });
    if (!parts.length) return;
    const clientId = makeClientId();
    const payload = {
      type: "send",
      clientId,
      profile: profileId,
      conversation: target.conversation,
      targetId: target.targetId,
      parts,
    };
    const pending: Pending = { clientId, payload, text, image, file };
    pendingRef.current = pending;
    setSending(true);
    setSendError("");
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setSendError("等待网关重连后自动发送");
      return;
    }
    ws.send(JSON.stringify(payload));
  }

  if (!profiles.length) return <Empty description="尚未配置 AstrBot，请先到「AstrBot 实例」添加" />;
  if (!targets.length) return <Empty description="该实例还没有私聊或群聊对象，请编辑实例配置" />;

  const profileOptions = profiles.map((profile) => ({ value: profile.id, label: profile.label }));
  const targetOptions = [
    { label: "私聊", options: targets.filter((item) => item.conversation === "private").map((item) => ({ value: item.key, label: item.label })) },
    { label: "群聊", options: targets.filter((item) => item.conversation === "group").map((item) => ({ value: item.key, label: item.label })) },
  ].filter((group) => group.options.length);

  return (
    <div className="chat-page">
      <BackgroundSurface />
      <div className="chat-toolbar">
        <Space wrap>
          <Select value={profileId} onChange={setProfileId} options={profileOptions} style={{ minWidth: 150 }} />
          <Select value={targetKey} onChange={setTargetKey} options={targetOptions} style={{ minWidth: 190 }} />
          <Badge status={connected ? "success" : "error"} text={connected ? "网关已连接" : "网关断开"} />
          <Tag color={onebots[profileId] ? "green" : "red"}>{onebots[profileId] ? "OneBot 在线" : "OneBot 离线"}</Tag>
          <Button size="small" disabled={!hasMore || loadingOlder || historyLoading} onClick={loadOlder}>
            {loadingOlder ? "加载中…" : "加载更早"}
          </Button>
        </Space>
        <Typography.Text type="secondary">
          {activeProfile ? `Bot ${activeProfile.selfId} · ${target ? target.label : ""}` : ""}
        </Typography.Text>
      </div>

      <div className="chat-log" ref={logRef} onScroll={onLogScroll}>
        {historyLoading ? (
          <div className="route-loading"><Spin size="small" /> 加载会话…</div>
        ) : visible.length ? (
          <div style={{ position: "relative", height: totalHeight }}>
            {shown.map((item, index) => (
              <MeasuredRow
                key={item.id}
                message={visible[start + index]}
                top={item.top}
                onHeight={measureRow}
              />
            ))}
          </div>
        ) : (
          <Empty description="这个会话还没有消息" />
        )}
      </div>

      <div className="chat-composer">
        <label className="picture-button" aria-label="上传图片">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) return;
              if (!selected.type.startsWith("image/")) {
                setSendError("请选择图片文件");
                event.target.value = "";
                return;
              }
              if (selected.size > 2_000_000) {
                setSendError("图片超过 2 MB");
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => { setImage(String(reader.result || "")); setSendError(""); };
              reader.readAsDataURL(selected);
            }}
          />
          <PictureOutlined />
        </label>
        <label className="picture-button" aria-label="上传文件" title="发送文件">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.log,.xml,.yaml,.yml"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) return;
              if (selected.size > 5_000_000) {
                setFileError("文件超过 5 MB");
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setFile({ name: selected.name, mime: selected.type || "application/octet-stream", size: selected.size, url: String(reader.result || "") });
                setFileError("");
              };
              reader.readAsDataURL(selected);
            }}
          />
          <FileAddOutlined />
        </label>
        <Input.TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder={`发送到 ${target?.label || ""}`}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (!event.shiftKey && enterToSend) {
              event.preventDefault();
              send();
              return;
            }
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={send}>发送</Button>
      </div>
      {sendError && <Typography.Text type="danger" style={{ padding: "0 14px 8px" }}>{sendError}</Typography.Text>}
      {image && <div className="pending-image"><Image src={image} width={80} /><Button size="small" onClick={() => setImage("")}>移除</Button></div>}
      {file && <div className="pending-image"><FileAddOutlined /> {file.name} <Typography.Text type="secondary">{(file.size / 1024).toFixed(0)} KB</Typography.Text><Button size="small" onClick={() => setFile(null)}>移除</Button></div>}
      {fileError && <Typography.Text type="danger" style={{ padding: "0 14px 8px" }}>{fileError}</Typography.Text>}
    </div>
  );
}

const MeasuredRow = memo(function MeasuredRow({
  message,
  top,
  onHeight,
}: {
  message: Message;
  top: number;
  onHeight: (id: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => onHeight(message.id, element.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") {
      // Old browsers have no ResizeObserver. Measure again when media loads.
      element.addEventListener("load", measure, true);
      element.addEventListener("loadedmetadata", measure, true);
      const timer = window.setTimeout(measure, 80);
      return () => {
        window.clearTimeout(timer);
        element.removeEventListener("load", measure, true);
        element.removeEventListener("loadedmetadata", measure, true);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [message.id, onHeight]);
  return (
    <div ref={ref} data-message-id={message.id} style={{ position: "absolute", top, left: 0, right: 0 }}>
      <MessageRow message={message} />
    </div>
  );
});

const MessageRow = memo(function MessageRow({ message }: { message: Message }) {
  const parts = message.parts?.length ? message.parts : [{ type: "text" as const, text: message.text }];
  return (
    <div className={`chat-row ${message.role}`}>
      <div className="chat-bubble">
        {parts.map((part, index) => <Part key={index} part={part} />)}
      </div>
      <Typography.Text type="secondary" className="chat-time">
        {message.role === "user" ? "我" : "AstrBot"} · {formatTime(message.time)}
      </Typography.Text>
    </div>
  );
});

const Part = memo(function Part({ part }: { part: MessagePart }) {
  if (part.type === "image" && part.url) return <Image src={part.url} alt={part.alt || "图片"} width={240} loading="lazy" />;
  if (part.type === "file" && part.url) {
    return <a className="file-part" href={part.url} download={part.name || "文件"} target="_blank" rel="noopener noreferrer"><FileAddOutlined /> {part.name || "文件"}</a>;
  }
  if (part.type === "audio" && part.url) return <audio controls preload="none" src={part.url} />;
  if (part.type === "video" && part.url) return <video controls preload="none" src={part.url} style={{ maxWidth: "100%", borderRadius: 10 }} />;
  if (part.type === "face") return <span>[{part.name || "表情"}]</span>;
  if (part.type === "mention") return <span>@{part.userId}</span>;
  return <span style={{ whiteSpace: "pre-wrap" }}>{part.text || ""}</span>;
});
