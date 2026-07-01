"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Award, BarChart2, Star, Target, Languages, Users, GraduationCap } from "lucide-react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../lib/useBookFormatters";
import { toDateKey } from "@/lib/date";
import { hasGroupPlayerPricing, calculateSessionPrice } from "@/lib/coach-package-pricing";

interface Package {
  id: string;
  name: string;
  description: string | null;
  priceValue: number;
  durationMin: number;
  lessonType: string;
  sessionsIncluded: number;
  minPlayers: number | null;
  maxPlayers: number | null;
  pricePerAdditionalPlayer: number | null;
}

interface AvailSlot {
  hour: number;
  available: boolean;
  bookingStatus: string | null; // "confirmed" | "pending_approval" | null
}

interface CoachProfile {
  id: string;
  name: string;
  coachBio: string | null;
  coachPhoto: string | null;
  coachDupr: string | null;
  coachGender: string | null;
  coachLanguages: string[];
  coachSpecialties: string[];
  coachFocusLevels: string[];
  coachYearsExperience: string | null;
  coachGroupSizes: string[];
  packages: Package[];
  availability: AvailSlot[];
}

interface OtherCoach {
  id: string;
  name: string;
  coachBio: string | null;
  coachPhoto: string | null;
  startingPrice: number;
}

function formatHour(h: number) {
  return `${h.toString().padStart(2, "0")}:00`;
}

function formatPackageDuration(durationMin: number): string {
  if (durationMin % 60 === 0) return `${durationMin / 60}h`;
  return `${durationMin} min`;
}

export default function CoachProfilePage() {
  const { coachId } = useParams<{ coachId: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDate, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [coach, setCoach] = useState<CoachProfile | null>(null);
  const [coachError, setCoachError] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [availability, setAvailability] = useState<AvailSlot[]>([]);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [step, setStep] = useState<"profile" | "booking" | "summary">("profile");
  const [otherCoaches, setOtherCoaches] = useState<OtherCoach[]>([]);
  const [playerCount, setPlayerCount] = useState<number>(2);
  const MAX_COACH_SLOTS = 4;

  // Computed client-side only to avoid SSR/hydration date mismatch
  const [dates, setDates] = useState<Date[]>([]);
  useEffect(() => {
    const d: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date();
      day.setDate(day.getDate() + i);
      day.setHours(0, 0, 0, 0);
      d.push(day);
    }
    setDates(d);
  }, []);

  const vq = playerVenueId ? `venueId=${playerVenueId}` : "";

  useEffect(() => {
    const q = vq ? `?${vq}` : "";
    fetch(`/api/public/coaches/${coachId}${q}`)
      .then((r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((data) => {
        setCoach({
          ...data,
          packages: data.packages ?? [],
          availability: data.availability ?? [],
          coachLanguages: data.coachLanguages ?? [],
          coachSpecialties: data.coachSpecialties ?? [],
          coachFocusLevels: data.coachFocusLevels ?? [],
          coachGroupSizes: data.coachGroupSizes ?? [],
        });
      })
      .catch(() => setCoachError(true));
  }, [coachId, vq]);

  // Fetch sibling coaches to power the "Other recommended coaches" section
  useEffect(() => {
    const q = vq ? `?${vq}` : "";
    fetch(`/api/public/coaches${q}`)
      .then((r) => r.json())
      .then((list: OtherCoach[]) => {
        setOtherCoaches(list.filter((c) => c.id !== coachId).slice(0, 3));
      })
      .catch(() => {});
  }, [coachId, vq]);

  const loadAvailability = useCallback(
    async (date: Date) => {
      try {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const extra = vq ? `&${vq}` : "";
        // Use portalFetch so the player's auth token is sent — required to show
        // their own booking status (Confirmed / Pending) on slots they already booked.
        const res = await portalFetch(`/api/public/coaches/${coachId}?date=${dateStr}${extra}`);
        if (!res.ok) return;
        const data = await res.json();
        setAvailability(data.availability ?? []);
      } catch {
        // Non-fatal — leave existing availability state unchanged
      }
    },
    [coachId, vq]
  );

  useEffect(() => {
    if (selectedDate) loadAvailability(selectedDate);
  }, [selectedDate, loadAvailability]);

  function toggleHour(hour: number) {
    setSelectedHours((prev) => {
      if (prev.includes(hour)) {
        // Deselecting: remove this hour and everything after it (keep consecutive from start)
        const idx = prev.indexOf(hour);
        return prev.slice(0, idx);
      }
      // Adding: only allow consecutive
      const sorted = [...prev, hour].sort((a, b) => a - b);
      // Check all consecutive
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) return prev; // not consecutive, ignore
      }
      if (sorted.length > MAX_COACH_SLOTS) return prev;
      return sorted;
    });
  }

  function startBooking(pkg: Package) {
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book/coaches/${coachId}`);
      return;
    }
    setSelectedPkg(pkg);
    setSelectedDate(dates[0]);
    setSelectedHours([]);
    setPlayerCount(pkg.minPlayers ?? 2);
    setStep("booking");
  }

  function goToSummary() {
    if (selectedHours.length === 0 || !selectedDate || !selectedPkg) return;
    setStep("summary");
  }

  async function confirmBooking(payWithCredit?: boolean, creditId?: string) {
    if (!selectedPkg || !selectedDate || selectedHours.length === 0) return;
    setBooking(true);
    setBookingError(null);

    const startHour = Math.min(...selectedHours);
    const startTime = new Date(selectedDate);
    startTime.setHours(startHour, 0, 0, 0);

    try {
      const res = await portalFetch("/api/public/coach-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          packageId: selectedPkg.id,
          date: toDateKey(selectedDate),
          startTime: startTime.toISOString(),
          slotCount: selectedHours.length,
          payWithCredit,
          creditId,
          venueId: playerVenueId || undefined,
          ...(hasGroupPlayerPricing(selectedPkg) ? { playerCount } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("coaches.bookingFailed"));

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

  if (coachError) {
    return (
      <div className="px-4 pt-12 text-center space-y-3">
        <p className="text-2xl">😕</p>
        <p className="font-semibold">{t("coaches.notFound", "Coach not found")}</p>
        <p className="text-sm text-[var(--cm-text-sec)]">
          {t("coaches.notFoundHint", "This coach may no longer be available.")}
        </p>
        <button
          onClick={() => router.push("/book/coaches")}
          className="mt-4 px-5 py-2.5 bg-[var(--cm-accent)] text-black rounded-xl text-sm font-medium"
        >
          {t("coaches.browseCoaches", "Browse coaches")}
        </button>
      </div>
    );
  }

  if (!coach) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const chipCls = (active: boolean) =>
    `flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
      active
        ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
        : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
    }`;

  if (step === "booking" && selectedPkg) {
    const slotDurationH = Math.ceil(selectedPkg.durationMin / 60);
    const startHour = selectedHours.length > 0 ? Math.min(...selectedHours) : null;
    const endHour = selectedHours.length > 0 ? Math.max(...selectedHours) + slotDurationH : null;
    const isGroupPkg = hasGroupPlayerPricing(selectedPkg);
    const totalSlotPrice = isGroupPkg
      ? calculateSessionPrice(selectedPkg, { playerCount, slotCount: Math.max(1, selectedHours.length) })
      : selectedPkg.priceValue * selectedHours.length;

    return (
      <div className="px-6 pt-8 pb-8">
        <button onClick={() => setStep("profile")} className="text-sm text-[var(--cm-text-sec)] mb-4">
          ← {t("common.back")}
        </button>
        <h2 className="text-lg font-bold mb-1">{t("coaches.bookWith", { name: coach.name })}</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-4">
          {selectedPkg.name} · {formatPackageDuration(selectedPkg.durationMin)}
        </p>

        {/* Player count stepper for scalable group packages */}
        {isGroupPkg && (
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2">{t("coaches.howManyPlayers")}</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {Array.from(
                { length: (selectedPkg.maxPlayers ?? 8) - (selectedPkg.minPlayers ?? 2) + 1 },
                (_, i) => (selectedPkg.minPlayers ?? 2) + i
              ).map((n) => (
                <button
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    playerCount === n
                      ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                      : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--cm-text-muted)]">{t("coaches.groupPaymentNote")}</p>
          </div>
        )}

        <label className="block text-sm font-medium mb-2">{t("coaches.selectDate")}</label>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {dates.map((d) => (
            <button
              key={d.toISOString()}
              onClick={() => { setSelectedDate(d); setSelectedHours([]); }}
              className={chipCls(selectedDate?.toDateString() === d.toDateString())}
            >
              {formatDate(d)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">{t("coaches.availableTimes")}</label>
          <span className="text-xs text-[var(--cm-text-muted)]">
            {selectedHours.length > 0
              ? `${selectedHours.length}/${MAX_COACH_SLOTS} ${t("common.selected")}`
              : t("coaches.selectUpTo4Slots")}
          </span>
        </div>
        {availability.length === 0 ? (
          <p className="text-sm text-[var(--cm-text-sec)] py-4">{t("coaches.loadingAvailability")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {availability.map((slot) => {
              const isSel = selectedHours.includes(slot.hour);

              // ── My booking on this slot ──────────────────────────────────────
              if (slot.bookingStatus === "confirmed") {
                return (
                  <div key={slot.hour}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-teal-500/30 bg-teal-500/10 py-2.5 cursor-default select-none">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-teal-400">Confirmed</span>
                    <span className="text-xs text-teal-500/70">{formatHour(slot.hour)}</span>
                  </div>
                );
              }
              if (slot.bookingStatus === "pending_approval") {
                return (
                  <div key={slot.hour}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 cursor-default select-none">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Pending</span>
                    <span className="text-xs text-amber-500/70">{formatHour(slot.hour)}</span>
                  </div>
                );
              }

              // ── Blocked (booked by someone else / unavailable) ───────────────
              if (!slot.available) {
                return (
                  <div key={slot.hour}
                    className="rounded-xl border border-transparent bg-[var(--cm-bg-surface)] py-2.5 cursor-not-allowed" />
                );
              }

              // ── Consecutive check ────────────────────────────────────────────
              const wouldBeConsecutive = (() => {
                if (isSel) return true;
                if (selectedHours.length === 0) return true;
                const sorted = [...selectedHours, slot.hour].sort((a, b) => a - b);
                for (let i = 1; i < sorted.length; i++) {
                  if (sorted[i] !== sorted[i - 1] + 1) return false;
                }
                return true;
              })();
              const atMax = !isSel && selectedHours.length >= MAX_COACH_SLOTS;
              const softDisabled = atMax || (!isSel && !wouldBeConsecutive);

              // ── Available ────────────────────────────────────────────────────
              return (
                <button
                  key={slot.hour}
                  disabled={softDisabled}
                  onClick={() => toggleHour(slot.hour)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    isSel
                      ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                      : softDisabled
                      ? "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] border-[var(--cm-border)] opacity-40 cursor-not-allowed"
                      : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
                  }`}
                >
                  {formatHour(slot.hour)}
                </button>
              );
            })}
          </div>
        )}

        {selectedHours.length > 0 && selectedDate && startHour !== null && endHour !== null && (
          <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-4 text-sm">
            <p className="font-medium">
              {formatDate(selectedDate)} · {formatHour(startHour)}–{formatHour(endHour)}
            </p>
            <p className="text-[var(--cm-text-sec)] text-xs mt-0.5">{t("coaches.courtAutoAssigned")}</p>
            <p className="text-[var(--cm-accent)] text-xs font-medium mt-0.5">
              {t("coaches.estimatedTotal")}: {formatPrice(totalSlotPrice)}
              {selectedHours.length > 1 && !isGroupPkg && ` (${selectedHours.length} × ${formatPrice(selectedPkg.priceValue)})`}
            </p>
            {isGroupPkg && playerCount > 0 && (
              <p className="text-[var(--cm-text-sec)] text-xs mt-0.5">
                {t("coaches.onlyPerPlayer", { price: formatPrice(Math.round(totalSlotPrice / playerCount)) })}
              </p>
            )}
          </div>
        )}

        <button
          onClick={goToSummary}
          disabled={selectedHours.length === 0}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
        >
          {t("common.continue")}
        </button>
      </div>
    );
  }

  if (step === "summary" && selectedPkg && selectedDate && selectedHours.length > 0) {
    return (
      <CoachSessionSummary
        coach={coach}
        pkg={selectedPkg}
        date={selectedDate}
        hours={selectedHours}
        playerCount={playerCount}
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
          ← {t("common.back")}
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
            <h2 className="text-sm font-semibold mb-1">{t("common.about")}</h2>
            <p className="text-sm text-[var(--cm-text-sec)] mb-4">{coach.coachBio}</p>
          </>
        )}
      </div>

      <div className="px-4 mb-6">
        <h2 className="text-base font-semibold mb-3">{t("coaches.sessionPackages")}</h2>
        <div className="space-y-3">
          {coach.packages.map((pkg) => {
            const isScalableGroup = hasGroupPlayerPricing(pkg);
            const maxPlayers = pkg.maxPlayers ?? 8;
            const asLowAsPerPlayer = isScalableGroup
              ? Math.round(calculateSessionPrice(pkg, { playerCount: maxPlayers }) / maxPlayers)
              : null;

            return (
            <div key={pkg.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm">{pkg.name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    pkg.lessonType === "group"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-purple-500/20 text-purple-400"
                  }`}>
                    {pkg.lessonType === "group" ? t("coaches.group", "Group") : t("coaches.private", "Private")}
                  </span>
                </div>
                {isScalableGroup ? (
                  <div className="mt-0.5">
                    <p className="text-xs text-[var(--cm-text-sec)]">
                      {formatPackageDuration(pkg.durationMin)}
                    </p>
                    <p className="text-xs text-[var(--cm-text-sec)]">
                      {t("coaches.fromPriceForPlayers", { price: formatPrice(pkg.priceValue), count: pkg.minPlayers })}
                    </p>
                    <p className="text-[10px] text-[var(--cm-text-muted)]">
                      {t("coaches.plusPricePerExtraPlayer", { price: formatPrice(pkg.pricePerAdditionalPlayer ?? 0) })}
                      {pkg.maxPlayers ? ` · ${pkg.minPlayers}–${pkg.maxPlayers}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--cm-text-sec)]">
                    {formatPackageDuration(pkg.durationMin)} · {formatPrice(pkg.priceValue)}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end shrink-0">
                <button
                  onClick={() => startBooking(pkg)}
                  className="px-4 py-2 bg-[var(--cm-accent)] text-black rounded-lg text-xs font-medium"
                >
                  {t("common.bookArrow")}
                </button>
                {asLowAsPerPlayer != null && (
                  <p className="text-[10px] text-[var(--cm-text-muted)] mt-1 text-right whitespace-nowrap">
                    {t("coaches.asLowAsLabel")}{" "}
                    <span className="font-bold text-blue-500">
                      {formatPrice(asLowAsPerPlayer)}{t("coaches.perPlayerRateSuffix")}
                    </span>
                  </p>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {coach.packages.some((p) => p.lessonType === "private") && (
        <div className="px-4 mb-6">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-base font-semibold">{t("coaches.creditPacks")}</h2>
            <span className="text-[11px] text-[var(--cm-text-muted)]">{t("coaches.creditPacksPrivateOnly")}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {[1, 5, 10].map((qty) => {
              const basePkg = coach.packages.find((p) => p.lessonType === "private") ?? coach.packages[0];
              const discount = qty === 5 ? 10 : qty === 10 ? 20 : 0;
              const total = Math.round(basePkg.priceValue * qty * (1 - discount / 100));
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
                    <p className="text-[10px] text-[var(--cm-green)] font-medium">{t("coaches.percentOff", { discount })}</p>
                  )}
                  <p className="text-[10px] text-[var(--cm-accent)] mt-1 font-medium">{t("common.buy")}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── More about this coach ───────────────────────────────────── */}
      {(coach.coachYearsExperience ||
        coach.coachDupr ||
        coach.coachSpecialties.length > 0 ||
        coach.coachFocusLevels.length > 0 ||
        coach.coachLanguages.length > 0 ||
        coach.coachGroupSizes.length > 0) && (
        <div className="px-4 mb-6">
          <h2 className="text-base font-semibold mb-3">{t("coaches.moreAbout", "More about this coach")}</h2>
          <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 space-y-3 text-sm">
            {coach.coachYearsExperience && (
              <div className="flex gap-3">
                <GraduationCap className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-0.5">{t("coaches.experience", "Experience")}</p>
                  <p className="text-[var(--cm-text)]">{coach.coachYearsExperience}</p>
                </div>
              </div>
            )}
            {coach.coachDupr && (
              <div className="flex gap-3">
                <BarChart2 className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-0.5">{t("coaches.dupr", "DUPR Rating")}</p>
                  <p className="text-[var(--cm-text)]">{coach.coachDupr}</p>
                </div>
              </div>
            )}
            {coach.coachSpecialties.length > 0 && (
              <div className="flex gap-3">
                <Star className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-1.5">{t("coaches.specialties", "Specialties")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.coachSpecialties.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-[var(--cm-accent-bg)] text-[var(--cm-accent)] text-xs rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {coach.coachFocusLevels.length > 0 && (
              <div className="flex gap-3">
                <Target className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-1.5">{t("coaches.focusLevels", "Focus level")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.coachFocusLevels.map((l) => (
                      <span key={l} className="px-2 py-0.5 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] text-xs rounded-full border border-[var(--cm-border)]">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {coach.coachLanguages.length > 0 && (
              <div className="flex gap-3">
                <Languages className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-1.5">{t("coaches.languages", "Languages")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.coachLanguages.map((l) => (
                      <span key={l} className="px-2 py-0.5 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] text-xs rounded-full border border-[var(--cm-border)]">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {coach.coachGroupSizes.length > 0 && (
              <div className="flex gap-3">
                <Users className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--cm-text-muted)] mb-1.5">{t("coaches.groupSizes", "Group sizes")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.coachGroupSizes.map((g) => (
                      <span key={g} className="px-2 py-0.5 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] text-xs rounded-full border border-[var(--cm-border)]">{g}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Other recommended coaches ───────────────────────────────── */}
      {otherCoaches.length > 0 && (
        <div className="px-4 mb-8">
          <h2 className="text-base font-semibold mb-3">{t("coaches.otherRecommended", "Other recommended coaches")}</h2>
          <div className="space-y-3 mb-3">
            {otherCoaches.map((c) => (
              <Link
                key={c.id}
                href={`/book/coaches/${c.id}`}
                className="flex items-center gap-3 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3"
              >
                {c.coachPhoto ? (
                  <img src={c.coachPhoto} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center shrink-0 text-xl">
                    🎓
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  {c.coachBio && (
                    <p className="text-xs text-[var(--cm-text-sec)] line-clamp-1">{c.coachBio}</p>
                  )}
                  <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">
                    {t("common.from")} {formatPrice(c.startingPrice)}
                  </p>
                </div>
                <span className="text-[var(--cm-accent)] text-sm font-medium shrink-0">→</span>
              </Link>
            ))}
          </div>
          <Link
            href="/book/coaches"
            className="block text-center text-sm text-[var(--cm-accent)] font-medium py-2"
          >
            {t("coaches.fullList", "Full list")} →
          </Link>
        </div>
      )}
    </div>
  );
}

function CoachSessionSummary({
  coach,
  pkg,
  date,
  hours,
  playerCount,
  booking: isBooking,
  bookingError,
  onBack,
  onConfirm,
}: {
  coach: CoachProfile;
  pkg: Package;
  date: Date;
  hours: number[];
  playerCount: number;
  booking: boolean;
  bookingError: string | null;
  onBack: () => void;
  onConfirm: (payWithCredit?: boolean, creditId?: string) => void;
}) {
  const { t } = useTranslation();
  const { formatDate, formatPrice } = useBookFormatters();
  const sortedHours = [...hours].sort((a, b) => a - b);
  const startHour = sortedHours[0];
  const slotDurationH = Math.ceil(pkg.durationMin / 60);
  const endHour = sortedHours[sortedHours.length - 1] + slotDurationH;
  const isGroupPkg = hasGroupPlayerPricing(pkg);
  const totalPrice = isGroupPkg
    ? calculateSessionPrice(pkg, { playerCount, slotCount: hours.length })
    : pkg.priceValue * hours.length;
  const [credits, setCredits] = useState<{ id: string; remaining: number }[]>([]);

  useEffect(() => {
    if (isGroupPkg) return; // credits not available for group
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
  }, [isGroupPkg]);

  const hasCredits = !isGroupPkg && credits.length > 0;
  const totalRemaining = credits.reduce((s, c) => s + c.remaining, 0);

  // For group pricing: compute per-slot base and extra breakdown
  const extraPlayers = isGroupPkg ? Math.max(0, playerCount - (pkg.minPlayers ?? 2)) : 0;
  const basePerSlot = pkg.priceValue;
  const extraPerSlot = extraPlayers * (pkg.pricePerAdditionalPlayer ?? 0);

  return (
    <div className="px-6 pt-8 pb-8">
      <button onClick={onBack} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>
      <h2 className="text-lg font-bold mb-4">{t("coaches.sessionSummary")}</h2>

      {bookingError && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{bookingError}</div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2 text-sm">
        <Row label={t("common.coach")} value={coach.name} />
        <Row label={t("common.package")} value={pkg.name} />
        <Row label={t("common.date")} value={formatDate(date)} />
        <Row label={t("common.time")} value={`${formatHour(startHour)} – ${formatHour(endHour)}`} />
        {isGroupPkg && (
          <Row label={t("coaches.playersRow")} value={String(playerCount)} />
        )}
        {!isGroupPkg && hours.length > 1 && (
          <Row label={t("coaches.slots")} value={`${hours.length} × ${formatPrice(pkg.priceValue)}`} />
        )}
        <Row label={t("common.court")} value={t("common.autoAssigned")} />
        {isGroupPkg && (
          <>
            <div className="border-t border-[var(--cm-border)] pt-2 mt-2 space-y-1">
              <Row label={t("coaches.basePriceLine", { count: pkg.minPlayers })} value={`${formatPrice(basePerSlot)}${hours.length > 1 ? ` × ${hours.length}` : ""}`} />
              {extraPlayers > 0 && (
                <Row
                  label={t("coaches.additionalPlayersLine", { count: extraPlayers, price: formatPrice(pkg.pricePerAdditionalPlayer ?? 0) })}
                  value={`${formatPrice(extraPerSlot)}${hours.length > 1 ? ` × ${hours.length}` : ""}`}
                />
              )}
            </div>
          </>
        )}
        <div className="border-t border-[var(--cm-border)] pt-2 mt-2">
          <Row label={t("common.total")} value={formatPrice(totalPrice)} bold />
        </div>
      </div>

      {hasCredits && (
        <button
          onClick={() => onConfirm(true, credits[0].id)}
          disabled={isBooking}
          className="w-full py-3 bg-[var(--cm-green)] text-white rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
        >
          {isBooking ? t("coaches.booking") : t("coaches.payWithCredit", { count: totalRemaining })}
        </button>
      )}

      <button
        onClick={() => onConfirm(false)}
        disabled={isBooking}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
      >
        {isBooking ? t("coaches.booking") : t("coaches.payWithVietqr", { price: formatPrice(totalPrice) })}
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
