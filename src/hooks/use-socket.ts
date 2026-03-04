"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket-client";
import type { Socket } from "socket.io-client";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getSocket();
    return () => {
      // Don't disconnect on unmount - socket is shared
    };
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    const s = socketRef.current ?? getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, []);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    const s = socketRef.current ?? getSocket();
    s.emit(event, ...args);
  }, []);

  return { on, emit, socket: socketRef };
}
