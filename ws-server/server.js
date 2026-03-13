import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", message: "ws connected" }));

  socket.on("message", (data) => {
    let payload = null;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    const message = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  });
});

console.log(`WebSocket server listening on ws://0.0.0.0:${port}`);
