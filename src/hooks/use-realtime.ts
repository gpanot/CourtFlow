"use client";

import { useEffect, useState, useCallback } from "react";
import { useSocket } from "./use-socket";
import { joinVenue, leaveVenue, joinPlayer } from "@/lib/socket-client";

export function useVenueRealtime(venueId: string | null) {
  const { on } = useSocket();
  const [courts, setCourts] = useState<unknown[]>([]);
  const [queue, setQueue] = useState<unknown[]>([]);
  const [session, setSession] = useState<unknown>(null);

  useEffect(() => {
    if (!venueId) return;
    joinVenue(venueId);

    const offCourt = on("court:updated", (data: unknown) => {
      setCourts(data as unknown[]);
    });
    const offQueue = on("queue:updated", (data: unknown) => {
      setQueue(data as unknown[]);
    });
    const offSession = on("session:updated", (data: unknown) => {
      setSession(data);
    });

    return () => {
      offCourt();
      offQueue();
      offSession();
      leaveVenue(venueId);
    };
  }, [venueId, on]);

  return { courts, setCourts, queue, setQueue, session, setSession };
}

export function usePlayerNotifications(playerId: string | null) {
  const { on } = useSocket();
  const [notification, setNotification] = useState<unknown>(null);

  useEffect(() => {
    if (!playerId) return;
    joinPlayer(playerId);

    const off = on("player:notification", (data: unknown) => {
      setNotification(data);
    });

    return () => {
      off();
    };
  }, [playerId, on]);

  const clearNotification = useCallback(() => setNotification(null), []);

  return { notification, clearNotification };
}
