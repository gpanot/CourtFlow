"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { LandingState, type BalanceData } from "./LandingState";
import { BalanceScreen } from "./BalanceScreen";

type Screen = "loading" | "landing" | "balance";

function storageKey(venueCode: string) {
  return `cf_balance_phone_${venueCode}`;
}

export default function MyBalancePage() {
  const { venueCode } = useParams<{ venueCode: string }>();
  const [screen, setScreen] = useState<Screen>("loading");
  const [venueName, setVenueName] = useState("");
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [venueError, setVenueError] = useState(false);

  const fetchBalance = useCallback(
    async (phone: string): Promise<BalanceData | null> => {
      const params = new URLSearchParams({ venueCode, phone });
      const res = await fetch(`/api/balance/identify?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.found ? (data as BalanceData) : null;
    },
    [venueCode]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const venueRes = await fetch(`/api/venues/${venueCode}`);
        if (!venueRes.ok) {
          if (!cancelled) setVenueError(true);
          return;
        }
        const venue = await venueRes.json();
        if (cancelled) return;
        setVenueName(venue.name || "");

        const savedPhone = localStorage.getItem(storageKey(venueCode));
        if (savedPhone) {
          const data = await fetchBalance(savedPhone);
          if (cancelled) return;
          if (data) {
            setBalanceData(data);
            setScreen("balance");
            return;
          }
          localStorage.removeItem(storageKey(venueCode));
        }

        setScreen("landing");
      } catch {
        if (!cancelled) setVenueError(true);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [venueCode, fetchBalance]);

  const handleIdentified = useCallback(
    (data: BalanceData, phone: string) => {
      localStorage.setItem(storageKey(venueCode), phone);
      setBalanceData(data);
      setVenueName(data.venueName || venueName);
      setScreen("balance");
    },
    [venueCode, venueName]
  );

  const handleRefresh = useCallback(async () => {
    const phone = localStorage.getItem(storageKey(venueCode));
    if (!phone) return;
    setRefreshing(true);
    try {
      const data = await fetchBalance(phone);
      if (data) {
        setBalanceData(data);
      }
    } finally {
      setRefreshing(false);
    }
  }, [venueCode, fetchBalance]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(storageKey(venueCode));
    setBalanceData(null);
    setScreen("landing");
  }, [venueCode]);

  if (venueError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0e0e0e] px-6 text-center">
        <p className="text-lg font-semibold text-white">Venue not found</p>
        <p className="mt-2 text-sm text-neutral-500">
          This link may be invalid or the venue is no longer active.
        </p>
      </div>
    );
  }

  if (screen === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0e0e0e]">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (screen === "landing") {
    return (
      <LandingState
        venueCode={venueCode}
        venueName={venueName}
        onIdentified={handleIdentified}
      />
    );
  }

  if (screen === "balance" && balanceData) {
    return (
      <BalanceScreen
        data={balanceData}
        onRefresh={handleRefresh}
        onLogout={handleLogout}
        refreshing={refreshing}
      />
    );
  }

  return null;
}
