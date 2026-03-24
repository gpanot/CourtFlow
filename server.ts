import express from "express";
import { createServer } from "http";
import next from "next";
import path from "path";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
    pingTimeout: 60000,
  });

  // Make io available to API routes via global
  (globalThis as Record<string, unknown>).__socketIO = io;

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("join:venue", (venueId: string) => {
      socket.join(`venue:${venueId}`);
      console.log(`[Socket.io] ${socket.id} joined venue:${venueId}`);
    });

    socket.on("join:player", (playerId: string) => {
      socket.join(`player:${playerId}`);
    });

    socket.on("leave:venue", (venueId: string) => {
      socket.leave(`venue:${venueId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  expressApp.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  expressApp.all("/{*path}", (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`\n  CourtFlow running on http://${hostname}:${port}`);
    console.log(`  Socket.io ready`);
    console.log(`  Mode: ${dev ? "development" : "production"}\n`);
  });
});
