import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_PORT || 6299);
const wss = new WebSocketServer({ port: PORT });
let seq = 0;

wss.on("connection", (ws, req) => {
  console.log("mock AstrBot accepted", req.headers["x-self-id"], req.url);
  ws.on("message", (data) => {
    let event;
    try { event = JSON.parse(data.toString()); } catch { return; }
    console.log("EVENT", JSON.stringify(event));
    if (event.post_type !== "message") return;
    const isGroup = event.message_type === "group";
    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({
        action: isGroup ? "send_group_msg" : "send_private_msg",
        params: {
          message_type: isGroup ? "group" : "private",
          group_id: event.group_id,
          user_id: event.user_id,
          message: [{ type: "text", data: { text: "本地 mock 收到：" + (event.raw_message || "") } }],
        },
        echo: `mock-${++seq}`,
      }));
    }, 250);
  });
});

console.log(`mock AstrBot OneBot WS ws://127.0.0.1:${PORT}/ws`);
