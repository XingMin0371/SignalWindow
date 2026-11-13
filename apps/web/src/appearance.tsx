import { useEffect, useRef, useState } from "react";
import { safeGet, safeSet } from "./storage";

export type Theme = "default" | "glass" | "transparent";
export type BackgroundKind = "image" | "video";
export type BackgroundFit = "cover" | "contain" | "custom";

export type StoredBackground = {
  kind: BackgroundKind;
  mime: string;
  name: string;
  blob: Blob;
};

const THEME_KEY = "signal_theme";
const DYNAMIC_KEY = "signal_background_dynamic";
const FIT_KEY = "signal_background_fit";
const CHAT_ASPECT_KEY = "signal_chat_aspect";
const DB_NAME = "signal_window_appearance";
const STORE_NAME = "background";
const RECORD_KEY = "chat";

export function getStoredTheme(): Theme {
  const value = safeGet(THEME_KEY);
  return value === "glass" || value === "transparent" ? value : "default";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove("theme-default", "theme-glass", "theme-transparent");
  root.classList.add(`theme-${theme}`);
}

export function setTheme(theme: Theme): void {
  safeSet(THEME_KEY, theme);
  applyTheme(theme);
}

export function getDynamicBackground(): boolean {
  return safeGet(DYNAMIC_KEY) === "1";
}

export function setDynamicBackground(value: boolean): void {
  safeSet(DYNAMIC_KEY, value ? "1" : "0");
  window.dispatchEvent(new Event("signal-appearance"));
}

export function getBackgroundFit(): BackgroundFit {
  const value = safeGet(FIT_KEY);
  return value === "contain" || value === "custom" ? value : "cover";
}

export function rememberChatAspect(width: number, height: number): void {
  if (width > 0 && height > 0) safeSet(CHAT_ASPECT_KEY, (width / height).toFixed(4));
}

export function getChatAspect(): number {
  const value = Number(safeGet(CHAT_ASPECT_KEY));
  return Number.isFinite(value) && value >= 0.5 && value <= 3 ? value : 16 / 9;
}

export function setBackgroundFit(value: BackgroundFit): void {
  safeSet(FIT_KEY, value);
  window.dispatchEvent(new Event("signal-appearance"));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStoredBackground(): Promise<StoredBackground | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as StoredBackground) || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function saveStoredBackground(value: StoredBackground): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("signal-appearance"));
}

export async function removeStoredBackground(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("signal-appearance"));
}

/** Downscale/compress a still image before storing it locally. */
export async function compressBackgroundImage(file: File): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片无法读取"));
      element.src = sourceUrl;
    });
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片压缩");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78));
    return blob || new Blob([await file.arrayBuffer()], { type: file.type || "image/jpeg" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Validate a short, muted, low-resolution video before local storage. */
export async function validateBackgroundVideo(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) throw new Error("动态背景不能超过 8 MB");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("视频无法读取"));
    });
    if (video.duration > 8) throw new Error("动态背景建议不超过 8 秒");
    if (video.videoWidth > 1280 || video.videoHeight > 720) {
      throw new Error("动态背景最大 1280×720");
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Shared crop geometry for both preview and saved output. */
function cropGeometry(image: HTMLImageElement, aspect: number, targetWidth: number, zoom: number, x: number, y: number) {
  const targetHeight = Math.max(1, Math.round(targetWidth / Math.max(0.5, aspect)));
  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight) * Math.max(1, zoom);
  const cropWidth = Math.min(image.naturalWidth, targetWidth / scale);
  const cropHeight = Math.min(image.naturalHeight, targetHeight / scale);
  const maxX = Math.max(0, image.naturalWidth - cropWidth);
  const maxY = Math.max(0, image.naturalHeight - cropHeight);
  return {
    targetHeight,
    cropWidth,
    cropHeight,
    sourceX: Math.min(maxX, Math.max(0, maxX / 2 + x * maxX / 2)),
    sourceY: Math.min(maxY, Math.max(0, maxY / 2 + y * maxY / 2)),
  };
}

const cropImages = new Map<string, HTMLImageElement>();

async function cropImage(sourceUrl: string): Promise<HTMLImageElement> {
  const cached = cropImages.get(sourceUrl);
  if (cached) return cached;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片无法读取"));
    element.src = sourceUrl;
  });
  cropImages.set(sourceUrl, image);
  return image;
}

/** Exact preview used by the crop editor; the saved output uses the same geometry. */
export async function drawCropPreview(
  canvas: HTMLCanvasElement,
  sourceUrl: string,
  aspect: number,
  zoom: number,
  x: number,
  y: number,
): Promise<void> {
  const image = await cropImage(sourceUrl);
  const width = 640;
  const geometry = cropGeometry(image, aspect, width, zoom, x, y);
  canvas.width = width;
  canvas.height = geometry.targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片裁切");
  context.clearRect(0, 0, width, geometry.targetHeight);
  context.drawImage(
    image,
    geometry.sourceX,
    geometry.sourceY,
    geometry.cropWidth,
    geometry.cropHeight,
    0,
    0,
    width,
    geometry.targetHeight,
  );
}

/** One canvas crop, only when the user saves a custom crop. */
export async function cropBackgroundBlob(
  sourceUrl: string,
  aspect: number,
  zoom: number,
  x: number,
  y: number,
): Promise<Blob> {
  const image = await cropImage(sourceUrl);
  const targetWidth = 1280;
  const geometry = cropGeometry(image, aspect, targetWidth, zoom, x, y);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = geometry.targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片裁切");
  context.drawImage(
    image,
    geometry.sourceX,
    geometry.sourceY,
    geometry.cropWidth,
    geometry.cropHeight,
    0,
    0,
    targetWidth,
    geometry.targetHeight,
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (blob) return blob;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
  if (jpeg) return jpeg;
  throw new Error("图片裁切失败");
}

/**
 * One fixed background layer. It never uses backdrop-filter, CSS fixed
 * backgrounds, canvas, WebGL, or scroll-linked effects.
 */
export function BackgroundSurface() {
  const [background, setBackground] = useState<StoredBackground | null>(null);
  const [url, setUrl] = useState("");
  const [dynamic, setDynamic] = useState(getDynamicBackground);
  const [fit, setFit] = useState<BackgroundFit>(getBackgroundFit);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    const refresh = async () => {
      const value = await loadStoredBackground();
      if (!alive) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = value ? URL.createObjectURL(value.blob) : "";
      setBackground(value);
      setUrl(objectUrl);
      setDynamic(getDynamicBackground());
      setFit(getBackgroundFit());
    };
    void refresh();
    const onChange = () => { void refresh(); };
    const onVisibility = () => {
      const element = videoRef.current;
      if (!element) return;
      if (document.visibilityState === "visible" && getDynamicBackground()) {
        void element.play().catch(() => {});
      } else {
        element.pause();
      }
    };
    window.addEventListener("signal-appearance", onChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.removeEventListener("signal-appearance", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("has-image-background", background?.kind === "image");
    root.classList.toggle("has-video-background", background?.kind === "video");
    return () => {
      root.classList.remove("has-image-background", "has-video-background");
    };
  }, [background?.kind]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (dynamic && document.visibilityState === "visible") {
      void element.play().catch(() => {});
    } else {
      element.pause();
    }
  }, [dynamic, url]);

  if (!background || !url) return null;
  return (
    <div className={`chat-background background-fit-${fit}`} aria-hidden="true">
      {background.kind === "image" ? (
        <img src={url} alt="" decoding="async" />
      ) : (
        <video
          ref={videoRef}
          src={url}
          muted
          loop
          playsInline
          preload="metadata"
          autoPlay={dynamic}
        />
      )}
    </div>
  );
}
