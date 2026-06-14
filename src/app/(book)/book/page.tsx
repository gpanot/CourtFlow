"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePlayerSession } from "./components/usePlayerSession";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { usePlayerVenue } from "./components/PlayerVenueContext";
import { useBookFormatters } from "./lib/useBookFormatters";
import { BookTabTopBar } from "./components/BookTabTopBar";

interface Slot {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
}

interface CourtSlot {
  courtId: string;
  courtLabel: string;
  slots: Slot[];
}

interface OpenPlaySession {
  entryId: string;
  title: string;
  startTime: string;
  endTime: string;
  courtIds: string[];
  maxPlayers: number;
  priceValue: number;
  spotsLeft: number;
  spotsTaken: number;
}

interface VenueInfo {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
  bookingConfig: {
    pricingRules: { dayOfWeek: number; startHour: number; endHour: number; priceValue: number }[];
    defaultPriceValue: number;
  };
}

interface Coach {
  id: string;
  name: string;
  coachPhoto: string | null;
  startingPrice: number;
}

const MAX_SLOTS = 4;

type BookingType = "court" | "open_play";

function formatHour(h: number) {
  return `${h.toString().padStart(2, "0")}:00`;
}

function sessionDurationHours(startTime: string, endTime: string): number {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60)));
}

function capacityFillPct(spotsTaken: number, maxPlayers: number): number {
  if (maxPlayers <= 0) return 0;
  return Math.min(100, (spotsTaken / maxPlayers) * 100);
}

function capacityBarColor(pct: number, isFull: boolean): string {
  if (isFull) return "bg-[var(--cm-red)]";
  if (pct >= 60) return "bg-[var(--cm-orange)]";
  if (pct > 0) return "bg-[var(--cm-green)]";
  return "";
}

function capacityLabelColor(pct: number, isFull: boolean): string {
  if (isFull) return "text-[var(--cm-red)]";
  if (pct >= 60) return "text-[var(--cm-orange)]";
  return "text-[var(--cm-text-sec)]";
}

export default function VenueHomePage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [grid, setGrid] = useState<CourtSlot[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [openPlaySessions, setOpenPlaySessions] = useState<OpenPlaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingType, setBookingType] = useState<BookingType>("court");

  // Multi-slot selection: courtId + array of selected slots
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const vq = playerVenueId ? `&venueId=${playerVenueId}` : "";

  const loadGrid = useCallback(async (date: Date) => {
    setLoading(true);
    setSelectedCourtId(null);
    setSelectedSlots([]);
    try {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/public/availability?date=${dateStr}${vq}`);
      const data = await res.json();
      setGrid(Array.isArray(data) ? data : []);
      // Load open play sessions for the same date
      const venueQ = playerVenueId ? `&venueId=${playerVenueId}` : "";
      fetch(`/api/public/open-play?date=${dateStr}${venueQ}`)
        .then(async (r) => {
          const d = await r.json();
          const sessions = r.ok && Array.isArray(d) ? d : [];
          sessions.sort(
            (a: OpenPlaySession, b: OpenPlaySession) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );
          setOpenPlaySessions(sessions);
        })
        .catch(() => setOpenPlaySessions([]));
    } catch {
      setGrid([]);
      setOpenPlaySessions([]);
    }
    setLoading(false);
  }, [vq, playerVenueId]);

  useEffect(() => {
    const q = playerVenueId ? `?venueId=${playerVenueId}` : "";
    fetch(`/api/public/venue${q}`).then((r) => r.json()).then(setVenue);
    fetch(`/api/public/coaches${q}`).then((r) => r.json()).then((d) => setCoaches(d.slice?.(0, 3) ?? [])).catch(() => {});
  }, [playerVenueId]);

  useEffect(() => {
    loadGrid(selectedDate);
  }, [selectedDate, loadGrid]);

  function isSlotSelected(courtId: string, slot: Slot) {
    return selectedCourtId === courtId && selectedSlots.some((s) => s.startTime === slot.startTime);
  }

  function areConsecutive(slots: Slot[]) {
    if (slots.length <= 1) return true;
    const sorted = [...slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (new Date(sorted[i].startTime).getTime() !== new Date(sorted[i - 1].endTime).getTime()) {
        return false;
      }
    }
    return true;
  }

  function toggleSlot(courtId: string, slot: Slot) {
    if (!slot.available) return;

    // Switching courts -> reset
    if (selectedCourtId && selectedCourtId !== courtId) {
      setSelectedCourtId(courtId);
      setSelectedSlots([slot]);
      return;
    }

    if (!selectedCourtId) {
      setSelectedCourtId(courtId);
      setSelectedSlots([slot]);
      return;
    }

    const alreadySelected = selectedSlots.some((s) => s.startTime === slot.startTime);
    if (alreadySelected) {
      const remaining = selectedSlots.filter((s) => s.startTime !== slot.startTime);
      if (remaining.length === 0) {
        setSelectedCourtId(null);
        setSelectedSlots([]);
      } else {
        setSelectedSlots(remaining);
      }
      return;
    }

    if (selectedSlots.length >= MAX_SLOTS) return;

    const candidate = [...selectedSlots, slot];
    if (areConsecutive(candidate)) {
      setSelectedSlots(candidate);
    }
  }

  const sortedSelected = [...selectedSlots].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const totalPrice = sortedSelected.reduce((sum, s) => sum + s.priceValue, 0);
  const hasSelection = sortedSelected.length > 0 && selectedCourtId;

  function handleBook() {
    if (!hasSelection) return;
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book`);
      return;
    }
    const first = sortedSelected[0];
    const params = new URLSearchParams({
      courtId: selectedCourtId!,
      date: selectedDate.toISOString(),
      startTime: first.startTime,
      slotCount: String(sortedSelected.length),
      price: String(totalPrice),
    });
    router.push(`/book/confirm?${params.toString()}`);
  }

  function handleOpenPlayJoin(session: OpenPlaySession) {
    if (session.spotsLeft === 0) return;
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book`);
      return;
    }
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({
      scheduleEntryId: session.entryId,
      date: dateStr,
      title: session.title,
      price: String(session.priceValue),
    });
    router.push(`/book/open-play/confirm?${params.toString()}`);
  }

  function selectBookingType(type: BookingType) {
    setBookingType(type);
    if (type === "open_play") {
      setSelectedCourtId(null);
      setSelectedSlots([]);
    }
  }

  const courtLabel = hasSelection
    ? grid.find((c) => c.courtId === selectedCourtId)?.courtLabel ?? ""
    : "";
  const firstHour = sortedSelected.length > 0 ? formatHour(sortedSelected[0].hour) : "";
  const lastEnd = sortedSelected.length > 0
    ? formatHour(new Date(sortedSelected[sortedSelected.length - 1].endTime).getHours())
    : "";

  return (
    <div>
      <BookTabTopBar title={venue?.name ?? t("common.loading")} />

      <div className="px-4 pb-4">
        <h2 className="text-base font-semibold mb-3">{t("home.whatToBook")}</h2>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["court", "open_play"] as const).map((type) => {
            const active = bookingType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectBookingType(type)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                    : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)] hover:border-[var(--cm-accent)]/40"
                }`}
              >
                {type === "court" ? t("home.bookingTypeCourt") : t("home.bookingTypeOpenPlay")}
              </button>
            );
          })}
        </div>

        <h3 className="text-sm font-medium text-[var(--cm-text-sec)] mb-2">{t("home.selectDate")}</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {dates.map((d) => {
            const isActive = d.toDateString() === selectedDate.toDateString();
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDate(d)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  isActive
                    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                    : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
                }`}
              >
                {formatDate(d)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 mb-6">
        {loading ? (
          <div className="h-40 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
        ) : bookingType === "court" ? (
          grid.length === 0 ? (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-8">
              {t("home.noCourts")}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--cm-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--cm-bg-surface)]">
                      <th className="sticky left-0 bg-[var(--cm-bg-surface)] z-10 px-3 py-2 text-left font-medium text-[var(--cm-text-sec)] min-w-[80px]">
                        {t("common.court")}
                      </th>
                      {grid[0]?.slots.map((s) => (
                        <th key={s.startTime} className="px-2 py-2 text-center font-medium text-[var(--cm-text-sec)] min-w-[48px]">
                          {formatHour(s.hour)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((court) => (
                      <tr key={court.courtId} className="border-t border-[var(--cm-border)]">
                        <td className="sticky left-0 bg-[var(--cm-bg)] z-10 px-3 py-2 font-medium">
                          {court.courtLabel}
                        </td>
                        {court.slots.map((slot) => {
                          const isSel = isSlotSelected(court.courtId, slot);
                          return (
                            <td key={slot.startTime} className="px-1 py-1 text-center">
                              <button
                                onClick={() => toggleSlot(court.courtId, slot)}
                                disabled={!slot.available}
                                className={`w-10 h-8 rounded-lg text-[10px] font-medium transition-colors ${
                                  isSel
                                    ? "bg-[var(--cm-accent)] text-black"
                                    : slot.available
                                    ? "bg-[var(--cm-green)]/15 text-[var(--cm-green)] hover:bg-[var(--cm-green)]/25"
                                    : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] cursor-not-allowed"
                                }`}
                              >
                                {slot.available ? formatHour(slot.hour) : "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-[var(--cm-text-muted)]">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-green)]/15" /> {t("home.available")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-bg-surface)]" /> {t("home.booked")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-accent)]" /> {t("home.selected")}</span>
              </div>
              {hasSelection && (
                <p className="text-xs text-[var(--cm-text-sec)] mt-2">
                  {t("home.slotsSelected", { count: sortedSelected.length })}
                  {sortedSelected.length < MAX_SLOTS && t("home.extendHint")}
                </p>
              )}
            </>
          )
        ) : openPlaySessions.length === 0 ? (
          <p className="text-sm text-[var(--cm-text-sec)] text-center py-8">
            {t("home.noOpenPlay")}
          </p>
        ) : (
          <div className="space-y-3">
            {openPlaySessions.map((session) => {
              const isFull = session.spotsLeft === 0;
              const fillPct = capacityFillPct(session.spotsTaken, session.maxPlayers);
              const hours = sessionDurationHours(session.startTime, session.endTime);
              const priceLabel = session.priceValue > 0 ? formatPrice(session.priceValue) : t("home.openPlayFree");
              return (
                <div
                  key={session.entryId}
                  className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold leading-snug">{session.title}</p>
                    <p className="text-sm font-bold text-[var(--cm-accent)] shrink-0">{priceLabel}</p>
                  </div>
                  <p className="text-sm text-[var(--cm-text-sec)] mb-1">
                    {formatTime(session.startTime)} – {formatTime(session.endTime)}{" "}
                    <span className="text-[var(--cm-text-muted)]">
                      ({t("home.durationHours", { count: hours })})
                    </span>
                  </p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--cm-border)] overflow-hidden">
                      {session.spotsTaken > 0 && (
                        <div
                          className={`h-full rounded-full transition-all ${capacityBarColor(fillPct, isFull)}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold tabular-nums shrink-0 ${capacityLabelColor(fillPct, isFull)}`}
                    >
                      {session.spotsTaken}/{session.maxPlayers}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenPlayJoin(session)}
                    disabled={isFull}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isFull
                        ? "bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-red)] cursor-not-allowed"
                        : "bg-[var(--cm-accent)] text-black"
                    }`}
                  >
                    {isFull ? t("home.openPlayFullCta") : t("home.openPlayJoin")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {coaches.length > 0 && (
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">{t("home.ourCoaches")}</h2>
            <Link href="/book/coaches" className="text-sm text-[var(--cm-accent)] font-medium">
              {t("common.seeAll")}
            </Link>
          </div>
          <div className="space-y-2">
            {coaches.map((c) => (
              <Link
                key={c.id}
                href={`/book/coaches/${c.id}`}
                className="flex items-center gap-3 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3"
              >
                {c.coachPhoto ? (
                  <img src={c.coachPhoto} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-sm">
                    🎓
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-[var(--cm-text-sec)]">
                    {t("common.from")} {formatPrice(c.startingPrice)}
                  </p>
                </div>
                <span className="text-[var(--cm-accent)] text-sm">{t("common.bookArrow")}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasSelection && bookingType === "court" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-lg mx-auto pointer-events-none">
          <div
            className="pointer-events-auto px-4 pt-3 pb-[calc(0.75rem+3.625rem+env(safe-area-inset-bottom))]"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <button
              onClick={handleBook}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm shadow-[var(--cm-shadow)]"
            >
              {t("home.bookCourtCta", {
                court: courtLabel,
                time: `${firstHour}–${lastEnd}`,
                price: formatPrice(totalPrice),
              })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
