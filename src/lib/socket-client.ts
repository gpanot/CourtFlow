"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

export function joinVenue(venueId: string) {
  const s = getSocket();
  s.emit("join:venue", venueId);
}

export function joinPlayer(playerId: string) {
  const s = getSocket();
  s.emit("join:player", playerId);
}

export function leaveVenue(venueId: string) {
  const s = getSocket();
  s.emit("leave:venue", venueId);
}
