import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { getAvailableSlots } from "@/lib/booking";

export async function GET(request: NextRequest) {
  try {
    requireAuth(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!venueId) return error("venueId is required");
    if (!dateStr) return error("date is required");

    const date = new Date(dateStr);
    const slots = await getAvailableSlots(venueId, date);

    return json(slots);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
