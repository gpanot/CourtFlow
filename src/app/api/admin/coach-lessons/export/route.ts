/**
 * GET /api/admin/coach-lessons/export
 * Returns a CSV of coach lessons scoped to a specific coach.
 *
 * Auth: manager/superadmin may export any coach.
 *       A staff member (coach) may only export their own records.
 *
 * Query params:
 *   coachId  (required)
 *   from     ISO date string (inclusive)
 *   to       ISO date string (inclusive)
 *   status   "all" | specific status — defaults to "completed"
 */
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); // HH:MM
}

function durationHours(start: Date, end: Date): string {
  const mins = (end.getTime() - start.getTime()) / 60000;
  return (mins / 60).toFixed(2);
}

function csvEscape(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = requireStaff(request.headers);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const coachId = sp.get("coachId");
  if (!coachId) {
    return NextResponse.json({ error: "coachId is required" }, { status: 400 });
  }

  // Hard auth gate: staff may only export their own data; managers/superadmins may export anyone's
  if (auth.role === "staff" && auth.id !== coachId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fromStr = sp.get("from");
  const toStr = sp.get("to");
  const statusParam = sp.get("status") ?? "completed";

  const where: Record<string, unknown> = { coachId };

  if (statusParam !== "all") {
    where.status = statusParam;
  }

  if (fromStr || toStr) {
    const dateFilter: Record<string, Date> = {};
    if (fromStr) {
      const from = new Date(fromStr);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (toStr) {
      const to = new Date(toStr);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.startTime = dateFilter;
  }

  const lessons = await prisma.coachLesson.findMany({
    where,
    include: {
      player: { select: { name: true } },
      package: { select: { name: true, lessonType: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const header = ["Date", "Start Time", "End Time", "Duration (hrs)", "Player Name", "Lesson Type", "Package", "Status"];
  const rows = lessons.map((l) => [
    fmtDate(l.date),
    fmtTime(l.startTime),
    fmtTime(l.endTime),
    durationHours(l.startTime, l.endTime),
    l.player?.name ?? "",
    l.package?.lessonType ?? "",
    l.package?.name ?? "",
    l.status,
  ]);

  const completedLessons = lessons.filter((l) => l.status === "completed");
  const totalCompletedHours = completedLessons.reduce(
    (sum, l) => sum + (l.endTime.getTime() - l.startTime.getTime()) / 3600000,
    0
  );

  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
    "",
    `Total completed hours,${totalCompletedHours.toFixed(2)}`,
  ];

  const csv = lines.join("\r\n");
  const filename = `coach-lessons-${coachId}-${fmtDate(new Date())}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
