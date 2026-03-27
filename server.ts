import express from "express";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
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
  
  // Create HTTP or HTTPS server based on environment
  let server;
  const isHttps = process.env.HTTPS === 'true';
  
  if (isHttps && process.env.SSL_CRT_FILE && process.env.SSL_KEY_FILE) {
    try {
      const cert = fs.readFileSync(process.env.SSL_CRT_FILE);
      const key = fs.readFileSync(process.env.SSL_KEY_FILE);
      server = createHttpsServer({ cert, key }, expressApp);
      console.log('🔐 HTTPS server enabled');
    } catch (error) {
      console.error('❌ Failed to load SSL certificates, falling back to HTTP:', error);
      server = createServer(expressApp);
    }
  } else {
    server = createServer(expressApp);
  }

  const io = new SocketIOServer(server, {
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

  server.listen(port, () => {
    const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
    console.log(`\n  CourtFlow running on ${protocol}://${hostname}:${port}`);
    console.log(`  Socket.io ready`);
    console.log(`  Mode: ${dev ? "development" : "production"}\n`);
  });
});
