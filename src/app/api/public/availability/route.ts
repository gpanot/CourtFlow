import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { resolveVenueId } from "@/lib/venue-config";
import { getAvailableSlots } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const venueId = resolveVenueId(request);
    const dateParam = request.nextUrl.searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : new Date();
    date.setHours(0, 0, 0, 0);

    const slots = await getAvailableSlots(venueId, date);

    return json(slots);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
