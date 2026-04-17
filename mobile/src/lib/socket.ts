import { io, Socket } from "socket.io-client";
import { ENV } from "../config/env";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(ENV.SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function joinVenue(venueId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit("join:venue", venueId);
  }
}
