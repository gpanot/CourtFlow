import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { VenueSelectList } from "../../components/VenueSelectList";
import { connectSocket, joinVenue as socketJoinVenue } from "../../lib/socket";
import type { Venue } from "../../types/api";
import type { StaffStackScreenProps } from "../../navigation/types";
import { mapStaffVenuesToVenues } from "../../lib/map-staff-venues";

export function VenueSelectScreen({
  navigation,
}: StaffStackScreenProps<"VenueSelect">) {
  const storedVenues = useAuthStore((s) => s.venues);
  const setVenue = useAuthStore((s) => s.setVenue);
  const [venues, setVenues] = useState<Venue[]>(storedVenues);
  const [loading, setLoading] = useState(storedVenues.length === 0);

  useEffect(() => {
    if (storedVenues.length > 0) {
      setVenues(storedVenues);
      setLoading(false);
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
    navigation.replace("StaffTabs");
  };

  return (
    <VenueSelectList
      venues={venues}
      loading={loading}
      onSelect={handleSelect}
      title="Select Venue"
    />
  );
}
