import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

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
  const search = params.get("search");

  const where: Prisma.StaffAuthLogWhereInput = {};

  if (staffId) where.staffId = staffId;
  if (action) where.action = action;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      where.createdAt.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  if (search) {
    where.OR = [
      { phone: { contains: search, mode: "insensitive" } },
      { staff: { name: { contains: search, mode: "insensitive" } } },
      { ipAddress: { contains: search } },
      { city: { contains: search, mode: "insensitive" } },
      { country: { contains: search, mode: "insensitive" } },
      { fingerprintId: { contains: search } },
    ];
  }

  const [logs, total] = await Promise.all([
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
  ]);

  return json({ logs, total, page, limit });
}
