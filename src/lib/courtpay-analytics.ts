import { prisma } from "@/lib/db";

/** Monday 00:00:00 local for the week containing `date`. */
export function getWeekStartLocal(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekEndLocal(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function parseMonthParam(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10) - 1;
  if (mon < 0 || mon > 11) return null;
  const start = new Date(year, mon, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, mon + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function weekKey(weekStart: Date): string {
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, "0");
  const d = String(weekStart.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PAYMENT_SELECT = {
  id: true,
  venueId: true,
  sessionId: true,
  playerId: true,
  checkInPlayerId: true,
  amount: true,
  partyCount: true,
  paymentMethod: true,
  type: true,
  status: true,
  paymentRef: true,
  createdAt: true,
  confirmedAt: true,
  confirmedBy: true,
  confirmedOnDevice: true,
  cancelReason: true,
  cancelledAt: true,
  checkInPlayer: {
    select: { id: true, name: true, phone: true, skillLevel: true },
  },
  player: {
    select: { id: true, name: true, phone: true, reclubUserId: true, skillLevel: true },
  },
  session: {
    select: {
      id: true,
      date: true,
      openedAt: true,
      closedAt: true,
      status: true,
      type: true,
      title: true,
      staff: { select: { name: true } },
    },
  },
} as const;

export type CourtPayPaymentRow = Awaited<
  ReturnType<typeof fetchCourtPayPayments>
>[number];

export async function fetchCourtPayPayments(opts: {
  venueId: string;
  from: Date;
  to: Date;
  sessionId?: string;
}) {
  return prisma.pendingPayment.findMany({
    where: {
      venueId: opts.venueId,
      checkInPlayerId: { not: null },
      status: { in: ["confirmed", "cancelled"] },
      confirmedAt: { gte: opts.from, lte: opts.to },
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    },
    select: PAYMENT_SELECT,
    orderBy: { confirmedAt: "desc" },
  });
}

export interface ReclubInfo {
  reclubUserId: number | null;
  reclubName: string | null;
}

export async function resolveReclubByPhone(
  phones: string[]
): Promise<Map<string, ReclubInfo>> {
  const unique = [...new Set(phones.filter(Boolean))];
  if (unique.length === 0) return new Map<string, ReclubInfo>();
  const players = await prisma.player.findMany({
    where: { phone: { in: unique } },
    select: { phone: true, name: true, reclubUserId: true },
  });
  return new Map(
    players.map((p) => [
      p.phone,
      {
        reclubUserId: p.reclubUserId,
        reclubName: p.reclubUserId != null ? p.name : null,
      },
    ])
  );
}

export function getReclubInfo(
  payment: CourtPayPaymentRow,
  byPhone: Map<string, ReclubInfo>
): ReclubInfo {
  if (payment.player?.reclubUserId != null) {
    return {
      reclubUserId: payment.player.reclubUserId,
      reclubName: payment.player.name,
    };
  }
  const phone = payment.checkInPlayer?.phone;
  if (phone && byPhone.has(phone)) {
    return byPhone.get(phone)!;
  }
  return { reclubUserId: null, reclubName: null };
}

export interface PaymentDetailRow {
  id: string;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionType: string | null;
  hostName: string | null;
  sessionOpenedAt: string | null;
  sessionClosedAt: string | null;
  playerName: string;
  playerPhone: string;
  playerSkillLevel: string | null;
  reclubUserId: number | null;
  reclubName: string | null;
  checkInFrequency: number;
  amount: number;
  partyCount: number;
  paymentMethod: string;
  type: string;
  status: string;
  paymentRef: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedOnDevice: string | null;
  cancelReason: string | null;
}

export function toPaymentDetail(
  payment: CourtPayPaymentRow,
  byPhone: Map<string, ReclubInfo>,
  frequencyByCheckInPlayerId: Map<string, number>,
  resolvedSession?: SessionCandidate | null
): PaymentDetailRow {
  const session = resolvedSession ?? payment.session;
  const reclub = getReclubInfo(payment, byPhone);
  const freq =
    payment.checkInPlayerId != null
      ? (frequencyByCheckInPlayerId.get(payment.checkInPlayerId) ?? 0)
      : 0;
  return {
    id: payment.id,
    sessionId: payment.sessionId,
    sessionTitle: session?.title ?? null,
    sessionType: session?.type ?? null,
    hostName: session?.staff?.name ?? null,
    sessionOpenedAt: session?.openedAt?.toISOString() ?? null,
    sessionClosedAt: session?.closedAt?.toISOString() ?? null,
    playerName: payment.checkInPlayer?.name ?? payment.player?.name ?? "Unknown",
    playerPhone: payment.checkInPlayer?.phone ?? payment.player?.phone ?? "",
    playerSkillLevel:
      payment.checkInPlayer?.skillLevel ??
      (payment.player?.skillLevel ? String(payment.player.skillLevel) : null),
    reclubUserId: reclub.reclubUserId,
    reclubName: reclub.reclubName,
    checkInFrequency: freq,
    amount: payment.amount,
    partyCount: payment.partyCount,
    paymentMethod: payment.paymentMethod,
    type: payment.type,
    status: payment.status,
    paymentRef: payment.paymentRef,
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    confirmedBy: payment.confirmedBy,
    confirmedOnDevice: payment.confirmedOnDevice ?? null,
    cancelReason: payment.cancelReason,
  };
}

/**
 * Returns a map of checkInPlayerId → total confirmed payment count at the venue.
 * Used as the "Frequency" column — how often the player has checked in overall.
 */
export async function resolveCheckInFrequency(
  venueId: string,
  checkInPlayerIds: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(checkInPlayerIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const counts = await prisma.pendingPayment.groupBy({
    by: ["checkInPlayerId"],
    where: {
      venueId,
      checkInPlayerId: { in: unique },
      status: "confirmed",
    },
    _count: { id: true },
  });
  return new Map(
    counts
      .filter((c) => c.checkInPlayerId !== null)
      .map((c) => [c.checkInPlayerId as string, c._count.id])
  );
}

export interface AggregateKpis {
  totalRevenue: number;
  totalPayments: number;
  uniquePlayers: number;
  sessionCount: number;
  cancelledCount: number;
  subscriptionRevenue: number;
  avgRevenuePerSession: number;
  partyCount: number;
}

export interface SessionCandidate {
  id: string;
  date: Date;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  type: string;
  title: string | null;
  openedOnDevice?: string | null;
  staff?: { name: string } | null;
}

export function inferSessionForPayment(
  confirmedAt: Date,
  candidates: SessionCandidate[]
): SessionCandidate | null {
  const t = confirmedAt.getTime();
  const matches = candidates.filter((s) => {
    if (s.openedAt.getTime() > t) return false;
    if (s.closedAt === null) return true;
    return s.closedAt.getTime() >= t;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  return matches[0];
}

export function resolvePaymentSession(
  payment: CourtPayPaymentRow,
  candidates: SessionCandidate[]
): SessionCandidate | null {
  if (payment.session) {
    return {
      id: payment.session.id,
      date: payment.session.date,
      openedAt: payment.session.openedAt,
      closedAt: payment.session.closedAt,
      status: payment.session.status,
      type: payment.session.type,
      title: payment.session.title,
      staff: payment.session.staff,
    };
  }
  if (!payment.confirmedAt) return null;
  return inferSessionForPayment(payment.confirmedAt, candidates);
}

/**
 * Full venue roster — same definition as CP Players / boss dashboard:
 * self check-in players (queue at venue) + CourtPay check-in players, all-time, not deduped by phone.
 */
export async function getVenueRosterPlayerCount(venueId: string): Promise<number> {
  const [selfCount, courtPayCount] = await Promise.all([
    prisma.player.count({
      where: { queueEntries: { some: { session: { venueId } } } },
    }),
    prisma.checkInPlayer.count({ where: { venueId } }),
  ]);
  return selfCount + courtPayCount;
}

export function computeKpis(
  payments: CourtPayPaymentRow[],
  sessionIds: Set<string>
): AggregateKpis {
  const confirmed = payments.filter((p) => p.status === "confirmed");
  const totalRevenue = confirmed.reduce((s, p) => s + p.amount, 0);
  const subscriptionRevenue = confirmed
    .filter(
      (p) =>
        p.paymentMethod === "subscription" ||
        p.type === "subscription" ||
        p.type === "subscription_renewal"
    )
    .reduce((s, p) => s + p.amount, 0);
  const sessionCount = sessionIds.size;
  // Count distinct players from all payments (confirmed + cancelled) in this scope
  const uniquePlayers = new Set(
    payments.map((p) => p.checkInPlayerId).filter(Boolean)
  ).size;
  // Sum partyCount from ALL payments (confirmed + cancelled) — every person counts
  const partyCount = payments.reduce(
    (sum, p) => sum + (typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1),
    0
  );
  return {
    totalRevenue,
    totalPayments: payments.length,
    uniquePlayers,
    sessionCount,
    cancelledCount: payments.filter((p) => p.status === "cancelled").length,
    subscriptionRevenue,
    avgRevenuePerSession:
      sessionCount > 0 ? Math.round(totalRevenue / sessionCount) : 0,
    partyCount,
  };
}
