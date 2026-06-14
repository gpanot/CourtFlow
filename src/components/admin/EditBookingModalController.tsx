"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { EditBookingModal } from "@/components/admin/EditBookingModal";

export interface EditBookingTarget {
  id: string;
  venueId: string;
  date: string;
}

interface BookingRecord {
  id: string;
  courtId: string;
  venueId: string;
  playerId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  court: { id: string; label: string };
  player: { id: string; name: string; phone: string; avatar?: string };
}

interface SlotInfo {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
}

interface CourtSlotData {
  courtId: string;
  courtLabel: string;
  slots: SlotInfo[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtPrice(cents: number): string {
  return new Intl.NumberFormat("vi-VN").format(cents);
}

/** Fetches booking + availability and renders EditBookingModal in place. */
export function EditBookingModalController({
  target,
  onClose,
  onUpdated,
}: {
  target: EditBookingTarget | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [availability, setAvailability] = useState<CourtSlotData[]>([]);
  const [dayBookings, setDayBookings] = useState<BookingRecord[]>([]);
  const [editCourtId, setEditCourtId] = useState("");
  const [editSlotTime, setEditSlotTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) {
      setBooking(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setBooking(null);

    Promise.all([
      api.get<BookingRecord>(`/api/staff/bookings/${target.id}`),
      api.get<CourtSlotData[]>(
        `/api/bookings/availability?venueId=${target.venueId}&date=${target.date}`
      ),
      api.get<BookingRecord[]>(
        `/api/staff/bookings?venueId=${target.venueId}&date=${target.date}`
      ),
    ])
      .then(([b, avail, bookings]) => {
        if (cancelled) return;
        setBooking(b);
        setEditCourtId(b.courtId);
        setEditSlotTime(b.startTime);
        setAvailability(avail);
        setDayBookings(bookings);
      })
      .catch((e) => {
        if (!cancelled) {
          alert((e as Error).message);
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [target?.id, target?.venueId, target?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const bookingsByCourtAndTime = useMemo(() => {
    const map = new Map<string, BookingRecord>();
    dayBookings.forEach((b) => {
      if (b.status === "confirmed" || b.status === "completed") {
        const start = new Date(b.startTime).getTime();
        const end = new Date(b.endTime).getTime();
        allSlotTimes.forEach((slot) => {
          const st = new Date(slot.startTime).getTime();
          if (st >= start && st < end) {
            map.set(`${b.courtId}_${slot.startTime}`, b);
          }
        });
      }
    });
    return map;
  }, [dayBookings, allSlotTimes]);

  const getSlotPrice = useCallback((courtId: string, startTime: string): number | null => {
    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return null;
    const slot = court.slots.find((s) => s.startTime === startTime);
    return slot?.priceValue ?? null;
  }, [availability]);

  const availableSlotsForCourt = useCallback((courtId: string, excludeStartTime?: string): SlotInfo[] => {
    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return [];
    return court.slots.filter((s) => {
      if (!s.available && s.startTime !== excludeStartTime) return false;
      const booked = bookingsByCourtAndTime.has(`${courtId}_${s.startTime}`);
      if (booked && s.startTime !== excludeStartTime) return false;
      return true;
    });
  }, [availability, bookingsByCourtAndTime]);

  const handleClose = () => {
    setBooking(null);
    onClose();
  };

  const refreshAfterAction = () => {
    onUpdated?.();
    handleClose();
  };

  const saveEdit = async () => {
    if (!booking || !target) return;
    const changed = editCourtId !== booking.courtId || editSlotTime !== booking.startTime;
    if (!changed) { handleClose(); return; }
    setSaving(true);
    try {
      await api.patch(`/api/staff/bookings/${booking.id}`, {
        courtId: editCourtId,
        date: target.date,
        startTime: editSlotTime,
      });
      refreshAfterAction();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelBooking = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    try {
      await api.patch(`/api/staff/bookings/${id}`, { status: "cancelled" });
      refreshAfterAction();
    } catch (e) { alert((e as Error).message); }
  };

  const markNoShow = async (id: string) => {
    if (!confirm("Mark this booking as no-show?")) return;
    try {
      await api.patch(`/api/staff/bookings/${id}`, { status: "no_show" });
      refreshAfterAction();
    } catch (e) { alert((e as Error).message); }
  };

  const approvePayment = async (id: string) => {
    if (!confirm("Approve this payment?")) return;
    try {
      await api.patch(`/api/admin/bookings/${id}/approve-payment`, {});
      refreshAfterAction();
    } catch (e) { alert((e as Error).message); }
  };

  if (!target) return null;

  if (loading || !booking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 px-8 py-6 text-sm text-neutral-400">
          Loading booking…
        </div>
      </div>
    );
  }

  return (
    <EditBookingModal
      booking={booking}
      availability={availability}
      editCourtId={editCourtId}
      editSlotTime={editSlotTime}
      saving={saving}
      onCourtChange={(id) => { setEditCourtId(id); setEditSlotTime(""); }}
      onSlotChange={setEditSlotTime}
      onSave={saveEdit}
      onClose={handleClose}
      onApprovePayment={() => approvePayment(booking.id)}
      onCancel={() => cancelBooking(booking.id)}
      onNoShow={() => markNoShow(booking.id)}
      getSlotPrice={getSlotPrice}
      availableSlotsForCourt={availableSlotsForCourt}
      formatTime={formatTime}
      formatPrice={fmtPrice}
      t={t}
    />
  );
}
