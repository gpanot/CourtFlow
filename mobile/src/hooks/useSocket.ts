import { useEffect, useRef, useMemo } from "react";
import { getSocket, connectSocket, joinVenue } from "../lib/socket";
import type { Socket } from "socket.io-client";

export function useSocket(
  venueId: string | null,
  listeners?: Record<string, (...args: unknown[]) => void>
): Socket {
  const socket = getSocket();
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    connectSocket();

    if (venueId) {
      const handleConnect = () => joinVenue(venueId);
      socket.on("connect", handleConnect);
      if (socket.connected) joinVenue(venueId);
      return () => {
        socket.off("connect", handleConnect);
      };
    }
  }, [venueId, socket]);

  const eventNames = useMemo(
    () => (listeners ? Object.keys(listeners).sort().join(",") : ""),
    [listeners ? Object.keys(listeners).sort().join(",") : ""]
  );

  useEffect(() => {
    if (!eventNames) return;
    const names = eventNames.split(",");

    const wrappedHandlers = names.map((event) => {
      const handler = (...args: unknown[]) => {
        listenersRef.current?.[event]?.(...args);
      };
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      for (const { event, handler } of wrappedHandlers) {
        socket.off(event, handler);
      }
    };
  }, [eventNames, socket]);

  return socket;
}
