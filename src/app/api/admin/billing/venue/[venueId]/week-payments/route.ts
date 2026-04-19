import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getBillablePaymentsForWeek, getWeekBounds } from "@/lib/billing";

function parseDateParam(input: string | null): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;
    const { searchParams } = new URL(req.url);
    const fallback = getWeekBounds();
    const weekStart = parseDateParam(searchParams.get("weekStart")) ?? fallback.weekStart;
    const weekEnd = parseDateParam(searchParams.get("weekEnd")) ?? fallback.weekEnd;
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
