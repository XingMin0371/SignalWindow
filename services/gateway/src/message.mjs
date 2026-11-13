const MAX_INLINE_URL = 3_000_000;

function textPart(text) {
  return { type: "text", text: String(text ?? "") };
}

export function safeUrl(url, kind) {
  const value = String(url || "").trim();
  if (!value || value.length > 7_000_000) return "";
  if (/^javascript:|^vbscript:|^data:text\/html|^data:image\/svg/i.test(value)) return "";
  if (/^https?:\/\//i.test(value)) {
    const allowedHosts = String(process.env.MEDIA_HOST_ALLOWLIST || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!allowedHosts.length) return value;
    try { return allowedHosts.includes(new URL(value).hostname.toLowerCase()) ? value : ""; } catch { return ""; }
  }
  if (kind === "image" && /^data:image\/(?:png|jpe?g|gif|webp|bmp)[;,]|^\/api\/media\/[a-f0-9]{40}\.[a-z0-9]{1,8}$/i.test(value)) return value;
  if (kind === "file" && /^data:(?:application\/(?:pdf|json|zip|octet-stream)|audio\/|video\/|font\/|image\/(?!svg)|text\/(?:plain|csv))|^\/api\/media\/[a-f0-9]{40}\.[a-z0-9]{1,8}$/i.test(value)) return value;
  if ((kind === "audio" || kind === "video") && /^data:(?:audio|video)\//i.test(value)) return value;
  return "";
}

export function normalizeMessage(message) {
  if (typeof message === "string") {
    return message ? [textPart(message)] : [];
  }
  if (!Array.isArray(message)) return [];
  const parts = [];
  for (const raw of message) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.type === "text" || raw.type === "plain") {
      const text = String(raw.text ?? raw.data?.text ?? "").slice(0, 10000);
      if (text) parts.push(textPart(text));
      continue;
    }
    if (raw.type === "image" || raw.type === "mface") {
      const data = raw.data && typeof raw.data === "object" ? raw.data : {};
      let url = String(data.url ?? data.file ?? raw.url ?? "");
      if (url.startsWith("base64://")) url = `data:image/png;base64,${url.slice(9)}`;
      url = safeUrl(url, "image");
      if (url) parts.push({ type: "image", url, alt: String(data.summary ?? "图片").slice(0, 100) });
      else if (raw.type === "mface") parts.push({ type: "face", name: String(data.summary ?? "表情").slice(0, 50) });
      continue;
    }
    if (raw.type === "record" || raw.type === "audio") {
      const data = raw.data && typeof raw.data === "object" ? raw.data : {};
      let url = String(data.url ?? data.file ?? raw.url ?? "");
      if (url.startsWith("base64://")) url = `data:audio/mpeg;base64,${url.slice(9)}`;
      url = safeUrl(url, "audio");
      if (url) parts.push({ type: "audio", url, name: String(data.name ?? "语音").slice(0, 100) });
      continue;
    }
    if (raw.type === "video") {
      const data = raw.data && typeof raw.data === "object" ? raw.data : {};
      let url = String(data.url ?? data.file ?? raw.url ?? "");
      if (url.startsWith("base64://")) url = `data:video/mp4;base64,${url.slice(9)}`;
      url = safeUrl(url, "video");
      if (url) parts.push({ type: "video", url, name: String(data.name ?? "视频").slice(0, 100) });
      continue;
    }
    if (raw.type === "file") {
      const data = raw.data && typeof raw.data === "object" ? raw.data : {};
      const url = String(data.url ?? data.file ?? raw.url ?? "");
      const name = String(data.name ?? raw.name ?? "文件").slice(0, 120);
      const safe = safeUrl(url, "file");
      if (safe) parts.push({ type: "file", url: safe, name, mime: String(data.mime ?? "").slice(0, 100) });
      continue;
    }
    if (raw.type === "face") {
      parts.push({ type: "face", name: String(raw.data?.name ?? raw.data?.summary ?? "表情") });
      continue;
    }
    if (raw.type === "at" && (raw.data?.qq || raw.qq)) {
      parts.push({ type: "mention", userId: String(raw.data?.qq ?? raw.qq) });
    }
  }
  return parts.slice(0, 20);
}

export function partsToText(parts) {
  return (parts || [])
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "image") return "[图片]";
      if (part.type === "file") return `[文件: ${part.name || "文件"}]`;
      if (part.type === "audio") return "[语音]";
      if (part.type === "video") return "[视频]";
      if (part.type === "face") return "[表情]";
      if (part.type === "mention") return `@${part.userId}`;
      return "";
    })
    .join("");
}

export function toOneBotMessage(parts) {
  const out = [];
  for (const part of parts || []) {
    if (part.type === "text" && part.text) {
      out.push({ type: "text", data: { text: part.text } });
    } else if (part.type === "image" && part.url) {
      out.push({ type: "image", data: { file: part.url, url: part.url } });
    } else if (part.type === "file" && part.url) {
      out.push({ type: "file", data: { file: part.url, url: part.url, name: part.name || "文件" } });
    } else if (part.type === "face") {
      out.push({ type: "face", data: { name: part.name || "表情" } });
    } else if (part.type === "audio" && part.url) {
      out.push({ type: "record", data: { file: part.url } });
    } else if (part.type === "video" && part.url) {
      out.push({ type: "video", data: { file: part.url } });
    } else if (part.type === "mention" && part.userId) {
      out.push({ type: "at", data: { qq: part.userId } });
    }
  }
  return out;
}

export function sanitizeParts(parts) {
  const out = [];
  for (const part of parts || []) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text") {
      const text = String(part.text ?? "").slice(0, 10000);
      if (text) out.push(textPart(text));
    } else if (part.type === "image") {
      const url = String(part.url ?? "");
      if (url.length <= MAX_INLINE_URL && safeUrl(url, "image")) {
        out.push({ type: "image", url, alt: String(part.alt ?? "图片").slice(0, 100) });
      }
    } else if (part.type === "file") {
      const url = String(part.url ?? "");
      const name = String(part.name ?? "文件").slice(0, 120);
      if (name && safeUrl(url, "file")) {
        out.push({ type: "file", name, url, mime: String(part.mime ?? "").slice(0, 100), size: Number(part.size) || undefined });
      }
    } else if (part.type === "face") {
      out.push({ type: "face", name: String(part.name ?? "表情").slice(0, 50) });
    }
  }
  return out;
}
