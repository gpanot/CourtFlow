import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { resolveVenueId } from "@/lib/venue-config";
import { getAvailableSlots } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const venueId = resolveVenueId(request);
    const dateParam = request.nextUrl.searchParams.get("date");
    // "YYYY-MM-DD" → UTC midnight to match what PG stores in the DATE column
    const date = dateParam
      ? new Date(dateParam.split("T")[0])
      : (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })();

    const slots = await getAvailableSlots(venueId, date);

    return json(slots);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
