import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const sp = request.nextUrl.searchParams;
    const venueId = sp.get("venueId");
    const status = sp.get("status"); // confirmed | cancelled | completed | no_show | all
    const paymentStatus = sp.get("paymentStatus"); // pending | proof_submitted | paid | all
    const search = sp.get("search"); // player name / phone
    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10)));

    if (!venueId) return error("venueId is required", 400);

    const now = new Date();
    // Always exclude expired pending holds that haven't been cleaned up by cron yet
    const where: Record<string, unknown> = {
      venueId,
      NOT: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
      },
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (paymentStatus && paymentStatus !== "all") {
      if (paymentStatus === "paid") {
        where.paymentStatus = { in: ["paid", "PAID"] };
      } else if (paymentStatus === "pending") {
        // paymentStatus is nullable — null and "pending" both mean unpaid
        where.OR = [
          { paymentStatus: "pending" },
          { paymentStatus: { equals: null } },
        ];
      } else {
        where.paymentStatus = paymentStatus;
      }
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) {
        const d = new Date(dateFrom);
        d.setHours(0, 0, 0, 0);
        dateFilter.gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }
      where.date = dateFilter;
    }

    if (search && search.trim().length >= 2) {
      where.player = {
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { phone: { contains: search.trim() } },
        ],
      };
    }

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where: where as never }),
      prisma.booking.findMany({
        where: where as never,
        include: {
          court: { select: { id: true, label: true } },
          player: { select: { id: true, name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
        },
        orderBy: { startTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return json({ bookings, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
