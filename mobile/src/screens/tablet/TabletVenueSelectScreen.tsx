import React, { useEffect, useState, useCallback } from "react";
import { Alert } from "react-native";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import {
  VenueSelectList,
  type VenueSessionStatus,
} from "../../components/VenueSelectList";
import { connectSocket, joinVenue as socketJoinVenue } from "../../lib/socket";
import type { Venue, CourtsState } from "../../types/api";
import type { TabletStackScreenProps } from "../../navigation/types";
import { mapStaffVenuesToVenues } from "../../lib/map-staff-venues";

export function TabletVenueSelectScreen({
  navigation,
}: TabletStackScreenProps<"TabletVenueSelect">) {
  const storedVenues = useAuthStore((s) => s.venues);
  const setVenue = useAuthStore((s) => s.setVenue);
  const [venues, setVenues] = useState<Venue[]>(storedVenues);
  const [loading, setLoading] = useState(storedVenues.length === 0);
  const [sessionStatuses, setSessionStatuses] = useState<
    Record<string, VenueSessionStatus>
  >({});

  /** Fetch session status for every venue in parallel (best-effort). */
  const fetchSessionStatuses = useCallback(async (list: Venue[]) => {
    if (list.length === 0) return;
    const results = await Promise.allSettled(
      list.map((v) =>
        api
          .get<CourtsState>(`/api/courts/state?venueId=${v.id}`)
          .then((data): [string, VenueSessionStatus] => [
            v.id,
            data.session?.status === "open" ? "open" : "closed",
          ])
          .catch((): [string, VenueSessionStatus] => [v.id, "unknown"])
      )
    );
    const map: Record<string, VenueSessionStatus> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        const [id, status] = r.value;
        map[id] = status;
      }
    }
    setSessionStatuses(map);
  }, []);

  useEffect(() => {
    if (storedVenues.length > 0) {
      setVenues(storedVenues);
      setLoading(false);
      void fetchSessionStatuses(storedVenues);
      return;
    }
    refreshVenues();
  }, []);

  const refreshVenues = async () => {
    try {
      const data = await api.get<{
        name?: string;
        venues?: { id: string; name: string }[];
      }>("/api/auth/staff-me");
      const list = mapStaffVenuesToVenues(data.venues);
      setVenues(list);
      useAuthStore.getState().setAuth({ venues: list });
      void fetchSessionStatuses(list);
    } catch {
      Alert.alert("Error", "Could not load venues");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (venue: Venue) => {
    setVenue(venue.id);
    connectSocket();
    socketJoinVenue(venue.id);
    navigation.navigate("TabletModeSelect");
  };

  const handleBackToContinueAs = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("ContinueAs" as never);
      return;
    }
    navigation.goBack();
  };

  return (
    <VenueSelectList
      venues={venues}
      loading={loading}
      onSelect={handleSelect}
      title="Select Venue (Tablet)"
      onBack={handleBackToContinueAs}
      sessionStatuses={sessionStatuses}
    />
  );
}
