"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { IdentifyState } from "./IdentifyState";
import { VenuePicker } from "./VenuePicker";
import { BalanceScreen } from "./BalanceScreen";
import type { BalanceData, VenueInfo, IdentifyResult, StickerData } from "./types";

type Screen = "loading" | "identify" | "pick-venue" | "balance";

const SESSION_KEY = "cf_balance_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CachedSession {
  phone: string;
  playerName: string;
  venues: VenueInfo[];
  identifiedAt: number;
  venuesRefreshedAt: number;
}

function loadSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CachedSession;
    if (Date.now() - session.identifiedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: CachedSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    // Also clean up old per-venue keys from the previous implementation
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("cf_balance_phone")) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export default function MyBalancePage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [playerName, setPlayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stickerData, setStickerData] = useState<StickerData | null>(null);
  const [stickerToken, setStickerToken] = useState<string | null>(null);
  const [stickerPaid, setStickerPaid] = useState(false);
  const [stickerExpiredNotice, setStickerExpiredNotice] = useState(false);

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

  // Silently refresh the venues list in the background using the cached phone.
  // This ensures new packages/venues picked up by the player are reflected.
  const refreshVenuesInBackground = useCallback(
    async (cachedPhone: string, session: CachedSession) => {
      try {
        const params = new URLSearchParams({ phone: cachedPhone });
        const res = await fetch(`/api/balance/identify?${params}`);
        if (!res.ok) return;
        const data: IdentifyResult = await res.json();
        if (!data.found || !data.venues) return;
        const updatedSession: CachedSession = {
          ...session,
          venues: data.venues,
          venuesRefreshedAt: Date.now(),
        };
        saveSession(updatedSession);
        setVenues(data.venues);
      } catch {}
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Check for sticker_token in URL — bypass normal identify flow
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("sticker_token");

      if (token) {
        try {
          const res = await fetch(`/api/player/sticker-session?token=${encodeURIComponent(token)}`);
          if (!cancelled) {
            if (res.ok) {
              const data = await res.json() as StickerData;
              setStickerData(data);
              setStickerToken(token);
              setStickerPaid(urlParams.get("paid") === "true");
              // Jump straight to balance screen with a minimal BalanceData shell
              setBalanceData({
                found: true,
                venueName: "",
                playerName: data.playerName,
                subscription: null,
                lastCheckIn: null,
                totalSessions: 0,
              });
              setScreen("balance");
              return;
            } else if (res.status === 401) {
              setStickerExpiredNotice(true);
            }
            // 404 or other — fall through silently
          }
        } catch {
          // network error — fall through to normal flow
        }
      }

      const session = loadSession();

      if (!session) {
        if (!cancelled) setScreen("identify");
        return;
      }

      // Session is valid — restore state immediately
      if (!cancelled) {
        setPhone(session.phone);
        setPlayerName(session.playerName);
        setVenues(session.venues);

        if (session.venues.length > 1) {
          setScreen("pick-venue");
        } else if (session.venues.length === 1) {
          const data = await fetchBalanceForVenue(session.phone, session.venues[0].id);
          if (cancelled) return;
          if (data) {
            setBalanceData(data);
            setScreen("balance");
          } else {
            setScreen("identify");
          }
        } else {
          setScreen("identify");
        }
      }

      // Always silently refresh venues in the background to catch new packages/venues
      if (!cancelled) {
        refreshVenuesInBackground(session.phone, session);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [fetchBalanceForVenue, refreshVenuesInBackground]);

  const handleIdentified = useCallback(
    (result: IdentifyResult, identifiedPhone: string) => {
      const sessionVenues = result.venues ?? [];
      const session: CachedSession = {
        phone: identifiedPhone,
        playerName: result.playerName ?? "",
        venues: sessionVenues,
        identifiedAt: Date.now(),
        venuesRefreshedAt: Date.now(),
      };
      saveSession(session);
      setPhone(identifiedPhone);
      setPlayerName(result.playerName ?? "");
      setVenues(sessionVenues);

      if (sessionVenues.length > 1) {
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
    clearSession();
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
      const venue = venues.find((v) => v.name === balanceData.venueName) ?? venues[0];
      if (!venue) return;
      const data = await fetchBalanceForVenue(phone, venue.id);
      if (data) setBalanceData(data);
    } finally {
      setRefreshing(false);
    }
  }, [phone, balanceData, venues, fetchBalanceForVenue]);

  if (screen === "loading") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ background: "var(--bal-bg)" }}
      >
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--bal-dimmed)" }} />
      </div>
    );
  }

  if (screen === "identify") {
    return (
      <>
        {stickerExpiredNotice && (
          <div
            style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 12,
              padding: "10px 16px",
              fontSize: 14,
              color: "#9ca3af",
              zIndex: 9999,
              maxWidth: "90vw",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Your kiosk session expired — please identify yourself.
            <button
              onClick={() => setStickerExpiredNotice(false)}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
        <IdentifyState onIdentified={handleIdentified} />
      </>
    );
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
        showBackToVenues={venues.length > 1}
        stickerData={stickerData}
        stickerToken={stickerToken ?? undefined}
        stickerPaid={stickerPaid}
      />
    );
  }

  return null;
}
