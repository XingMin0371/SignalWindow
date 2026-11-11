import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, Tag, Typography } from "antd";
import { api } from "../api";
import type { Profile } from "../types";

export default function TopologyPage({ profiles }: { profiles: Profile[] }) {
  const [onebots, setOnebots] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const health = await api.health();
        if (!cancelled) setOnebots(health.onebots || {});
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const { nodes, edges } = useMemo(() => {
    const profileNodes = profiles.map((profile, index) => ({
      id: `profile-${profile.id}`,
      position: { x: 40, y: 80 + index * 120 },
      data: {
        label: (
          <div>
            <strong>{profile.label}</strong>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Bot {profile.selfId}</div>
            <Tag color={onebots[profile.id] ? "green" : "red"} style={{ marginTop: 4 }}>
              {onebots[profile.id] ? "在线" : "离线"}
            </Tag>
          </div>
        ),
      },
      style: { border: "1px solid #30363d", background: "#161b22", color: "#e6edf3", borderRadius: 10, width: 180 },
    }));
    const gateway = [{
      id: "gateway",
      position: { x: 360, y: 150 },
      data: { label: <div><strong>signal-window</strong><div style={{ fontSize: 11 }}>OneBot Gateway</div></div> },
      style: { border: "1px solid #1677ff", background: "#0d2137", color: "#e6edf3", borderRadius: 10, width: 190 },
    }];
    const browser = [{
      id: "browser",
      position: { x: 680, y: 150 },
      data: { label: <div><strong>Web / PWA</strong><div style={{ fontSize: 11 }}>手机 · 平板 · 电脑</div></div> },
      style: { border: "1px solid #3fb950", background: "#0f2417", color: "#e6edf3", borderRadius: 10, width: 170 },
    }];
    return {
      nodes: [...profileNodes, ...gateway, ...browser],
      edges: [
        ...profiles.map((profile) => ({ id: `edge-${profile.id}`, source: `profile-${profile.id}`, target: "gateway", animated: onebots[profile.id] })),
        { id: "edge-browser", source: "gateway", target: "browser", animated: true },
      ],
    };
  }, [profiles, onebots]);

  return (
    <Card title="连接拓扑">
      <Typography.Paragraph type="secondary">
        AstrBot 实例通过 OneBot v11 接入网关，浏览器只连接网关。绿色状态来自 /api/health 实时轮询。
      </Typography.Paragraph>
      <div style={{ height: 520, background: "#0d1117", borderRadius: 12 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background color="#30363d" gap={20} />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
}
