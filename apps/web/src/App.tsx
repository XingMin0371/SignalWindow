import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import { App as AntApp, Button, ConfigProvider, Form, Input, Layout, Menu, Modal, Space, Tag, Typography, message, theme } from "antd";
import { ApiOutlined, DashboardOutlined, NodeIndexOutlined, SettingOutlined, BugOutlined, MessageOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "./api";
import type { Config } from "./types";
const SOURCE_URL = "https://github.com/XingMin0371/SignalWindow";

const ChatPage = lazy(() => import("./pages/ChatPage"));
const ProfilesPage = lazy(() => import("./pages/ProfilesPage"));
const TopologyPage = lazy(() => import("./pages/TopologyPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DiagnosticsPage = lazy(() => import("./pages/DiagnosticsPage"));

const { Header, Sider, Content } = Layout;
const dataProvider: any = {
  getList: async () => ({ data: [], total: 0 }),
  getOne: async () => ({ data: {} }),
  create: async () => ({ data: {} }),
  update: async () => ({ data: {} }),
  deleteOne: async () => ({ data: {} }),
  getApiUrl: () => "/api",
};

function Shell({ config, reload }: { config: Config; reload: () => Promise<void> }) {
  const items = [
    { key: "/chat", icon: <MessageOutlined />, label: <NavLink to="/chat">聊天</NavLink> },
    { key: "/profiles", icon: <ApiOutlined />, label: <NavLink to="/profiles">AstrBot 实例</NavLink> },
    { key: "/topology", icon: <NodeIndexOutlined />, label: <NavLink to="/topology">拓扑</NavLink> },
    { key: "/diagnostics", icon: <BugOutlined />, label: <NavLink to="/diagnostics">诊断</NavLink> },
    { key: "/settings", icon: <SettingOutlined />, label: <NavLink to="/settings">高级配置</NavLink> },
  ];
  return (
    <Layout className="app-shell">
      <Sider width={220} breakpoint="lg" collapsedWidth={0} className="app-sider">
        <div className="brand-block">
          <div className="brand-mark">◒</div>
          <div className="brand-copy"><span>Signal</span><small>WINDOW / CONTROL</small></div>
        </div>
        <div className="rail-caption">REMOTE SIGNAL</div>
        <Menu mode="inline" theme="dark" items={items} />
        <div className="sider-footer">
          <Tag color="blue">{config.profiles.length} 个实例</Tag>
          <Button size="small" onClick={reload}>刷新配置</Button>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="page-heading">
            <div className="eyebrow">ASTRBOT / PRIVATE NETWORK</div>
            <Typography.Title level={3} style={{ margin: 0 }}>控制室</Typography.Title>
          </div>
          <Space className="header-status">
            <span className={`pulse ${config.authRequired ? "armed" : "local"}`} />
            <Tag bordered={false} className="status-tag">
              {config.authRequired ? "SECURED" : "LOCAL"}
            </Tag>
            <a className="source-link" href={SOURCE_URL} target="_blank" rel="noreferrer"
               title="AGPL-3.0-only · 无担保 · 源代码">
              AGPL-3.0 · 源码
            </a>
          </Space>
        </Header>
        <Content className="app-content">
          <Suspense fallback={<div className="route-loading">载入页面…</div>}>
            <Routes>
              <Route path="/chat" element={<ChatPage profiles={config.profiles} />} />
              <Route path="/profiles" element={<ProfilesPage profiles={config.profiles} reload={reload} />} />
              <Route path="/topology" element={<TopologyPage profiles={config.profiles} />} />
              <Route path="/diagnostics" element={<DiagnosticsPage profiles={config.profiles} />} />
              <Route path="/settings" element={<SettingsPage profiles={config.profiles} />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupForm] = Form.useForm();

  async function reload() {
    try {
      const next = await api.config();
      setConfig(next);
      setAuthOpen(Boolean(next.authRequired && !next.authenticated));
      setSetupOpen(!next.profiles.length);
    } catch (error) {
      message.error(String(error));
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function saveProfile() {
    const values = await setupForm.validateFields();
    try {
      await api.addProfile(values);
      message.success("AstrBot 已保存，正在连接");
      setSetupOpen(false);
      await reload();
    } catch (error) {
      message.error(String(error));
    }
  }

  if (loading || !config) return <div className="loading">加载配置…</div>;

  if (config.authRequired && !config.authenticated) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#d6ff4b", colorBgBase: "#080a0c" } }}>
        <AntApp>
          <div className="auth-gate">
            <div className="auth-card">
              <div className="eyebrow">PRIVATE SIGNAL / AUTHENTICATION</div>
              <Typography.Title level={2}>进入控制室</Typography.Title>
              <Typography.Paragraph type="secondary">输入网关部署时设置的 Token。凭据只用于建立 HttpOnly 会话，不写入 localStorage。</Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                AGPL-3.0-only · 无担保 ·{" "}
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">获取源代码</a>
              </Typography.Paragraph>
              <Form
                layout="vertical"
                onFinish={async ({ token }) => {
                  try {
                    await api.login(token);
                    await reload();
                  } catch {
                    message.error("Token 无效");
                  }
                }}
              >
                <Form.Item name="token" label="Gateway Token" rules={[{ required: true }]}>
                  <Input.Password placeholder="部署时生成的 Gateway Token" autoFocus />
                </Form.Item>
                <Button type="primary" htmlType="submit" block>进入</Button>
              </Form>
            </div>
          </div>
        </AntApp>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: "#d6ff4b",
        colorInfo: "#7fe7ff",
        colorBgBase: "#080a0c",
        colorBgContainer: "#111619",
        colorBgElevated: "#161d21",
        colorBorder: "#293238",
        colorText: "#eef4f2",
        colorTextSecondary: "#8e9b9b",
        borderRadius: 14,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      },
      components: {
        Menu: { itemBg: "transparent", itemSelectedBg: "#d6ff4b", itemSelectedColor: "#080a0c", itemHoverBg: "#1c2528", itemBorderRadius: 10 },
        Card: { colorBgContainer: "#111619", borderRadiusLG: 18 },
        Modal: { contentBg: "#111619", headerBg: "#111619" },
      },
    }}>
      <AntApp>
        <BrowserRouter>
          <Refine dataProvider={dataProvider} routerProvider={routerProvider} resources={[{ name: "profiles", list: "/profiles" }]}>
            <Shell config={config} reload={reload} />
          </Refine>
        </BrowserRouter>

        <Modal className="setup-modal" open={authOpen} title="网关登录" footer={null} closable={false}>
          <Form
            layout="vertical"
            onFinish={async ({ token }) => {
              try {
                await api.login(token);
                setAuthOpen(false);
                await reload();
              } catch {
                message.error("Token 无效");
              }
            }}
          >
            <Form.Item name="token" label="Gateway Token" rules={[{ required: true }]}>
              <Input.Password placeholder="部署时生成的 Gateway Token" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>进入</Button>
          </Form>
        </Modal>

        <Modal
          className="setup-modal"
          open={setupOpen && !authOpen}
          title="连接你的 AstrBot"
          width={620}
          closable={false}
          footer={[
            <Button key="cancel" onClick={() => setSetupOpen(false)}>稍后</Button>,
            <Button key="ok" type="primary" onClick={saveProfile}>保存并连接</Button>,
          ]}
        >
          <Typography.Paragraph type="secondary">
            只需要启用 aiocqhttp / OneBot v11，不需要安装业务插件。
          </Typography.Paragraph>
          <Form form={setupForm} layout="vertical" initialValues={{ label: "我的 AstrBot", privateUserIds: [""], groupIds: [""] }}>
            <Form.Item name="label" label="显示名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="wsUrl" label="OneBot WS 地址" rules={[{ required: true }]}><Input placeholder="ws://127.0.0.1:6199/ws" /></Form.Item>
            <Form.Item name="accessToken" label="OneBot accessToken"><Input.Password /></Form.Item>
            <Form.Item name="selfId" label="Bot QQ / self_id" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="私聊对象 QQ" required>
              <Form.List name="privateUserIds">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {fields.map((field) => (
                      <Space key={field.key} align="start" style={{ width: "100%" }}>
                        <Form.Item {...field} name={[field.name]} rules={[{ required: true, message: "填写 QQ" }, { pattern: /^\d{5,12}$/, message: "5-12 位数字" }]} style={{ flex: 1, marginBottom: 0 }}>
                          <Input placeholder="例如 1000000002" />
                        </Form.Item>
                        <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} disabled={fields.length === 1} />
                      </Space>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add("")} block>添加私聊对象</Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item label="群聊对象">
              <Form.List name="groupIds">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {fields.map((field) => (
                      <Space key={field.key} align="start" style={{ width: "100%" }}>
                        <Form.Item {...field} name={[field.name]} rules={[{ pattern: /^\d{5,12}$/, message: "5-12 位数字" }]} style={{ flex: 1, marginBottom: 0 }}>
                          <Input placeholder="例如 2000000001，可留空" />
                        </Form.Item>
                        <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} disabled={fields.length === 1} />
                      </Space>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add("")} block>添加群聊对象</Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          </Form>
        </Modal>
      </AntApp>
    </ConfigProvider>
  );
}
