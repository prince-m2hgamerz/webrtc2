import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map(); // ws => { username }

app.use(express.static(path.join(path.resolve(), "public")));

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (err) { return; }

    // Register username
    if (data.type === "register") {
      ws.username = data.username;
      clients.set(ws, { username: data.username });
      broadcastUsers();
      return;
    }

    // Call/SDP/candidate messages
    if (data.type === "call" || data.type === "sdp" || data.type === "candidate") {
      const targetWs = [...clients.keys()].find(c => c.username === data.target);
      if (targetWs && targetWs.readyState === 1) {
        targetWs.send(JSON.stringify({ ...data, from: ws.username }));
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastUsers();
  });
});

// Broadcast online users
function broadcastUsers() {
  const userList = [...clients.values()].map(u => u.username);
  clients.forEach((_, ws) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "users", users: userList }));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
