import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export interface AuthLogSummaryItem {
  key: string;
  name: string;
  phone: string | null;
  logins: number;
  failed: number;
  blocked: number;
  total: number;
}

function buildWhere(params: {
  staffId: string | null;
  action: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sinceHours: number | null;
  search: string | null;
  includeAction?: boolean;
}): Prisma.StaffAuthLogWhereInput {
  const where: Prisma.StaffAuthLogWhereInput = {};

  if (params.staffId) where.staffId = params.staffId;
  if (params.includeAction !== false && params.action) where.action = params.action;
  if (params.sinceHours) {
    where.createdAt = { gte: new Date(Date.now() - params.sinceHours * 60 * 60 * 1000) };
  } else if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) {
      const from = new Date(params.dateFrom);
      from.setHours(0, 0, 0, 0);
      where.createdAt.gte = from;
    }
    if (params.dateTo) {
      const to = new Date(params.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  if (params.search) {
    where.OR = [
      { phone: { contains: params.search, mode: "insensitive" } },
      { staff: { name: { contains: params.search, mode: "insensitive" } } },
      { ipAddress: { contains: params.search } },
      { city: { contains: params.search, mode: "insensitive" } },
      { country: { contains: params.search, mode: "insensitive" } },
      { fingerprintId: { contains: params.search } },
    ];
  }

  return where;
}

function isLoginAction(action: string) {
  return action === "login_success" || action === "biometric_login";
}

async function buildSummary(where: Prisma.StaffAuthLogWhereInput): Promise<AuthLogSummaryItem[]> {
  const [byStaff, byPhone] = await Promise.all([
    prisma.staffAuthLog.groupBy({
      by: ["staffId", "action"],
      where: { ...where, staffId: { not: null } },
      _count: { id: true },
    }),
    prisma.staffAuthLog.groupBy({
      by: ["phone", "action"],
      where: { ...where, staffId: null },
      _count: { id: true },
    }),
  ]);

  const staffIds = [...new Set(byStaff.map((r) => r.staffId).filter(Boolean))] as string[];
  const staffMembers =
    staffIds.length > 0
      ? await prisma.staffMember.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];

  const staffById = new Map(staffMembers.map((s) => [s.id, s]));
  const summaryMap = new Map<string, AuthLogSummaryItem>();

  const bump = (key: string, name: string, phone: string | null, action: string, count: number) => {
    const existing = summaryMap.get(key) ?? {
      key,
      name,
      phone,
      logins: 0,
      failed: 0,
      blocked: 0,
      total: 0,
    };
    if (isLoginAction(action)) existing.logins += count;
    else if (action === "login_failed") existing.failed += count;
    else if (action === "login_rate_limited") existing.blocked += count;
    existing.total += count;
    summaryMap.set(key, existing);
  };

  for (const row of byStaff) {
    if (!row.staffId) continue;
    const staff = staffById.get(row.staffId);
    bump(
      row.staffId,
      staff?.name ?? "Unknown",
      staff?.phone ?? null,
      row.action,
      row._count.id,
    );
  }

  for (const row of byPhone) {
    const phone = row.phone ?? "unknown";
    bump(`phone:${phone}`, phone === "unknown" ? "Unknown" : phone, row.phone, row.action, row._count.id);
  }

  return [...summaryMap.values()].sort((a, b) => b.total - a.total || b.logins - a.logins);
}

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
  } catch {
    return error("Unauthorized", 401);
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? "30")));
  const staffId = params.get("staffId");
  const action = params.get("action");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const sinceHoursRaw = params.get("sinceHours");
  const sinceHours = sinceHoursRaw ? Math.min(720, Math.max(1, Number(sinceHoursRaw))) : null;
  const search = params.get("search");

  const filterParams = { staffId, action, dateFrom, dateTo, sinceHours, search };
  const where = buildWhere(filterParams);
  const summaryWhere = buildWhere({ ...filterParams, action: null, includeAction: false });

  const [logs, total, summary] = await Promise.all([
    prisma.staffAuthLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        staff: { select: { id: true, name: true, phone: true, role: true } },
      },
    }),
    prisma.staffAuthLog.count({ where }),
    buildSummary(summaryWhere),
  ]);

  return json({ logs, total, page, limit, summary });
}
