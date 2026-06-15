"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";
import { useSessionStore } from "@/stores/session-store";
import {
  Search,
  UserPlus,
  Phone,
  Mail,
  Calendar,
  Clock,
  Crown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Pencil,
  Plus,
  StickyNote,
  CreditCard,
  History,
  Dumbbell,
  ChevronRight,
  Ban,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerListItem {
  id: string;
  source: "courtpass" | "courtpay";
  name: string;
  phone: string;
  email: string | null;
  avatar?: string;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  membershipName: string | null;
  membershipStatus: string | null;
  checkInCount: number;
  lastCheckIn: string | null;
  pendingBalance: number;
}

interface PlayerListData {
  players: PlayerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface BookingRecord {
  id: string;
  courtLabel: string;
  startTime: string;
  endTime: string;
  date: string;
  priceValue: number;
  paymentStatus: string | null;
  status?: string;
}

interface MembershipRecord {
  id: string;
  tierName: string;
  tierId: string;
  status: string;
  sessionsUsed: number;
  sessionsIncluded: number | null;
  renewalDate: string;
  activatedAt: string;
}

interface MembershipTier {
  id: string;
  name: string;
  priceValue: number;
  sessionsIncluded: number | null;
}

interface CheckInRecord {
  id: string;
  checkedInAt: string;
  source: string;
  venueName: string;
}

interface PaymentRecord {
  id: string;
  type: "membership" | "booking";
  description: string;
  amount: number;
  status: string;
  date: string;
  paidAt: string | null;
  paymentMethod: string | null;
  note: string | null;
}

interface CoachingLesson {
  id: string;
  coachName: string;
  note: string | null;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
}

interface StaffNote {
  content: string;
  updatedAt: string;
  updatedBy: string | null;
}

interface CancellationPolicy {
  freeCancelHours: number;
  partialCancelHours: number;
  noCancelHours: number;
}

interface VenueCourt {
  id: string;
  label: string;
}

interface PlayerDetail {
  source: "courtpass" | "courtpay";
  player: {
    id: string;
    name: string;
    phone: string;
    avatar: string | null;
    facePhotoPath: string | null;
    avatarPhotoPath: string | null;
    gender: string | null;
    skillLevel: string | null;
    email: string | null;
    reclubUserId: number | null;
  };
  stats: {
    totalVisits: number;
    lastCheckIn: string | null;
    membershipName: string | null;
    membershipStatus: string | null;
    pendingBalance: number;
  };
  upcomingBookings: BookingRecord[];
  pastBookings: BookingRecord[];
  membership: MembershipRecord | null;
  membershipTiers: MembershipTier[];
  checkInHistory: CheckInRecord[];
  payments: PaymentRecord[];
  coachingLessons: CoachingLesson[];
  staffNote: StaffNote | null;
  venueCourts: VenueCourt[];
  cancellationPolicy: CancellationPolicy;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtCurrency(val: number): string {
  if (val === 0) return "0";
  return val.toLocaleString();
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "bg-purple-600",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-teal-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── InitialsAvatar ───────────────────────────────────────────────────────────

function InitialsAvatar({ name, sizeClass = "h-10 w-10", textClass = "text-sm" }: { name: string; sizeClass?: string; textClass?: string }) {
  return (
    <div className={cn("shrink-0 flex items-center justify-center rounded-full font-semibold text-white", sizeClass, getAvatarColor(name))}>
      <span className={textClass}>{getInitials(name)}</span>
    </div>
  );
}

// ─── PlayerAvatar ─────────────────────────────────────────────────────────────

function PlayerAvatar({
  player,
  sizeClass = "h-10 w-10",
  textClass = "text-sm",
}: {
  player: Pick<PlayerListItem, "id" | "name" | "avatar" | "facePhotoPath" | "avatarPhotoPath">;
  sizeClass?: string;
  textClass?: string;
}) {
  const hasPhoto = player.facePhotoPath || player.avatarPhotoPath;
  if (hasPhoto) {
    return (
      <PlayerAvatarThumb
        avatarPhotoPath={player.avatarPhotoPath}
        facePhotoPath={player.facePhotoPath}
        playerId={player.id}
        avatar={player.avatar}
        sizeClass={sizeClass}
      />
    );
  }
  return <InitialsAvatar name={player.name} sizeClass={sizeClass} textClass={textClass} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5 animate-pulse">
          <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-neutral-800" />
            <div className="h-2.5 w-20 rounded bg-neutral-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 h-20" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 h-28" />
      ))}
    </div>
  );
}

// ─── Status Badges ────────────────────────────────────────────────────────────

function MembershipBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-600/20 text-emerald-400",
    suspended: "bg-amber-600/20 text-amber-400",
    cancelled: "bg-red-600/20 text-red-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles[status] ?? "bg-neutral-700 text-neutral-400")}>
      {status}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const styles: Record<string, string> = {
    paid: "bg-emerald-600/20 text-emerald-400",
    unpaid: "bg-amber-600/20 text-amber-400",
    overdue: "bg-red-600/20 text-red-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles[s] ?? "bg-neutral-700 text-neutral-400")}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: "courtpass" | "courtpay" }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
      source === "courtpass" ? "bg-blue-600/20 text-blue-400" : "bg-purple-600/20 text-purple-400"
    )}>
      {source === "courtpass" ? "CP" : "CPay"}
    </span>
  );
}

// ─── Section Container ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, action, children }: { title: string; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-center">
      <p className="text-sm text-neutral-500">{message}</p>
      {action}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-neutral-800">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Cancel Booking Modal ─────────────────────────────────────────────────────

function CancelBookingModal({
  booking,
  policy,
  onConfirm,
  onClose,
}: {
  booking: BookingRecord | null;
  policy: CancellationPolicy;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  if (!booking) return null;

  const now = new Date();
  const hoursUntil = (new Date(booking.startTime).getTime() - now.getTime()) / (1000 * 60 * 60);

  async function handleConfirm() {
    setSaving(true);
    setErr("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Cancel Booking">
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 px-4 py-3 text-sm">
          <div className="font-medium text-white">{booking.courtLabel}</div>
          <div className="text-neutral-400 text-xs mt-0.5">
            {fmtDate(booking.startTime)} · {fmtTime(booking.startTime)} – {fmtTime(booking.endTime)}
          </div>
          <div className="text-neutral-400 text-xs">{fmtCurrency(booking.priceValue)} VND</div>
        </div>

        <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-neutral-400 mb-2">Cancellation policy</p>
          <div className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
            <span className="text-neutral-300">Free cancellation up to {policy.freeCancelHours}h before start</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
            <span className="text-neutral-300">50% retained within {policy.partialCancelHours}h of start</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Ban className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />
            <span className="text-neutral-300">No cancellation within {policy.noCancelHours}h of start</span>
          </div>
        </div>

        {hoursUntil < policy.noCancelHours && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            Cancellation not allowed — less than {policy.noCancelHours}h before start
          </div>
        )}

        {err && (
          <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">{err}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleConfirm}
            disabled={saving || hoursUntil < policy.noCancelHours}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            {saving ? "Cancelling…" : "Confirm cancel"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
            Keep
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── New Booking Modal ────────────────────────────────────────────────────────

function NewBookingModal({
  venueId,
  playerId,
  courts,
  onSuccess,
  onClose,
}: {
  venueId: string;
  playerId: string;
  courts: VenueCourt[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startHour, setStartHour] = useState(8);
  const [slotCount, setSlotCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const d = new Date(date);
      d.setHours(startHour, 0, 0, 0);
      await api.post("/api/staff/bookings", {
        courtId,
        venueId,
        playerId,
        date,
        startTime: d.toISOString(),
        slotCount,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New Booking">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Court</label>
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Start time</label>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Duration (slots)</label>
            <select
              value={slotCount}
              onChange={(e) => setSlotCount(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} slot{n > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none"
          />
        </div>

        {err && <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving || !courtId}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Booking…" : "Book court"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Membership Modal ─────────────────────────────────────────────────────────

function MembershipModal({
  membership,
  tiers,
  playerId,
  venueId,
  onSuccess,
  onClose,
}: {
  membership: MembershipRecord | null;
  tiers: MembershipTier[];
  playerId: string;
  venueId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [tierId, setTierId] = useState(membership?.tierId ?? tiers[0]?.id ?? "");
  const [sessionsUsed, setSessionsUsed] = useState<number>(membership?.sessionsUsed ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function activate() {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/admin/memberships/activate", { playerId, venueId, tierId });
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function update(action: "suspend" | "cancel" | "sessions" | "tier") {
    if (!membership) return;
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, unknown> = {};
      if (action === "suspend") body.status = "suspended";
      if (action === "cancel") body.status = "cancelled";
      if (action === "sessions") body.sessionsUsed = sessionsUsed;
      if (action === "tier") body.tierId = tierId;
      await api.patch(`/api/admin/memberships/${membership.id}`, body);
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Adjust Membership">
      <div className="space-y-4">
        {membership && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">{membership.tierName}</span>
              <MembershipBadge status={membership.status} />
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {membership.sessionsUsed} / {membership.sessionsIncluded ?? "∞"} sessions · Renewal {fmtDate(membership.renewalDate)}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Plan</label>
          <select
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {membership && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Override sessions used</label>
            <input
              type="number"
              min={0}
              value={sessionsUsed}
              onChange={(e) => setSessionsUsed(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
        )}

        {err && <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">{err}</p>}

        {membership ? (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                onClick={() => update("tier")}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
              <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
                Cancel
              </button>
            </div>
            {membership.status === "active" && (
              <button onClick={() => update("suspend")} disabled={saving} className="w-full rounded-lg border border-amber-700/50 bg-amber-900/10 py-2 text-xs text-amber-400 hover:bg-amber-900/20 disabled:opacity-50">
                Suspend membership
              </button>
            )}
            <button onClick={() => update("cancel")} disabled={saving} className="w-full rounded-lg border border-red-800/50 bg-red-900/10 py-2 text-xs text-red-400 hover:bg-red-900/20 disabled:opacity-50">
              Cancel membership
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={activate}
              disabled={saving || !tierId}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Activate membership
            </button>
            <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Add Player Modal ─────────────────────────────────────────────────────────

function AddPlayerModal({
  venueId,
  onSuccess,
  onClose,
}: {
  venueId: string;
  onSuccess: (playerId: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    gender: "male" as "male" | "female",
    skillLevel: "beginner" as "beginner" | "intermediate" | "advanced" | "pro",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function submit() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!form.phone.trim()) { setErr("Phone number is required"); return; }
    if (!form.email.trim()) { setErr("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr("Invalid email address"); return; }
    if (!form.password) { setErr("Password is required"); return; }
    if (form.password.length < 8) { setErr("Password must be at least 8 characters"); return; }

    setSaving(true);
    setErr("");
    try {
      const player = await api.post<{ id: string; name: string }>("/api/admin/players", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        gender: form.gender,
        skillLevel: form.skillLevel,
      });
      onSuccess(player.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const SKILL_LEVELS = [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "pro", label: "Pro" },
  ];

  return (
    <Modal open onClose={onClose} title="Add Player">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">
            Full name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Nguyen Van An"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">
            Phone number <span className="text-red-400">*</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="e.g. 0912345678"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Email */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="e.g. player@email.com"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-neutral-500">Used to log in to the player portal</p>
        </div>

        {/* Password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">
            Password <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-9 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Share this with the player so they can log in</p>
        </div>

        {/* Gender */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-300">Gender</label>
          <div className="flex gap-2">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => update("gender", g)}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors capitalize",
                  form.gender === g
                    ? "border-purple-500 bg-purple-600/20 text-purple-300"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                )}
              >
                {g === "male" ? "Male" : "Female"}
              </button>
            ))}
          </div>
        </div>

        {/* Skill level */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-300">Skill level</label>
          <div className="grid grid-cols-2 gap-2">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => update("skillLevel", s.value)}
                className={cn(
                  "rounded-lg border py-2 text-sm font-medium transition-colors",
                  form.skillLevel === s.value
                    ? "border-purple-500 bg-purple-600/20 text-purple-300"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {err}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Creating…" : "Create player"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit Player Modal ────────────────────────────────────────────────────────

function EditPlayerModal({
  player,
  onSuccess,
  onClose,
}: {
  player: PlayerDetail["player"];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: player.name,
    phone: player.phone,
    email: player.email ?? "",
    newPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function submit() {
    if (!form.name.trim() || form.name.trim().length < 2) { setErr("Name must be at least 2 characters"); return; }
    if (!form.phone.trim() || form.phone.trim().length < 6) { setErr("Phone number is required"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr("Invalid email address"); return; }
    if (form.newPassword && form.newPassword.length < 8) { setErr("Password must be at least 8 characters"); return; }

    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/admin/courtpass-players/${player.id}/edit`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        ...(form.newPassword ? { newPassword: form.newPassword } : {}),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none";

  return (
    <Modal open onClose={onClose} title="Edit Player Profile">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">Full name <span className="text-red-400">*</span></label>
          <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">Phone number <span className="text-red-400">*</span></label>
          <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">Email</label>
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="Leave empty to remove" className={inputCls} />
          <p className="mt-1 text-[11px] text-neutral-500">Used to log in to the player portal</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300">Reset password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => update("newPassword", e.target.value)}
              placeholder="Leave empty to keep current"
              className={cn(inputCls, "pr-9")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Min. 8 characters — only applies to email/password accounts</p>
        </div>

        {player.reclubUserId !== null && (
          <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 px-3 py-2.5">
            <p className="text-[11px] text-neutral-500 mb-0.5">Reclub ID</p>
            <p className="text-sm font-mono text-neutral-300">{player.reclubUserId}</p>
          </div>
        )}

        {err && (
          <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">{err}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CourtPassPlayersPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const { venueId, setVenueId, venues } = useAdminVenuePicker({ autoSelect: true });
  const { role } = useSessionStore();
  const canEditPlayer = role === "manager" || role === "superadmin";

  // ── List state ──
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Detail state ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // ── Note state ──
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState("");
  const [noteErr, setNoteErr] = useState("");

  // ── Modals ──
  const [cancelBooking, setCancelBooking] = useState<BookingRecord | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showEditPlayer, setShowEditPlayer] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch player list (page 1 = fresh load) ──
  const fetchList = useCallback(async (resetPage = true) => {
    if (!venueId) return;
    const targetPage = resetPage ? 1 : page;
    if (resetPage) {
      setPage(1);
      setListLoading(true);
    } else {
      setListLoadingMore(true);
    }
    setListError("");
    try {
      const params = new URLSearchParams({ venueId, page: String(targetPage) });
      if (search) params.set("search", search);
      const data = await api.get<PlayerListData>(`/api/admin/courtpass-players?${params}`);
      if (resetPage) {
        setPlayers(data.players);
      } else {
        setPlayers((prev) => [...prev, ...data.players]);
      }
      setListTotal(data.total);
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setListLoading(false);
      setListLoadingMore(false);
    }
  }, [venueId, search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!venueId || listLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setListLoadingMore(true);
    setListError("");
    try {
      const params = new URLSearchParams({ venueId, page: String(nextPage) });
      if (search) params.set("search", search);
      const data = await api.get<PlayerListData>(`/api/admin/courtpass-players?${params}`);
      setPlayers((prev) => [...prev, ...data.players]);
      setListTotal(data.total);
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setListLoadingMore(false);
    }
  }, [venueId, search, page, listLoadingMore]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { void fetchList(true); }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [venueId, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setPlayers([]);
    setListTotal(0);
    setPage(1);
  }, [venueId]);

  // ── Fetch player detail ──
  const fetchDetail = useCallback(async (pid: string) => {
    if (!venueId || !pid) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const data = await api.get<PlayerDetail>(`/api/admin/courtpass-players/${pid}?venueId=${venueId}`);
      setDetail(data);
      setNoteContent(data.staffNote?.content ?? "");
      setNoteMsg("");
      setNoteErr("");
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, [venueId]);

  const selectPlayer = (pid: string) => {
    setSelectedId(pid);
    void fetchDetail(pid);
  };

  // ── Save note ──
  async function saveNote() {
    if (!selectedId || !venueId) return;
    setNoteSaving(true);
    setNoteMsg("");
    setNoteErr("");
    try {
      await api.put(`/api/admin/courtpass-players/${selectedId}/note`, { venueId, content: noteContent });
      setNoteMsg(t("courtpassPlayers.noteSaved"));
    } catch (e) {
      setNoteErr((e as Error).message);
    } finally {
      setNoteSaving(false);
    }
  }

  // ── Cancel booking ──
  async function handleCancelBooking() {
    if (!cancelBooking) return;
    await api.patch(`/api/staff/bookings/${cancelBooking.id}`, { status: "cancelled" });
    if (selectedId) void fetchDetail(selectedId);
    void fetchList();
  }

  const venueOptions = venues.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name }));

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">{t("courtpassPlayers.title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Unified player CRM — CourtPass + CourtPay</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminVenuePicker
            venueId={venueId}
            venues={venueOptions}
            onChange={setVenueId}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => setShowAddPlayer(true)}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            {t("courtpassPlayers.addPlayer")}
          </button>
        </div>
      </div>

      {/* Master-detail layout — fixed height so each column scrolls independently */}
      <div className="flex gap-4" style={{ height: "calc(100dvh - 136px)" }}>

        {/* ── Left: Player list ── */}
        <div className="w-72 shrink-0 flex flex-col rounded-xl border border-neutral-800 bg-neutral-900 h-full overflow-hidden">
          {/* Search */}
          <div className="border-b border-neutral-800 px-3 py-2.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("courtpassPlayers.searchPlaceholder")}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!venueId ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-neutral-500 text-center px-4">{t("courtpassPlayers.selectVenueFirst")}</p>
              </div>
            ) : listLoading ? (
              <ListSkeleton />
            ) : listError ? (
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-xs text-neutral-500">{listError}</p>
                <button onClick={() => void fetchList()} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300">
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            ) : players.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-sm text-neutral-500">No players found</p>
              </div>
            ) : (
              <div className="pb-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => selectPlayer(player.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-neutral-800",
                      selectedId === player.id && "bg-purple-600/10 border-r-2 border-purple-500"
                    )}
                  >
                    <PlayerAvatar player={player} sizeClass="h-9 w-9" textClass="text-xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">{player.name}</span>
                        <SourceBadge source={player.source} />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Phone className="h-2.5 w-2.5 text-neutral-600" />
                        <span className="text-xs text-neutral-500 truncate">{player.phone}</span>
                      </div>
                      {player.email && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail className="h-2.5 w-2.5 text-neutral-600" />
                          <span className="text-[10px] text-neutral-600 truncate">{player.email}</span>
                        </div>
                      )}
                      {player.membershipName && (
                        <span className="text-[10px] text-emerald-400 truncate block">{player.membershipName}</span>
                      )}
                    </div>
                    {player.pendingBalance > 0 && (
                      <div className="shrink-0 text-[10px] font-bold text-red-400 bg-red-900/20 rounded-full px-1.5 py-0.5">
                        {fmtCurrency(player.pendingBalance)}
                      </div>
                    )}
                  </button>
                ))}
                {/* Load more */}
                {players.length < listTotal && (
                  <div className="px-3 pt-1 pb-2">
                    <button
                      onClick={loadMore}
                      disabled={listLoadingMore}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 py-2 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                    >
                      {listLoadingMore
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
                        : `Load more (${listTotal - players.length} remaining)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Right: Detail ── */}
        <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 overflow-y-auto h-full">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center">
                <UserPlus className="h-8 w-8 text-neutral-600" />
              </div>
              <p className="text-sm text-neutral-500">{t("courtpassPlayers.noPlayerSelected")}</p>
            </div>
          ) : detailLoading ? (
            <DetailSkeleton />
          ) : detailError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm text-neutral-400">{t("courtpassPlayers.detailError")}</p>
              <button onClick={() => selectedId && fetchDetail(selectedId)} className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800">
                <RefreshCw className="h-3 w-3" /> {t("courtpassPlayers.retry")}
              </button>
            </div>
          ) : detail ? (
            <div className="flex flex-col">
              {/* ── Player header ── */}
              <div className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-sm px-5 py-4">
                <div className="flex items-center gap-4">
                  <PlayerAvatar
                    player={{
                      id: detail.player.id,
                      name: detail.player.name,
                      avatar: detail.player.avatar ?? undefined,
                      facePhotoPath: detail.player.facePhotoPath,
                      avatarPhotoPath: detail.player.avatarPhotoPath,
                    }}
                    sizeClass="h-14 w-14"
                    textClass="text-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{detail.player.name}</h2>
                      <SourceBadge source={detail.source} />
                    </div>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-neutral-400">
                        <Phone className="h-3 w-3" /> {detail.player.phone}
                      </span>
                      {detail.player.email && (
                        <span className="flex items-center gap-1 text-xs text-neutral-400">
                          <Mail className="h-3 w-3" /> {detail.player.email}
                        </span>
                      )}
                    </div>
                    {detail.stats.pendingBalance > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-full bg-red-900/30 border border-red-800/40 px-2.5 py-0.5 w-fit">
                        <AlertCircle className="h-3 w-3 text-red-400" />
                        <span className="text-xs text-red-300 font-medium">Balance due: {fmtCurrency(detail.stats.pendingBalance)} VND</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditPlayer && detail.source === "courtpass" && (
                      <button
                        onClick={() => setShowEditPlayer(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-700"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {detail.source === "courtpass" && (
                      <>
                        <button
                          onClick={() => setShowNewBooking(true)}
                          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
                        >
                          <Plus className="h-3.5 w-3.5" /> Book
                        </button>
                        <button
                          onClick={() => setShowMembership(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-700"
                        >
                          <Crown className="h-3.5 w-3.5" /> Membership
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => selectedId && fetchDetail(selectedId)}
                      className="rounded-lg border border-neutral-700 p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Detail body ── */}
              <div className="p-4 pb-8 space-y-4">
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-[11px] text-neutral-500 mb-1">{t("courtpassPlayers.totalVisits")}</p>
                    <p className="text-2xl font-bold text-white">{detail.stats.totalVisits}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-[11px] text-neutral-500 mb-1">{t("courtpassPlayers.lastCheckIn")}</p>
                    <p className="text-sm font-semibold text-white">{detail.stats.lastCheckIn ? fmtDate(detail.stats.lastCheckIn) : "—"}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-[11px] text-neutral-500 mb-1">{t("courtpassPlayers.membership")}</p>
                    <div className="flex items-center gap-1.5">
                      {detail.stats.membershipName ? (
                        <>
                          <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-xs font-medium text-white truncate">{detail.stats.membershipName}</span>
                        </>
                      ) : (
                        <span className="text-sm text-neutral-500">None</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-[11px] text-neutral-500 mb-1">{t("courtpassPlayers.balance")}</p>
                    <p className={cn("text-sm font-bold", detail.stats.pendingBalance > 0 ? "text-red-400" : "text-emerald-400")}>
                      {fmtCurrency(detail.stats.pendingBalance)} VND
                    </p>
                  </div>
                </div>

                {/* Upcoming bookings */}
                <Section
                  title={t("courtpassPlayers.upcomingBookings")}
                  icon={Calendar}
                  action={
                    detail.source === "courtpass" ? (
                      <button onClick={() => setShowNewBooking(true)} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    ) : undefined
                  }
                >
                  {detail.upcomingBookings.length === 0 ? (
                    <EmptyState
                      message={t("courtpassPlayers.noUpcomingBookings")}
                      action={
                        detail.source === "courtpass" ? (
                          <button onClick={() => setShowNewBooking(true)} className="text-xs text-purple-400 hover:text-purple-300">{t("courtpassPlayers.addBooking")}</button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      {detail.upcomingBookings.map((b) => (
                        <div key={b.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
                          <div>
                            <div className="text-sm font-medium text-white">{b.courtLabel}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">
                              {fmtDate(b.startTime)} · {fmtTime(b.startTime)} – {fmtTime(b.endTime)}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-xs text-neutral-500">{fmtCurrency(b.priceValue)} VND</span>
                              {b.paymentStatus && <PaymentBadge status={b.paymentStatus} />}
                            </div>
                          </div>
                          <button
                            onClick={() => setCancelBooking(b)}
                            className="rounded-lg p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Membership */}
                {detail.source === "courtpass" && (
                  <Section
                    title={t("courtpassPlayers.membership")}
                    icon={Crown}
                    action={
                      <button onClick={() => setShowMembership(true)} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                        <Pencil className="h-3 w-3" /> {detail.membership ? "Adjust" : "Activate"}
                      </button>
                    }
                  >
                    {detail.membership ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{detail.membership.tierName}</span>
                          <MembershipBadge status={detail.membership.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-neutral-500">Sessions</p>
                            <p className="font-medium text-white mt-0.5">{detail.membership.sessionsUsed} / {detail.membership.sessionsIncluded ?? "∞"}</p>
                          </div>
                          <div>
                            <p className="text-neutral-500">Renewal</p>
                            <p className="font-medium text-white mt-0.5">{fmtDate(detail.membership.renewalDate)}</p>
                          </div>
                          <div>
                            <p className="text-neutral-500">Activated</p>
                            <p className="font-medium text-white mt-0.5">{fmtDate(detail.membership.activatedAt)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        message="No active membership"
                        action={
                          <button onClick={() => setShowMembership(true)} className="text-xs text-purple-400 hover:text-purple-300">Activate membership</button>
                        }
                      />
                    )}
                  </Section>
                )}

                {/* Past bookings */}
                {detail.source === "courtpass" && (
                  <Section
                    title={t("courtpassPlayers.pastBookings")}
                    icon={History}
                    action={
                      // TODO: wire to /admin/bookings?playerId=x once filter is supported
                      undefined
                    }
                  >
                    {detail.pastBookings.length === 0 ? (
                      <EmptyState message={t("courtpassPlayers.noPastBookings")} />
                    ) : (
                      <div className="space-y-1.5">
                        {detail.pastBookings.map((b) => (
                          <div key={b.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/20 px-3 py-2">
                            <div>
                              <div className="text-sm text-white">{b.courtLabel}</div>
                              <div className="text-xs text-neutral-500">{fmtDate(b.startTime)} · {fmtTime(b.startTime)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-neutral-400">{fmtCurrency(b.priceValue)} VND</div>
                              <span className={cn("text-[10px] font-semibold uppercase", b.status === "cancelled" ? "text-red-400" : "text-neutral-500")}>{b.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {/* Check-in history */}
                <Section title={t("courtpassPlayers.checkInHistory")} icon={Clock}>
                  {detail.checkInHistory.length === 0 ? (
                    <EmptyState message={t("courtpassPlayers.noCheckIns")} />
                  ) : (
                    <div className="space-y-1.5">
                      {detail.checkInHistory.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/20 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="text-sm text-white">{fmtDateTime(c.checkedInAt)}</span>
                          </div>
                          <span className="text-[10px] text-neutral-500 uppercase">{c.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Payments */}
                <Section title={t("courtpassPlayers.payments")} icon={CreditCard}>
                  {detail.payments.length === 0 ? (
                    <EmptyState message={t("courtpassPlayers.noPayments")} />
                  ) : (
                    <div className="space-y-1.5">
                      {detail.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/20 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{p.description}</div>
                            <div className="text-xs text-neutral-500">{fmtDate(p.date)}</div>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <div className="text-sm font-medium text-white">{fmtCurrency(p.amount)} VND</div>
                            <PaymentBadge status={p.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Coaching */}
                <Section title={t("courtpassPlayers.coachingLessons")} icon={Dumbbell}>
                  {detail.coachingLessons.length === 0 ? (
                    <EmptyState message={t("courtpassPlayers.noCoaching")} />
                  ) : (
                    <div className="space-y-1.5">
                      {detail.coachingLessons.map((l) => (
                        <div key={l.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/20 px-3 py-2">
                          <div>
                            <div className="text-sm text-white">{l.coachName}</div>
                            <div className="text-xs text-neutral-500">{fmtDate(l.startTime)} · {fmtTime(l.startTime)} – {fmtTime(l.endTime)}</div>
                          </div>
                          <span className={cn("text-[10px] font-semibold uppercase", l.status === "completed" ? "text-emerald-400" : l.status === "cancelled" ? "text-red-400" : "text-neutral-400")}>
                            {l.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Staff notes */}
                <Section title={t("courtpassPlayers.staffNotes")} icon={StickyNote}>
                  <div className="space-y-3">
                    {detail.staffNote ? (
                      <div className="text-xs text-neutral-500 mb-1">
                        Last updated {fmtDateTime(detail.staffNote.updatedAt)}
                        {detail.staffNote.updatedBy && ` by ${detail.staffNote.updatedBy}`}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-600 italic">{t("courtpassPlayers.noNotes")}</p>
                    )}
                    <textarea
                      value={noteContent}
                      onChange={(e) => {
                        setNoteContent(e.target.value);
                        setNoteMsg("");
                        setNoteErr("");
                      }}
                      rows={4}
                      placeholder="Add a private note about this player…"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveNote}
                        disabled={noteSaving}
                        className="flex items-center gap-1.5 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
                        {noteSaving ? t("courtpassPlayers.savingNote") : t("courtpassPlayers.saveNote")}
                      </button>
                      {noteMsg && <span className="text-xs text-emerald-400">{noteMsg}</span>}
                      {noteErr && <span className="text-xs text-red-400">{noteErr}</span>}
                    </div>
                  </div>
                </Section>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Modals ── */}
      {detail && cancelBooking && (
        <CancelBookingModal
          booking={cancelBooking}
          policy={detail.cancellationPolicy}
          onConfirm={handleCancelBooking}
          onClose={() => setCancelBooking(null)}
        />
      )}
      {detail && showNewBooking && (
        <NewBookingModal
          venueId={venueId}
          playerId={detail.player.id}
          courts={detail.venueCourts}
          onSuccess={() => { void fetchList(); }}
          onClose={() => setShowNewBooking(false)}
        />
      )}
      {detail && showMembership && (
        <MembershipModal
          membership={detail.membership}
          tiers={detail.membershipTiers}
          playerId={detail.player.id}
          venueId={venueId}
          onSuccess={() => selectedId && void fetchDetail(selectedId)}
          onClose={() => setShowMembership(false)}
        />
      )}
      {showAddPlayer && (
        <AddPlayerModal
          venueId={venueId}
          onSuccess={(playerId) => {
            void fetchList(true);
            selectPlayer(playerId);
          }}
          onClose={() => setShowAddPlayer(false)}
        />
      )}
      {detail && showEditPlayer && (
        <EditPlayerModal
          player={detail.player}
          onSuccess={() => {
            void fetchList(true);
            if (selectedId) void fetchDetail(selectedId);
          }}
          onClose={() => setShowEditPlayer(false)}
        />
      )}
    </div>
  );
}
