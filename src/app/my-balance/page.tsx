"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { IdentifyState } from "./IdentifyState";
import { VenuePicker } from "./VenuePicker";
import { BalanceScreen } from "./BalanceScreen";
import type { BalanceData, VenueInfo, IdentifyResult } from "./types";

type Screen = "loading" | "identify" | "pick-venue" | "balance";

const STORAGE_KEY = "cf_balance_phone";

function migrateOldStorageKeys(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("cf_balance_phone_")) {
        const phone = localStorage.getItem(key);
        if (phone) {
          localStorage.setItem(STORAGE_KEY, phone);
        }
        localStorage.removeItem(key);
        return phone;
      }
    }
  } catch {
    // localStorage unavailable (SSR, private browsing)
  }
  return null;
}

export default function MyBalancePage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [playerName, setPlayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBalanceForVenue = useCallback(
    async (savedPhone: string, venueId: string): Promise<BalanceData | null> => {
      const params = new URLSearchParams({ phone: savedPhone, venueCode: venueId });
      const res = await fetch(`/api/balance/identify?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.found ? (data as BalanceData) : null;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      migrateOldStorageKeys();

      const savedPhone = localStorage.getItem(STORAGE_KEY);
      if (!savedPhone) {
        if (!cancelled) setScreen("identify");
        return;
      }

      try {
        const params = new URLSearchParams({ phone: savedPhone });
        const res = await fetch(`/api/balance/identify?${params}`);
        if (!res.ok) {
          if (!cancelled) {
            localStorage.removeItem(STORAGE_KEY);
            setScreen("identify");
          }
          return;
        }

        const data: IdentifyResult = await res.json();
        if (cancelled) return;

        if (!data.found) {
          localStorage.removeItem(STORAGE_KEY);
          setScreen("identify");
          return;
        }

        setPlayerName(data.playerName ?? "");
        setPhone(savedPhone);

        if (data.venues) {
          setVenues(data.venues);
        }

        if (data.venues && data.venues.length > 1) {
          setScreen("pick-venue");
        } else if (data.venueName && data.subscription !== undefined) {
          setBalanceData(data as BalanceData);
          setScreen("balance");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setScreen("identify");
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setScreen("identify");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const handleIdentified = useCallback(
    (result: IdentifyResult, identifiedPhone: string) => {
      localStorage.setItem(STORAGE_KEY, identifiedPhone);
      setPhone(identifiedPhone);
      setPlayerName(result.playerName ?? "");

      if (result.venues) {
        setVenues(result.venues);
      }

      if (result.venues && result.venues.length > 1) {
        setScreen("pick-venue");
      } else if (result.venueName && result.subscription !== undefined) {
        setBalanceData(result as BalanceData);
        setScreen("balance");
      } else {
        setScreen("identify");
      }
    },
    []
  );

  const handleVenueSelected = useCallback(
    async (venue: VenueInfo) => {
      if (!phone) return;
      const data = await fetchBalanceForVenue(phone, venue.id);
      if (data) {
        setBalanceData(data);
        setScreen("balance");
      }
    },
    [phone, fetchBalanceForVenue]
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPhone("");
    setPlayerName("");
    setVenues([]);
    setBalanceData(null);
    setScreen("identify");
  }, []);

  const handleBackToVenues = useCallback(() => {
    if (venues.length > 1) {
      setBalanceData(null);
      setScreen("pick-venue");
    } else {
      handleLogout();
    }
  }, [venues, handleLogout]);

  const handleRefresh = useCallback(async () => {
    if (!phone || !balanceData) return;
    setRefreshing(true);
    try {
      const venue = venues.find((v) => v.name === balanceData.venueName);
      const venueId = venue?.id ?? venues[0]?.id;
      if (!venueId) return;
      const data = await fetchBalanceForVenue(phone, venueId);
      if (data) {
        setBalanceData(data);
      }
    } finally {
      setRefreshing(false);
    }
  }, [phone, balanceData, venues, fetchBalanceForVenue]);

  if (screen === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0e0e0e]">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (screen === "identify") {
    return <IdentifyState onIdentified={handleIdentified} />;
  }

  if (screen === "pick-venue") {
    return (
      <VenuePicker
        playerName={playerName}
        venues={venues}
        onSelect={handleVenueSelected}
        onBack={handleLogout}
      />
    );
  }

  if (screen === "balance" && balanceData) {
    return (
      <BalanceScreen
        data={balanceData}
        onRefresh={handleRefresh}
        onBack={handleBackToVenues}
        refreshing={refreshing}
      />
    );
  }

  return null;
}
