import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getBillablePaymentsForWeek, getWeekBounds } from "@/lib/billing";

function parseDateParam(input: string | null): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;
    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const weekStartInput = parseDateParam(searchParams.get("weekStart"));
    const weekEndInput = parseDateParam(searchParams.get("weekEnd"));
    const fallback = getWeekBounds();
    const weekStart = weekStartInput ?? fallback.weekStart;
    const weekEnd = weekEndInput ?? fallback.weekEnd;
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    if (weekStart > weekEnd) {
      return NextResponse.json(
        { error: "weekStart must be before weekEnd" },
        { status: 400 }
      );
    }

    const result = await getBillablePaymentsForWeek(venueId, weekStart, weekEnd);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
