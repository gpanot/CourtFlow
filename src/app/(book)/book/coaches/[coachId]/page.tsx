"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { usePlayerVenue } from "../../components/PlayerVenueContext";

interface Package {
  id: string;
  name: string;
  description: string | null;
  priceInCents: number;
  durationMin: number;
  lessonType: string;
  sessionsIncluded: number;
}

interface CoachProfile {
  id: string;
  name: string;
  coachBio: string | null;
  coachPhoto: string | null;
  packages: Package[];
  availability: { hour: number; available: boolean }[];
}

function formatPrice(p: number) {
  return new Intl.NumberFormat("vi-VN").format(p) + " VND";
}

function formatHour(h: number) {
  return `${h.toString().padStart(2, "0")}:00`;
}

export default function CoachProfilePage() {
  const { coachId } = useParams<{ coachId: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [coach, setCoach] = useState<CoachProfile | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [availability, setAvailability] = useState<{ hour: number; available: boolean }[]>([]);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [step, setStep] = useState<"profile" | "booking" | "summary">("profile");

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const vq = playerVenueId ? `venueId=${playerVenueId}` : "";

  useEffect(() => {
    const q = vq ? `?${vq}` : "";
    fetch(`/api/public/coaches/${coachId}${q}`).then((r) => r.json()).then(setCoach);
  }, [coachId, vq]);

  const loadAvailability = useCallback(
    async (date: Date) => {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const extra = vq ? `&${vq}` : "";
      const res = await fetch(`/api/public/coaches/${coachId}?date=${dateStr}${extra}`);
      const data = await res.json();
      setAvailability(data.availability || []);
    },
    [coachId, vq]
  );

  useEffect(() => {
    if (selectedDate) loadAvailability(selectedDate);
  }, [selectedDate, loadAvailability]);

  function startBooking(pkg: Package) {
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book/coaches/${coachId}`);
      return;
    }
    setSelectedPkg(pkg);
    setSelectedDate(dates[0]);
    setSelectedHour(null);
    setStep("booking");
  }

  function goToSummary() {
    if (!selectedHour || !selectedDate || !selectedPkg) return;
    setStep("summary");
  }

  async function confirmBooking(payWithCredit?: boolean, creditId?: string) {
    if (!selectedPkg || !selectedDate || selectedHour === null) return;
    setBooking(true);
    setBookingError(null);

    const startTime = new Date(selectedDate);
    startTime.setHours(selectedHour, 0, 0, 0);

    try {
      const res = await portalFetch("/api/public/coach-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          packageId: selectedPkg.id,
          date: selectedDate.toISOString(),
          startTime: startTime.toISOString(),
          payWithCredit,
          creditId,
          venueId: playerVenueId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");

      if (data.paidWithCredit) {
        router.push("/book/bookings");
      } else {
        const expires = data.payment?.holdExpiresAt ? `?holdExpires=${encodeURIComponent(data.payment.holdExpiresAt)}` : "";
        router.push(`/book/pay/lesson/${data.lesson.id}${expires}`);
      }
    } catch (e) {
      setBookingError((e as Error).message);
      setBooking(false);
    }
  }

  if (!coach) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;
  }

  const chipCls = (active: boolean) =>
    `flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
      active
        ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
        : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
    }`;

  if (step === "booking" && selectedPkg) {
    return (
      <div className="px-6 pt-8 pb-8">
        <button onClick={() => setStep("profile")} className="text-sm text-[var(--cm-text-sec)] mb-4">
          ← Back
        </button>
        <h2 className="text-lg font-bold mb-1">Book with {coach.name}</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-4">
          {selectedPkg.name} · {selectedPkg.durationMin} min
        </p>

        <label className="block text-sm font-medium mb-2">Select date</label>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {dates.map((d) => (
            <button
              key={d.toISOString()}
              onClick={() => { setSelectedDate(d); setSelectedHour(null); }}
              className={chipCls(selectedDate?.toDateString() === d.toDateString())}
            >
              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium mb-2">Available times</label>
        {availability.length === 0 ? (
          <p className="text-sm text-[var(--cm-text-sec)] py-4">Loading availability...</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {availability.map((slot) => (
              <button
                key={slot.hour}
                disabled={!slot.available}
                onClick={() => setSelectedHour(slot.hour)}
                className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  selectedHour === slot.hour
                    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                    : slot.available
                    ? "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
                    : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] border-transparent cursor-not-allowed"
                }`}
              >
                {formatHour(slot.hour)}
              </button>
            ))}
          </div>
        )}

        {selectedHour !== null && selectedDate && (
          <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-4 text-sm">
            <p>
              <strong>Selected:</strong>{" "}
              {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })},{" "}
              {formatHour(selectedHour)}–{formatHour(selectedHour + Math.ceil(selectedPkg.durationMin / 60))}
            </p>
            <p className="text-[var(--cm-text-sec)] text-xs mt-1">Court: auto-assigned</p>
          </div>
        )}

        <button
          onClick={goToSummary}
          disabled={selectedHour === null}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  if (step === "summary" && selectedPkg && selectedDate && selectedHour !== null) {
    return (
      <CoachSessionSummary
        coach={coach}
        pkg={selectedPkg}
        date={selectedDate}
        hour={selectedHour}
        booking={booking}
        bookingError={bookingError}
        onBack={() => setStep("booking")}
        onConfirm={confirmBooking}
      />
    );
  }

  return (
    <div className="pb-8">
      <div className="px-4 pt-8">
        <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
          ← Back
        </button>
      </div>

      <div className="px-4 mb-6">
        <div className="flex items-center gap-4 mb-4">
          {coach.coachPhoto ? (
            <img src={coach.coachPhoto} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-3xl">
              🎓
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{coach.name}</h1>
          </div>
        </div>
        {coach.coachBio && (
          <>
            <h2 className="text-sm font-semibold mb-1">About</h2>
            <p className="text-sm text-[var(--cm-text-sec)] mb-4">{coach.coachBio}</p>
          </>
        )}
      </div>

      <div className="px-4 mb-6">
        <h2 className="text-base font-semibold mb-3">Session Packages</h2>
        <div className="space-y-3">
          {coach.packages.map((pkg) => (
            <div key={pkg.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{pkg.name}</p>
                <p className="text-xs text-[var(--cm-text-sec)]">
                  {pkg.durationMin} min · {formatPrice(pkg.priceInCents)}
                </p>
              </div>
              <button
                onClick={() => startBooking(pkg)}
                className="px-4 py-2 bg-[var(--cm-accent)] text-black rounded-lg text-xs font-medium"
              >
                Book →
              </button>
            </div>
          ))}
        </div>
      </div>

      {coach.packages.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-base font-semibold mb-3">Credit Packs</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {[1, 5, 10].map((qty) => {
              const basePkg = coach.packages[0];
              const discount = qty === 5 ? 10 : qty === 10 ? 20 : 0;
              const total = Math.round(basePkg.priceInCents * qty * (1 - discount / 100));
              return (
                <button
                  key={qty}
                  onClick={() => {
                    if (status !== "authenticated") {
                      router.push(`/book/login?callbackUrl=/book/coaches/${coachId}`);
                      return;
                    }
                    const params = new URLSearchParams({
                      coachId,
                      packageId: basePkg.id,
                      qty: String(qty),
                      total: String(total),
                      discount: String(discount),
                    });
                    router.push(`/book/coaches/${coachId}/buy-credits?${params}`);
                  }}
                  className="flex-shrink-0 w-28 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 text-center"
                >
                  <p className="text-lg font-bold">{qty}x</p>
                  <p className="text-xs font-medium">{formatPrice(total)}</p>
                  {discount > 0 && (
                    <p className="text-[10px] text-[var(--cm-green)] font-medium">{discount}% off</p>
                  )}
                  <p className="text-[10px] text-[var(--cm-accent)] mt-1 font-medium">Buy</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CoachSessionSummary({
  coach,
  pkg,
  date,
  hour,
  booking: isBooking,
  bookingError,
  onBack,
  onConfirm,
}: {
  coach: CoachProfile;
  pkg: Package;
  date: Date;
  hour: number;
  booking: boolean;
  bookingError: string | null;
  onBack: () => void;
  onConfirm: (payWithCredit?: boolean, creditId?: string) => void;
}) {
  const [credits, setCredits] = useState<{ id: string; remaining: number }[]>([]);

  useEffect(() => {
    portalFetch("/api/public/account")
      .then((r) => r.json())
      .then((data) => {
        const coachCredits = (data.coachCredits || [])
          .filter(
            (c: { coach?: { name: string }; totalSessions: number; usedSessions: number; expiresAt: string }) =>
              c.totalSessions - c.usedSessions > 0 && new Date(c.expiresAt) > new Date()
          )
          .map((c: { id: string; totalSessions: number; usedSessions: number }) => ({
            id: c.id,
            remaining: c.totalSessions - c.usedSessions,
          }));
        setCredits(coachCredits);
      })
      .catch(() => {});
  }, []);

  const hasCredits = credits.length > 0;
  const totalRemaining = credits.reduce((s, c) => s + c.remaining, 0);

  return (
    <div className="px-6 pt-8 pb-8">
      <button onClick={onBack} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← Back
      </button>
      <h2 className="text-lg font-bold mb-4">Session Summary</h2>

      {bookingError && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{bookingError}</div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2 text-sm">
        <Row label="Coach" value={coach.name} />
        <Row label="Package" value={pkg.name} />
        <Row label="Date" value={date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} />
        <Row label="Time" value={`${formatHour(hour)} – ${formatHour(hour + Math.ceil(pkg.durationMin / 60))}`} />
        <Row label="Court" value="Auto-assigned" />
        <div className="border-t border-[var(--cm-border)] pt-2 mt-2">
          <Row label="Total" value={formatPrice(pkg.priceInCents)} bold />
        </div>
      </div>

      {hasCredits && (
        <button
          onClick={() => onConfirm(true, credits[0].id)}
          disabled={isBooking}
          className="w-full py-3 bg-[var(--cm-green)] text-white rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
        >
          {isBooking ? "Booking..." : `Pay with Credit (${totalRemaining} left)`}
        </button>
      )}

      <button
        onClick={() => onConfirm(false)}
        disabled={isBooking}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
      >
        {isBooking ? "Booking..." : `Pay with VietQR (${formatPrice(pkg.priceInCents)})`}
      </button>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
