import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/?", ""));
  const roomId = params.get("room");
  if (!roomId) return ws.close();

  if (!rooms.has(roomId)) rooms.set(roomId, []);
  const clients = rooms.get(roomId);
  clients.push(ws);

  ws.on("message", (msg) => {
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(msg);
      }
    }
  });

  ws.on("close", () => {
    const updated = rooms.get(roomId)?.filter((c) => c !== ws);
    if (updated?.length) rooms.set(roomId, updated);
    else rooms.delete(roomId);
  });
});

app.get("/", (_, res) => res.send("WebRTC Signaling Server Active ✅"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
