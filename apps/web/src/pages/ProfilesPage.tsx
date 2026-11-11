import { useState } from "react";
import { Button, Card, Descriptions, Form, Input, Modal, Space, Table, Tag, Typography, message } from "antd";
import { MinusCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Profile } from "../types";

interface Props {
  profiles: Profile[];
  reload: () => Promise<void>;
}

export default function ProfilesPage({ profiles, reload }: Props) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  async function testConnection() {
    const values = await form.validateFields();
    setTesting(true);
    try {
      const result = await api.testProfile(values);
      if (result.ok) message.success("连接成功：OneBot WebSocket 已握手");
      else message.error("连接失败：" + result.detail);
    } catch (error) {
      message.error(String(error));
    } finally {
      setTesting(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ label: "我的 AstrBot", privateUserIds: [""], groupIds: [""] });
    setOpen(true);
  }

  async function openEdit(profile: Profile) {
    setLoadingProfile(true);
    setEditingId(profile.id);
    try {
      const full = await api.profile(profile.id);
      form.setFieldsValue({
        label: full.label,
        wsUrl: full.wsUrl,
        accessToken: full.accessToken || "",
        selfId: full.selfId,
        privateUserIds: full.privateUserIds || [full.privateUserId],
        groupIds: full.groupIds || [],
      });
      setOpen(true);
    } catch (error) {
      message.error(String(error));
      setEditingId(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function add() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.addProfile({ ...values, ...(editingId ? { id: editingId } : {}) });
      message.success(editingId ? "实例已更新" : "实例已保存，网关会自动建立连接");
      setOpen(false);
      setEditingId(null);
      form.resetFields();
      await reload();
    } catch (error) {
      message.error(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card
        title="AstrBot 实例"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加实例</Button>}
      >
        <Typography.Paragraph type="secondary">
          每个实例只需要启用 aiocqhttp / OneBot v11。配置保存后会立即创建对应 OneBot 客户端，不需要重启网关。
        </Typography.Paragraph>
        <Table
          rowKey="id"
          dataSource={profiles}
          pagination={false}
          columns={[
            { title: "名称", dataIndex: "label" },
            { title: "ID", dataIndex: "id", render: (value) => <Tag>{value}</Tag> },
            { title: "Bot QQ", dataIndex: "selfId" },
            { title: "私聊对象", dataIndex: "privateUserIds", render: (value) => (value || []).join(" / ") || "-" },
            { title: "群号", dataIndex: "groupIds", render: (value) => (value || []).join(" / ") || "-" },
            {
              title: "状态",
              render: () => <Tag color="processing">等待健康检查</Tag>,
            },
            {
              title: "操作",
              render: (_, profile) => <Button size="small" loading={loadingProfile} onClick={() => openEdit(profile)}>编辑</Button>,
            },
          ]}
        />
      </Card>

      <Card
        title="连接配置说明"
        extra={<Button icon={<ReloadOutlined />} onClick={() => reload()}>刷新</Button>}
      >
        <Descriptions column={1} size="small">
          <Descriptions.Item label="网关认证">
            HttpOnly 会话 Cookie
          </Descriptions.Item>
          <Descriptions.Item label="网关健康接口">/api/health</Descriptions.Item>
          <Descriptions.Item label="OneBot 连接">每个 profile 独立连接，断线自动重试</Descriptions.Item>
          <Descriptions.Item label="保存位置">config/upstreams.json</Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={editingId ? "编辑 AstrBot 实例" : "添加 AstrBot 实例"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={add}
        confirmLoading={saving}
        width={680}
        footer={[
          <Button key="test" loading={testing} onClick={testConnection}>测试连接</Button>,
          <Button key="cancel" onClick={() => { setOpen(false); setEditingId(null); }}>取消</Button>,
          <Button key="save" type="primary" loading={saving} onClick={add}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" initialValues={{ label: "我的 AstrBot", privateUserIds: [""], groupIds: [""] }}>
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
                      <Form.Item
                        {...field}
                        name={[field.name]}
                        rules={[{ required: true, message: "填写 QQ" }, { pattern: /^\d{5,12}$/, message: "5-12 位数字" }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
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
                      <Form.Item
                        {...field}
                        name={[field.name]}
                        rules={[{ pattern: /^\d{5,12}$/, message: "5-12 位数字" }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
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
    </Space>
  );
}
