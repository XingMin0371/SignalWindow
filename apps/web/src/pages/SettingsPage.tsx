import { useEffect, useState } from "react";
import { Alert, Button, Card, Space, Switch, Typography, message } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { Profile } from "../types";
import { api } from "../api";

export default function SettingsPage({ profiles }: { profiles: Profile[] }) {
  const [value, setValue] = useState(JSON.stringify({ profiles }, null, 2));
  const [saving, setSaving] = useState(false);
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem("signal_enter_send") !== "0");

  useEffect(() => {
    setValue(JSON.stringify({ profiles }, null, 2));
  }, [profiles]);

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
    localStorage.setItem("snowluma_window_tour", "1");
  }

  async function save() {
    setSaving(true);
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed.profiles)) throw new Error("profiles 必须是数组");
      for (const profile of parsed.profiles) {
        await api.addProfile(profile);
      }
      message.success("配置已保存到网关");
    } catch (error) {
      message.error(String(error));
    } finally {
      setSaving(false);
    }
  }

  function toggleEnter(value: boolean) {
    setEnterToSend(value);
    localStorage.setItem("signal_enter_send", value ? "1" : "0");
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
