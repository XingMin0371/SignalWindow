import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, Modal, Segmented, Slider, Space, Switch, Typography, message } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { Profile } from "../types";
import { api } from "../api";
import { safeGet, safeSet } from "../storage";
import {
  compressBackgroundImage,
  cropBackgroundBlob,
  drawCropPreview,
  getBackgroundFit,
  getChatAspect,
  getDynamicBackground,
  getStoredTheme,
  loadStoredBackground,
  removeStoredBackground,
  saveStoredBackground,
  setBackgroundFit,
  setDynamicBackground,
  setTheme,
  type BackgroundFit,
  validateBackgroundVideo,
  type BackgroundKind,
  type StoredBackground,
  type Theme,
} from "../appearance";

type ImportSession = { targetId: string; label: string; lastAt?: string };

export default function SettingsPage({ profiles }: { profiles: Profile[] }) {
  const [value, setValue] = useState(JSON.stringify({ profiles }, null, 2));
  const [saving, setSaving] = useState(false);
  const [enterToSend, setEnterToSend] = useState(() => safeGet("signal_enter_send") !== "0");
  const [liteMode, setLiteMode] = useState(() => safeGet("signal_lite") === "1");
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [background, setBackground] = useState<StoredBackground | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [dynamicBackground, setDynamicState] = useState(getDynamicBackground);
  const [backgroundFit, setBackgroundFitState] = useState<BackgroundFit>(getBackgroundFit);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropAspect, setCropAspect] = useState(getChatAspect);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    setValue(JSON.stringify({ profiles }, null, 2));
  }, [profiles]);

  useEffect(() => {
    let alive = true;
    let currentUrl = "";
    const refresh = async () => {
      const value = await loadStoredBackground();
      if (!alive) return;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = value ? URL.createObjectURL(value.blob) : "";
      setBackground(value);
      setBackgroundUrl(currentUrl);
      setDynamicState(getDynamicBackground());
      setBackgroundFitState(getBackgroundFit());
    };
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener("signal-appearance", onChange);
    return () => {
      alive = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      window.removeEventListener("signal-appearance", onChange);
    };
  }, []);

  useEffect(() => {
    if (!cropOpen || !backgroundUrl) return;
    let alive = true;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    void drawCropPreview(canvas, backgroundUrl, cropAspect, cropZoom, cropX, cropY)
      .catch((error) => { if (alive) message.error(String(error)); });
    return () => { alive = false; };
  }, [cropOpen, backgroundUrl, cropAspect, cropZoom, cropX, cropY]);

    function tour() {
    const tourDriver = driver({
      showProgress: true,
      nextBtnText: "下一步",
      prevBtnText: "上一步",
      doneBtnText: "完成",
    });
    tourDriver.highlight({
      element: ".app-sider",
      popover: { title: "实例与配置", description: "在这里管理多个 AstrBot 实例和网关配置。" },
    });
    tourDriver.highlight({
      element: ".app-content",
      popover: { title: "高级配置", description: "原始 JSON 可以复制、编辑并保存到网关。" },
    });
    tourDriver.drive();
    safeSet("snowluma_window_tour", "1");
  }

  async function save() {
    setSaving(true);
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed.profiles)) throw new Error("profiles 必须是数组");
      await api.replaceProfiles(parsed.profiles);
      message.success("配置已保存到网关");
    } catch (error) {
      message.error(String(error));
    } finally {
      setSaving(false);
    }
  }

  function changeTheme(value: string | number) {
    const next = value as Theme;
    setThemeState(next);
    setTheme(next);
  }

  async function chooseBackground(file: File | undefined) {
    if (!file) return;
    setBackgroundBusy(true);
    try {
      let kind: BackgroundKind;
      let blob: Blob;
      if (file.type.startsWith("image/")) {
        if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB");
        kind = "image";
        blob = await compressBackgroundImage(file);
      } else if (file.type.startsWith("video/")) {
        kind = "video";
        await validateBackgroundVideo(file);
        blob = file;
      } else {
        throw new Error("只支持图片或视频");
      }
      await saveStoredBackground({ kind, mime: blob.type || file.type, name: file.name, blob });
      if (kind === "video") {
        setBackgroundFitState("cover");
        setBackgroundFit("cover");
      }
      message.success("聊天背景已更新");
    } catch (error) {
      message.error(String(error));
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function clearBackground() {
    await removeStoredBackground();
    setBackground(null);
    setBackgroundUrl("");
    message.success("已恢复默认背景");
  }

  function changeDynamic(value: boolean) {
    setDynamicState(value);
    setDynamicBackground(value);
  }

  function changeBackgroundFit(value: string | number) {
    const next = value as BackgroundFit;
    if (next === "custom") {
      if (!background || background.kind !== "image" || !backgroundUrl) {
        message.info("请先上传一张静态图片背景");
        return;
      }
      setCropAspect(getChatAspect());
      setCropZoom(1);
      setCropX(0);
      setCropY(0);
      setCropOpen(true);
      return;
    }
    setBackgroundFitState(next);
    setBackgroundFit(next);
  }

  async function saveCustomCrop() {
    if (!background || background.kind !== "image" || !backgroundUrl) return;
    setBackgroundBusy(true);
    try {
      const blob = await cropBackgroundBlob(backgroundUrl, cropAspect, cropZoom, cropX, cropY);
      await saveStoredBackground({
        kind: "image",
        mime: blob.type || "image/webp",
        name: background.name,
        blob,
      });
      setBackgroundFitState("custom");
      setBackgroundFit("custom");
      setCropOpen(false);
      message.success("已保存自定义裁切");
    } catch (error) {
      message.error(String(error));
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function loadImportSessions() {
    try {
      const response = await fetch("/api/import/sessions");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setImportSessions(data.sessions || []);
      setSelectedImports([]);
      if (!(data.sessions || []).length) message.info("没有可导入的已配置私聊会话");
    } catch (error) {
      message.error(String(error));
    }
  }

  async function importSelected() {
    if (!selectedImports.length) return;
    setImportBusy(true);
    try {
      const response = await fetch("/api/import/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets: selectedImports }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      message.success(`已导入 ${data.imported} 条私聊消息，刷新页面后查看`);
      setSelectedImports([]);
    } catch (error) {
      message.error(String(error));
    } finally {
      setImportBusy(false);
    }
  }

    function toggleLite(value: boolean) {
    setLiteMode(value);
    safeSet("signal_lite", value ? "1" : "0");
    document.documentElement.classList.toggle("lite", value);
  }

  function toggleEnter(value: boolean) {
    setEnterToSend(value);
    safeSet("signal_enter_send", value ? "1" : "0");
    window.dispatchEvent(new Event("signal-enter-send"));
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title="输入行为">
        <Space size="large" align="start">
          <Switch checked={enterToSend} onChange={toggleEnter} />
          <div>
            <Typography.Text strong>按回车键发送</Typography.Text>
            <div><Typography.Text type="secondary">默认开启。关闭后回车换行，Ctrl+Enter 发送；Shift+Enter 始终换行。</Typography.Text></div>
          </div>
        </Space>
      </Card>

      <Card title="聊天外观">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Typography.Text strong>玻璃 / 透明样式</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Segmented
                value={theme}
                onChange={changeTheme}
                options={[
                  { label: "默认", value: "default" },
                  { label: "玻璃", value: "glass" },
                  { label: "透明", value: "transparent" },
                ]}
              />
            </div>
            <Typography.Text type="secondary">玻璃效果使用半透明 CSS，不使用实时模糊，降低滚动开销。</Typography.Text>
          </div>
          <div>
            <Typography.Text strong>聊天背景</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <label className="picture-button" aria-label="上传聊天背景" title="上传背景">
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm"
                    hidden
                    disabled={backgroundBusy}
                    onChange={(event) => chooseBackground(event.target.files?.[0])}
                  />
                  {backgroundBusy ? "处理中…" : "上传背景"}
                </label>
                {background && <Button size="small" onClick={clearBackground}>恢复默认</Button>}
              </Space>
            </div>
            <Typography.Text type="secondary">图片会在浏览器端压缩；动态背景限制 8 秒、1280×720、8MB。</Typography.Text>
          </div>
          <div>
            <Typography.Text strong>背景适配</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Segmented
                value={backgroundFit}
                onChange={changeBackgroundFit}
                options={[
                  { label: "铺满", value: "cover" },
                  { label: "完整显示", value: "contain" },
                  { label: "自定义裁切", value: "custom" },
                ]}
              />
            </div>
            <Typography.Text type="secondary">横屏长图建议选“完整显示”；“铺满”会裁掉超出部分；自定义裁切按最近聊天窗口比例生成新背景。</Typography.Text>
          </div>
          {backgroundUrl && background && (
            <div className={`background-preview ${backgroundFit !== "cover" ? "preview-contain" : ""}`}>
              {background.kind === "image" ? (
                <img src={backgroundUrl} alt="聊天背景预览" />
              ) : (
                <video src={backgroundUrl} muted loop playsInline autoPlay={dynamicBackground} />
              )}
            </div>
          )}
          {background?.kind === "video" && (
            <Space>
              <Switch checked={dynamicBackground} onChange={changeDynamic} />
              <Typography.Text>动态背景播放</Typography.Text>
              <Typography.Text type="secondary">关闭后只保留视频首帧，切后台自动暂停。</Typography.Text>
            </Space>
          )}
        </Space>
      </Card>

      <Modal
        open={cropOpen}
        title="自定义裁切"
        width={680}
        maskClosable={false}
        keyboard={false}
        onCancel={() => setCropOpen(false)}
        footer={[
          <Button key="reset" onClick={() => { setCropZoom(1); setCropX(0); setCropY(0); }}>重置</Button>,
          <Button key="cancel" onClick={() => setCropOpen(false)}>取消</Button>,
          <Button key="save" type="primary" loading={backgroundBusy} onClick={saveCustomCrop}>保存裁切</Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div className="crop-stage" style={{ aspectRatio: String(cropAspect) }}>
            <canvas ref={cropCanvasRef} className="crop-canvas" aria-label="裁切预览" />
            <span className="crop-guide" />
          </div>
          <Typography.Text type="secondary">按最近聊天窗口比例 {cropAspect.toFixed(2)} 裁切，保存后生成独立图片。</Typography.Text>
          <div>
            <Typography.Text>缩放 {cropZoom.toFixed(2)}×</Typography.Text>
            <Slider min={1} max={3} step={0.01} value={cropZoom} onChange={setCropZoom} />
          </div>
          <div>
            <Typography.Text>水平位置 {cropX.toFixed(2)}</Typography.Text>
            <Slider min={-1} max={1} step={0.01} value={cropX} onChange={setCropX} />
          </div>
          <div>
            <Typography.Text>垂直位置 {cropY.toFixed(2)}</Typography.Text>
            <Slider min={-1} max={1} step={0.01} value={cropY} onChange={setCropY} />
          </div>
        </Space>
      </Modal>

      <Card title="历史导入">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">由你决定导入哪些私聊会话。只读 AstrBot 数据库，不导入群聊，不修改 AstrBot 记忆。</Typography.Text>
          <Space wrap>
            <Button onClick={loadImportSessions}>读取可导入私聊</Button>
            <Button type="primary" disabled={!selectedImports.length} loading={importBusy} onClick={importSelected}>导入选中私聊</Button>
          </Space>
          {importSessions.length > 0 && (
            <Space direction="vertical">
              {importSessions.map((session) => (
                <Checkbox
                  key={session.targetId}
                  checked={selectedImports.includes(session.targetId)}
                  onChange={(event) => setSelectedImports((current) => event.target.checked
                    ? [...current, session.targetId]
                    : current.filter((id) => id !== session.targetId))}
                >
                  {session.label}
                </Checkbox>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      <Card title="性能与显示">
        <Space size="large" align="start">
          <Switch checked={liteMode} onChange={toggleLite} />
          <div>
            <Typography.Text strong>轻量模式</Typography.Text>
            <div><Typography.Text type="secondary">关闭动画、阴影和毛玻璃效果，减少旧设备渲染开销。只影响本浏览器。</Typography.Text></div>
          </div>
        </Space>
      </Card>

      <Card
        title="高级配置"
        extra={<Space><Button onClick={tour}>重新引导</Button><Button type="primary" loading={saving} onClick={save}>保存到网关</Button></Space>}
      >
        <Alert
          type="info"
          showIcon
          message="原始配置"
          description="这里编辑的是 AstrBot 连接 profile。accessToken 会写入网关配置；不要在公开仓库提交该文件。"
          style={{ marginBottom: 16 }}
        />
        <CodeMirror
          value={value}
          height="480px"
          theme="dark"
          extensions={[json()]}
          onChange={setValue}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          登录状态：HttpOnly 会话 Cookie
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
