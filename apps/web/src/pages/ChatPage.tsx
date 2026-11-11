import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Empty, Image, Input, Select, Space, Tag, Typography } from "antd";
import { FileAddOutlined, PictureOutlined, SendOutlined } from "@ant-design/icons";
import type { Message, MessagePart, Profile } from "../types";

type Conversation = "private" | "group";
type Target = { key: string; conversation: Conversation; targetId: string; label: string };

function targetsFor(profile: Profile | undefined): Target[] {
  if (!profile) return [];
  return [
    ...(profile.privateUserIds || []).map((targetId) => ({ key: `private:${targetId}`, conversation: "private" as const, targetId, label: `私聊 · ${targetId}` })),
    ...(profile.groupIds || []).map((targetId) => ({ key: `group:${targetId}`, conversation: "group" as const, targetId, label: `群聊 · ${targetId}` })),
  ];
}

export default function ChatPage({ profiles }: { profiles: Profile[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [targetKey, setTargetKey] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState<{ name: string; mime: string; size: number; url: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem("signal_enter_send") !== "0");
  const [connected, setConnected] = useState(false);
  const [onebots, setOnebots] = useState<Record<string, boolean>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  const targets = useMemo(() => targetsFor(profiles.find((profile) => profile.id === profileId)), [profiles, profileId]);
  useEffect(() => {
    if (!targets.some((target) => target.key === targetKey)) setTargetKey(targets[0]?.key || "");
  }, [targets, targetKey]);
  const target = targets.find((item) => item.key === targetKey) || targets[0];

  useEffect(() => {
    const updateSetting = () => setEnterToSend(localStorage.getItem("signal_enter_send") !== "0");
    window.addEventListener("storage", updateSetting);
    window.addEventListener("signal-enter-send", updateSetting);
    return () => {
      window.removeEventListener("storage", updateSetting);
      window.removeEventListener("signal-enter-send", updateSetting);
    };
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`, ["signal-window"]);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "hello") {
        setConnected(true);
        setOnebots(payload.onebots || {});
      }
      if (payload.type === "status") {
        setOnebots((current) => ({ ...current, [payload.profile]: Boolean(payload.onebot?.connected) }));
      }
      if (payload.type === "history") {
        setMessages((current) => ({
          ...current,
          [historyKey(payload.profile, payload.conversation, payload.targetId)]: payload.messages || [],
        }));
      }
      if (payload.type === "message") {
        const message = payload.message as Message;
        const key = historyKey(message.profile, message.conversation, message.targetId);
        setMessages((current) => ({ ...current, [key]: [...(current[key] || []), message] }));
      }
    };
    return () => ws.close();
  }, []);

  const activeProfile = profiles.find((profile) => profile.id === profileId);
  const key = historyKey(profileId, target?.conversation || "private", target?.targetId || "");
  const visible = messages[key] || [];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length, key]);

  const rendered = useMemo(() => visible.map((message) => (
    <div key={message.id} className={`chat-row ${message.role}`}>
      <div className="chat-bubble">
        {(message.parts?.length ? message.parts : [{ type: "text" as const, text: message.text }]).map((part, index) => (
          <Part key={index} part={part} />
        ))}
      </div>
      <Typography.Text type="secondary" className="chat-time">
        {message.role === "user" ? "我" : "AstrBot"} · {new Date(message.time).toLocaleTimeString("zh-CN")}
      </Typography.Text>
    </div>
  )), [visible]);

  function send() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !target) return;
    const parts: MessagePart[] = [];
    if (text.trim()) parts.push({ type: "text", text: text.trim() });
    if (image) parts.push({ type: "image", url: image, alt: "图片" });
    if (file) parts.push({ type: "file", url: file.url, name: file.name, mime: file.mime, size: file.size });
    if (!parts.length) return;
    ws.send(JSON.stringify({
      type: "send",
      profile: profileId,
      conversation: target.conversation,
      targetId: target.targetId,
      parts,
    }));
    setText("");
    setImage("");
    setFile(null);
    setFileError("");
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
      <div className="chat-toolbar">
        <Space wrap>
          <Select value={profileId} onChange={setProfileId} options={profileOptions} style={{ minWidth: 150 }} />
          <Select value={targetKey} onChange={setTargetKey} options={targetOptions} style={{ minWidth: 190 }} />
          <Badge status={connected ? "success" : "error"} text={connected ? "网关已连接" : "网关断开"} />
          <Tag color={onebots[profileId] ? "green" : "red"}>{onebots[profileId] ? "OneBot 在线" : "OneBot 离线"}</Tag>
        </Space>
        <Typography.Text type="secondary">
          {activeProfile ? `Bot ${activeProfile.selfId} · ${target ? target.label : ""}` : ""}
        </Typography.Text>
      </div>

      <div className="chat-log">
        {rendered.length ? rendered : <Empty description="这个会话还没有消息" />}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        <label className="picture-button">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 2_000_000) return;
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result || ""));
              reader.readAsDataURL(file);
            }}
          />
          <PictureOutlined />
        </label>
        <label className="picture-button" title="发送文件">
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
        <Button type="primary" icon={<SendOutlined />} onClick={send}>发送</Button>
      </div>
      {image && <div className="pending-image"><Image src={image} width={80} /><Button size="small" onClick={() => setImage("")}>移除</Button></div>}
      {file && <div className="pending-image"><FileAddOutlined /> {file.name} <Typography.Text type="secondary">{(file.size / 1024).toFixed(0)} KB</Typography.Text><Button size="small" onClick={() => setFile(null)}>移除</Button></div>}
      {fileError && <Typography.Text type="danger" style={{ padding: "0 14px 8px" }}>{fileError}</Typography.Text>}
    </div>
  );
}

function historyKey(profile: string, conversation: Conversation, targetId: string): string {
  return `${profile}:${conversation}:${targetId}`;
}

function Part({ part }: { part: MessagePart }) {
  if (part.type === "image" && part.url) return <Image src={part.url} alt={part.alt || "图片"} width={240} />;
  if (part.type === "file" && part.url) {
    return <a className="file-part" href={part.url} download={part.name || "文件"} target="_blank" rel="noreferrer"><FileAddOutlined /> {part.name || "文件"}</a>;
  }
  if (part.type === "audio" && part.url) return <audio controls src={part.url} />;
  if (part.type === "video" && part.url) return <video controls src={part.url} style={{ maxWidth: "100%", borderRadius: 10 }} />;
  if (part.type === "face") return <span>[{part.name || "表情"}]</span>;
  if (part.type === "mention") return <span>@{part.userId}</span>;
  return <span style={{ whiteSpace: "pre-wrap" }}>{part.text || ""}</span>;
}
