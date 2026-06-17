import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";
import {
  computeKpis,
  fetchCourtPayPayments,
  getWeekEndLocal,
  getWeekStartLocal,
  monthKey,
  parseMonthParam,
  resolveCheckInFrequency,
  resolvePaymentSession,
  resolveReclubByPhone,
  toPaymentDetail,
  weekKey,
  type PaymentDetailRow,
  type SessionCandidate,
} from "@/lib/courtpay-analytics";

export const dynamic = "force-dynamic";

function parseDateParam(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function collectSessionIds(
  payments: Awaited<ReturnType<typeof fetchCourtPayPayments>>,
  sessionCandidates?: SessionCandidate[]
): Set<string> {
  const ids = new Set<string>();
  for (const p of payments) {
    if (sessionCandidates) {
      const resolved = resolvePaymentSession(p, sessionCandidates);
      if (resolved) { ids.add(resolved.id); continue; }
    }
    if (p.sessionId) ids.add(p.sessionId);
  }
  return ids;
}

function groupByMonth(
  payments: Awaited<ReturnType<typeof fetchCourtPayPayments>>,
  sessionCandidates?: SessionCandidate[]
) {
  const buckets = new Map<
    string,
    { payments: typeof payments; sessionIds: Set<string> }
  >();
  for (const p of payments) {
    if (!p.confirmedAt) continue;
    const key = monthKey(p.confirmedAt);
    if (!buckets.has(key)) {
      buckets.set(key, { payments: [], sessionIds: new Set() });
    }
    const b = buckets.get(key)!;
    b.payments.push(p);
    if (sessionCandidates) {
      const resolved = resolvePaymentSession(p, sessionCandidates);
      if (resolved) { b.sessionIds.add(resolved.id); continue; }
    }
    if (p.sessionId) b.sessionIds.add(p.sessionId);
  }
  return buckets;
}

function groupByWeek(
  payments: Awaited<ReturnType<typeof fetchCourtPayPayments>>,
  sessionCandidates?: SessionCandidate[]
) {
  const buckets = new Map<
    string,
    {
      weekStart: Date;
      weekEnd: Date;
      payments: typeof payments;
      sessionIds: Set<string>;
    }
  >();
  for (const p of payments) {
    if (!p.confirmedAt) continue;
    const ws = getWeekStartLocal(p.confirmedAt);
    const key = weekKey(ws);
    if (!buckets.has(key)) {
      buckets.set(key, {
        weekStart: ws,
        weekEnd: getWeekEndLocal(ws),
        payments: [],
        sessionIds: new Set(),
      });
    }
    const b = buckets.get(key)!;
    b.payments.push(p);
    if (sessionCandidates) {
      const resolved = resolvePaymentSession(p, sessionCandidates);
      if (resolved) { b.sessionIds.add(resolved.id); continue; }
    }
    if (p.sessionId) b.sessionIds.add(p.sessionId);
  }
  return buckets;
}

async function enrichPayments(
  venueId: string,
  payments: Awaited<ReturnType<typeof fetchCourtPayPayments>>,
  sessionCandidates?: SessionCandidate[]
): Promise<PaymentDetailRow[]> {
  const phones = payments
    .map((p) => p.checkInPlayer?.phone)
    .filter((x): x is string => Boolean(x));
  const checkInPlayerIds = payments
    .map((p) => p.checkInPlayerId)
    .filter((x): x is string => Boolean(x));

  const [byPhone, frequency] = await Promise.all([
    resolveReclubByPhone(phones),
    resolveCheckInFrequency(venueId, checkInPlayerIds),
  ]);

  return payments.map((p) => {
    const resolvedSession = sessionCandidates
      ? resolvePaymentSession(p, sessionCandidates)
      : undefined;
    return toPaymentDetail(p, byPhone, frequency, resolvedSession ?? undefined);
  });
}

export async function GET(req: Request) {
  try {
    const auth = requireManagerOrSuperAdmin(req.headers);
    const authorizedVenueIds = auth.role === "manager" ? await getAuthorizedVenueIds(auth) : null;
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const sessionId = searchParams.get("sessionId");
    const month = searchParams.get("month");
    const weekStartParam = searchParams.get("weekStart");
    const weekEndParam = searchParams.get("weekEnd");
    const exportAll = searchParams.get("export") === "all";
    const exportSessions = searchParams.get("export") === "sessions";

    if (!venueId && !sessionId) {
      const venues = await prisma.venue.findMany({
        where: {
          active: true,
          ...(authorizedVenueIds ? { id: { in: authorizedVenueIds } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ level: "venues", venues });
    }

    if (sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          venue: { select: { id: true, name: true } },
          staff: { select: { name: true } },
        },
      });
      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const from = new Date(session.openedAt);
      from.setHours(0, 0, 0, 0);
      const to = session.closedAt ? new Date(session.closedAt) : new Date();
      to.setHours(23, 59, 59, 999);

      const payments = await fetchCourtPayPayments({
        venueId: session.venueId,
        from,
        to,
      });

      const sessionCandidate: SessionCandidate = {
        id: session.id,
        date: session.date,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        status: session.status,
        type: session.type,
        title: session.title,
        staff: session.staff,
      };

      const sessionPayments = payments.filter((p) => {
        if (p.sessionId === sessionId) return true;
        if (!p.confirmedAt) return false;
        const inferred = resolvePaymentSession(p, [sessionCandidate]);
        return inferred?.id === sessionId;
      });

      const rows = await enrichPayments(session.venueId, sessionPayments, [
        sessionCandidate,
      ]);
      const kpis = computeKpis(sessionPayments, new Set([sessionId]));

      const snap = session.reclubSnapshot as {
        players?: Array<{
          reclubUserId: number;
          reclubName: string;
          avatarUrl: string;
          paid: boolean;
        }>;
      } | null;
      const snapshotRoster = snap?.players?.filter((p) => p.reclubName) ?? [];

      return NextResponse.json({
        level: "session",
        venue: session.venue,
        session: {
          id: session.id,
          title: session.title,
          type: session.type,
          status: session.status,
          openedAt: session.openedAt.toISOString(),
          closedAt: session.closedAt?.toISOString() ?? null,
          hostName: session.staff?.name ?? null,
          reclubReferenceCode: session.reclubReferenceCode,
          reclubEventName: session.reclubEventName,
          reclubSnapshot: snapshotRoster,
        },
        kpis,
        payments: rows,
      });
    }

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    // Export flat payment rows for CSV
    if (exportAll) {
      let from: Date;
      let to: Date = new Date();
      to.setHours(23, 59, 59, 999);

      if (weekStartParam && weekEndParam) {
        const ws = parseDateParam(weekStartParam);
        const we = parseDateParam(weekEndParam);
        if (!ws || !we) {
          return NextResponse.json({ error: "Invalid week range" }, { status: 400 });
        }
        from = ws;
        to = we;
        to.setHours(23, 59, 59, 999);
      } else if (month) {
        const range = parseMonthParam(month);
        if (!range) {
          return NextResponse.json({ error: "Invalid month" }, { status: 400 });
        }
        from = range.start;
        to = range.end;
      } else {
        from = new Date();
        from.setMonth(from.getMonth() - 12);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
      }

      const payments = await fetchCourtPayPayments({ venueId, from, to });
      const rows = await enrichPayments(venueId, payments);

      return NextResponse.json({
        level: "export",
        venue,
        from: from.toISOString(),
        to: to.toISOString(),
        payments: rows,
      });
    }

    // Export per-session consolidated rows (for monthly / weekly breakdown exports)
    if (exportSessions) {
      let from: Date;
      let to: Date = new Date();
      to.setHours(23, 59, 59, 999);

      if (weekStartParam && weekEndParam) {
        const ws = parseDateParam(weekStartParam);
        const we = parseDateParam(weekEndParam);
        if (!ws || !we) return NextResponse.json({ error: "Invalid week range" }, { status: 400 });
        from = ws;
        to = we;
        to.setHours(23, 59, 59, 999);
      } else if (month) {
        const range = parseMonthParam(month);
        if (!range) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
        from = range.start;
        to = range.end;
      } else {
        from = new Date();
        from.setMonth(from.getMonth() - 12);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
      }

      function classifyPmt(p: { paymentMethod: string; type: string }): "qr" | "cash" | "sub" {
        if (p.paymentMethod === "cash") return "cash";
        if (p.paymentMethod === "subscription" || p.type === "subscription") return "sub";
        return "qr";
      }

      const rawSessions = await prisma.session.findMany({
        where: {
          venueId,
          status: { in: ["closed", "open"] },
          openedAt: { gte: from, lte: to },
        },
        orderBy: { openedAt: "desc" },
        include: {
          staff: { select: { name: true } },
          _count: { select: { queueEntries: true } },
        },
      });

      const sessionRows = await Promise.all(
        rawSessions.map(async (s) => {
          const periodEnd = s.closedAt ? new Date(s.closedAt) : new Date();
          const periodStart = new Date(s.openedAt);

          const reclubExpected: number | null = (() => {
            const snap = s.reclubSnapshot as { totalExpected?: number } | null;
            if (snap && typeof snap.totalExpected === "number") return snap.totalExpected;
            const roster = s.reclubRoster as Array<{ players?: unknown[] }> | null;
            if (Array.isArray(roster) && roster.length > 0) {
              return roster.reduce((sum, ev) => sum + (Array.isArray(ev.players) ? ev.players.length : 0), 0);
            }
            return null;
          })();

          const payments = await prisma.pendingPayment.findMany({
            where: {
              venueId,
              OR: [
                {
                  status: "confirmed",
                  OR: [
                    { sessionId: s.id },
                    { checkInPlayerId: { not: null }, confirmedAt: { gte: periodStart, lte: periodEnd } },
                  ],
                },
                {
                  status: "cancelled",
                  cancelReason: { not: null },
                  OR: [
                    { sessionId: s.id },
                    { checkInPlayerId: { not: null }, confirmedAt: { gte: periodStart, lte: periodEnd } },
                  ],
                },
              ],
            },
            select: { amount: true, paymentMethod: true, type: true, partyCount: true, status: true, checkInPlayerId: true },
          });

          // Collect player IDs that paid via subscription to batch-check free pass status
          const subPlayerIds = payments
            .filter((p) => p.status === "confirmed" && classifyPmt(p) === "sub" && p.checkInPlayerId)
            .map((p) => p.checkInPlayerId as string);

          const freePassPlayerIds = new Set<string>();
          if (subPlayerIds.length > 0) {
            const activeSubs = await prisma.playerSubscription.findMany({
              where: {
                playerId: { in: subPlayerIds },
                venueId,
                status: "active",
              },
              select: {
                playerId: true,
                package: { select: { isFreePass: true } },
              },
            });
            for (const sub of activeSubs) {
              if (sub.package.isFreePass) {
                freePassPlayerIds.add(sub.playerId);
              }
            }
          }

          let qr = 0, cash = 0, sub = 0, freePass = 0, paymentPeopleTotal = 0;
          const confirmedPayments = payments.filter((p) => p.status === "confirmed");
          for (const p of payments) {
            const party = typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1;
            paymentPeopleTotal += party;
            if (p.status !== "confirmed") continue;
            const b = classifyPmt(p);
            if (b === "qr") qr += 1;
            else if (b === "cash") cash += 1;
            else {
              if (p.checkInPlayerId && freePassPlayerIds.has(p.checkInPlayerId)) {
                freePass += 1;
              } else {
                sub += 1;
              }
            }
          }

          const playerCount = paymentPeopleTotal > 0 ? paymentPeopleTotal : s._count.queueEntries;
          const revenue = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);

          let duration = "";
          if (s.closedAt) {
            const diffMs = s.closedAt.getTime() - s.openedAt.getTime();
            const totalMin = Math.round(diffMs / 60000);
            const h = Math.floor(totalMin / 60);
            const min = totalMin % 60;
            duration = `${h}:${String(min).padStart(2, "0")}`;
          }

          const fmtDate = (d: Date) => {
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const yyyy = d.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
          };
          const fmtTime = (d: Date) =>
            `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

          return {
            date: fmtDate(s.openedAt),
            sessionStart: fmtTime(s.openedAt),
            sessionEnd: s.closedAt ? fmtTime(s.closedAt) : "",
            duration,
            staffName: s.staff?.name ?? "",
            initialPrice: s.sessionFee,
            totalRevenue: revenue,
            totalPayments: confirmedPayments.length,
            qrCount: qr,
            cashCount: cash,
            subsCount: sub,
            freePassCount: freePass,
            reclubExpected: reclubExpected ?? "",
            totalPlayers: playerCount,
          };
        })
      );

      // Include any session that had at least one confirmed payment (even at 0 VND, e.g. free pass)
      const nonEmptySessions = sessionRows.filter((s) => s.totalPayments > 0);

      return NextResponse.json({ level: "sessions-export", venue, sessions: nonEmptySessions });
    }

    // Week level
    if (weekStartParam) {
      const ws = parseDateParam(weekStartParam);
      if (!ws) {
        return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
      }
      const we = weekEndParam ? parseDateParam(weekEndParam) : getWeekEndLocal(ws);
      if (!we) {
        return NextResponse.json({ error: "Invalid weekEnd" }, { status: 400 });
      }
      we.setHours(23, 59, 59, 999);

      const [payments, sessionCandidates] = await Promise.all([
        fetchCourtPayPayments({ venueId, from: ws, to: we }),
        prisma.session.findMany({
          where: {
            venueId,
            openedAt: { lte: we },
            OR: [{ closedAt: null }, { closedAt: { gte: ws } }],
          },
          select: {
            id: true,
            date: true,
            openedAt: true,
            closedAt: true,
            status: true,
            type: true,
            title: true,
            openedOnDevice: true,
            staff: { select: { name: true } },
          },
          orderBy: { openedAt: "asc" },
        }),
      ]);

      const sessionMap = new Map<
        string,
        {
          id: string;
          title: string | null;
          type: string;
          status: string;
          openedAt: string;
          closedAt: string | null;
          hostName: string | null;
          openedOnDevice: string | null;
          payments: typeof payments;
        }
      >();

      for (const p of payments) {
        const resolved = resolvePaymentSession(p, sessionCandidates);
        if (!resolved) continue;
        const sid = resolved.id;
        const candidate = sessionCandidates.find((c) => c.id === sid);
        if (!sessionMap.has(sid)) {
          sessionMap.set(sid, {
            id: sid,
            title: resolved.title,
            type: resolved.type,
            status: resolved.status,
            openedAt: resolved.openedAt.toISOString(),
            closedAt: resolved.closedAt?.toISOString() ?? null,
            hostName: resolved.staff?.name ?? null,
            openedOnDevice: candidate?.openedOnDevice ?? null,
            payments: [],
          });
        }
        sessionMap.get(sid)!.payments.push(p);
      }

      const sessions = [...sessionMap.values()]
        .map((s) => {
          const confirmed = s.payments.filter((p) => p.status === "confirmed");
          const playerIds = new Set(
            s.payments.map((p) => p.checkInPlayerId).filter(Boolean)
          );
          return {
            id: s.id,
            title: s.title,
            type: s.type,
            status: s.status,
            openedAt: s.openedAt,
            closedAt: s.closedAt,
            hostName: s.hostName,
            openedOnDevice: s.openedOnDevice,
            paymentCount: s.payments.length,
            revenue: confirmed.reduce((sum, p) => sum + p.amount, 0),
            playerCount: playerIds.size,
            cancelledCount: s.payments.filter((p) => p.status === "cancelled").length,
          };
        })
        .sort(
          (a, b) =>
            new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
        );

      const kpis = computeKpis(payments, collectSessionIds(payments));
      // Players KPI = sum of per-session player counts (matches the Player column in the table)
      const weekKpis = {
        ...kpis,
        uniquePlayers: sessions.reduce((sum, s) => sum + s.playerCount, 0),
      };

      return NextResponse.json({
        level: "week",
        venue,
        weekStart: ws.toISOString(),
        weekEnd: we.toISOString(),
        month: month ?? monthKey(ws),
        kpis: weekKpis,
        sessions,
      });
    }

    // Month level
    if (month) {
      const range = parseMonthParam(month);
      if (!range) {
        return NextResponse.json(
          { error: "Invalid month (use YYYY-MM)" },
          { status: 400 }
        );
      }

      const [payments, sessionCandidates] = await Promise.all([
        fetchCourtPayPayments({ venueId, from: range.start, to: range.end }),
        prisma.session.findMany({
          where: {
            venueId,
            openedAt: { lte: range.end },
            OR: [{ closedAt: null }, { closedAt: { gte: range.start } }],
          },
          select: {
            id: true, date: true, openedAt: true, closedAt: true,
            status: true, type: true, title: true,
            staff: { select: { name: true } },
          },
          orderBy: { openedAt: "asc" },
        }),
      ]);

      const weekBuckets = groupByWeek(payments, sessionCandidates);
      const weeks = [...weekBuckets.entries()]
        .map(([, b]) => {
          const kpis = computeKpis(b.payments, b.sessionIds);
          // Per-week Players = sum of distinct players per session in that week
          const sessionPlayerCounts = new Map<string, Set<string>>();
          for (const p of b.payments) {
            const resolved = resolvePaymentSession(p, sessionCandidates);
            if (!resolved || !p.checkInPlayerId) continue;
            if (!sessionPlayerCounts.has(resolved.id)) sessionPlayerCounts.set(resolved.id, new Set());
            sessionPlayerCounts.get(resolved.id)!.add(p.checkInPlayerId);
          }
          const weekPlayerSum = [...sessionPlayerCounts.values()].reduce((sum, set) => sum + set.size, 0);
          return {
            weekStart: b.weekStart.toISOString(),
            weekEnd: b.weekEnd.toISOString(),
            weekLabel: `${b.weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${b.weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
            ...kpis,
            uniquePlayers: weekPlayerSum,
          };
        })
        .sort(
          (a, b) =>
            new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
        );

      const kpis = computeKpis(payments, collectSessionIds(payments, sessionCandidates));
      // Players KPI = sum of per-week player counts (matches the Players column in the table)
      const monthKpis = {
        ...kpis,
        uniquePlayers: weeks.reduce((sum, w) => sum + w.uniquePlayers, 0),
      };

      return NextResponse.json({
        level: "month",
        venue,
        month,
        kpis: monthKpis,
        weeks,
      });
    }

    // Venue level — last 12 months
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    const [payments, sessionCandidates] = await Promise.all([
      fetchCourtPayPayments({ venueId, from, to }),
      prisma.session.findMany({
        where: {
          venueId,
          openedAt: { lte: to },
          OR: [{ closedAt: null }, { closedAt: { gte: from } }],
        },
        select: {
          id: true, date: true, openedAt: true, closedAt: true,
          status: true, type: true, title: true,
          staff: { select: { name: true } },
        },
        orderBy: { openedAt: "asc" },
      }),
    ]);
    const monthBuckets = groupByMonth(payments, sessionCandidates);
    const months = [...monthBuckets.entries()]
      .map(([key, b]) => {
        const kpis = computeKpis(b.payments, b.sessionIds);
        // Per-month Players = sum of distinct players per session in that month
        const sessionPlayerCounts = new Map<string, Set<string>>();
        for (const p of b.payments) {
          const resolved = resolvePaymentSession(p, sessionCandidates);
          if (!resolved || !p.checkInPlayerId) continue;
          if (!sessionPlayerCounts.has(resolved.id)) sessionPlayerCounts.set(resolved.id, new Set());
          sessionPlayerCounts.get(resolved.id)!.add(p.checkInPlayerId);
        }
        const monthPlayerSum = [...sessionPlayerCounts.values()].reduce((sum, set) => sum + set.size, 0);
        const [y, m] = key.split("-").map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        });
        return { month: key, monthLabel: label, ...kpis, uniquePlayers: monthPlayerSum };
      })
      .sort((a, b) => b.month.localeCompare(a.month));

    const kpis = computeKpis(payments, collectSessionIds(payments, sessionCandidates));
    // Players KPI = sum of per-month player counts (matches the Players column in the table)
    const venueKpis = {
      ...kpis,
      uniquePlayers: months.reduce((sum, m) => sum + m.uniquePlayers, 0),
    };

    return NextResponse.json({
      level: "venue",
      venue,
      kpis: venueKpis,
      months,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
