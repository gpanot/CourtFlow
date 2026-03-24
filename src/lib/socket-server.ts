import type { Server as SocketIOServer } from "socket.io";
import { sendPushToPlayer } from "./push";

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

const PUSH_TITLES: Record<string, string> = {
  court_assigned: "Court Ready!",
  requeued: "Back in Queue",
  session_closing: "Session Ending",
  session_ended_by_staff: "Session Ended",
};

export function emitToPlayer(playerId: string, event: string, data: unknown) {
  try {
    const io = getIO();
    io.to(`player:${playerId}`).emit(event, data);
  } catch {
    console.warn(`[Socket] Cannot emit ${event} to player - IO not ready`);
  }

  if (event === "player:notification" && data && typeof data === "object") {
    const notif = data as Record<string, unknown>;
    const type = (notif.type as string) || "";
    const title = PUSH_TITLES[type] || "CourtFlow";
    const body = (notif.message as string) || "";

    sendPushToPlayer(playerId, { title, body, tag: type, data: notif }).catch((err) =>
      console.warn("[Push] Failed to send:", err)
    );
  }
}
