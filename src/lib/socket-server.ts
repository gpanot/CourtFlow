import type { Server as SocketIOServer } from "socket.io";

export function getIO(): SocketIOServer {
  const io = (globalThis as Record<string, unknown>).__socketIO as SocketIOServer | undefined;
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function emitToVenue(venueId: string, event: string, data: unknown) {
  try {
    const io = getIO();
    io.to(`venue:${venueId}`).emit(event, data);
  } catch {
    console.warn(`[Socket] Cannot emit ${event} - IO not ready`);
  }
}

export function emitToPlayer(playerId: string, event: string, data: unknown) {
  try {
    const io = getIO();
    io.to(`player:${playerId}`).emit(event, data);
  } catch {
    console.warn(`[Socket] Cannot emit ${event} to player - IO not ready`);
  }
}
