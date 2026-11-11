import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Tag, Typography } from "antd";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api";
import type { Health, Profile } from "../types";

export default function DiagnosticsPage({ profiles }: { profiles: Profile[] }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [points, setPoints] = useState<{ time: string; online: number; total: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await api.health();
        if (cancelled) return;
        setHealth(next);
        const values = Object.values(next.onebots || {});
        setPoints((current) => [...current.slice(-23), {
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          online: values.filter(Boolean).length,
          total: values.length,
        }]);
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const values = Object.values(health?.onebots || {});
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="运行状态">
          <Row gutter={24}>
            <Col span={6}><Statistic title="实例数" value={values.length} /></Col>
            <Col span={6}><Statistic title="在线实例" value={values.filter(Boolean).length} valueStyle={{ color: "#3fb950" }} /></Col>
            <Col span={6}><Statistic title="离线实例" value={values.filter((value) => !value).length} valueStyle={{ color: "#f85149" }} /></Col>
            <Col span={6}><Statistic title="网关" value={health?.ok ? "正常" : "异常"} /></Col>
          </Row>
        </Card>
      </Col>
      <Col span={24}>
        <Card title="在线实例趋势">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={points}>
                <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#8b949e" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#8b949e" />
                <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d" }} />
                <Line type="monotone" dataKey="online" stroke="#3fb950" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" stroke="#1677ff" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Col>
      <Col span={24}>
        <Card title="实例详情">
          {profiles.map((profile) => (
            <div key={profile.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #21262d" }}>
              <Tag color={health?.onebots?.[profile.id] ? "green" : "red"}>{health?.onebots?.[profile.id] ? "在线" : "离线"}</Tag>
              <strong>{profile.label}</strong>
              <Typography.Text type="secondary">Bot {profile.selfId} · 主人 {profile.privateUserId}</Typography.Text>
            </div>
          ))}
        </Card>
      </Col>
    </Row>
  );
}
