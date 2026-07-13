import { NextRequest, NextResponse } from "next/server";
import { validatePromoCode } from "@/modules/marketing/lib/promo-code";
import { getPortalVenueId } from "@/lib/venue-config";
import type { PromoBookingType } from "@/modules/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      venueId: bodyVenueId,
      playerId,
      bookingType,
      originalPrice,
    } = body as {
      code: string;
      venueId?: string;
      playerId: string;
      bookingType: PromoBookingType;
      originalPrice: number;
    };

    if (!code || !playerId || !bookingType || originalPrice == null) {
      return NextResponse.json({ valid: false, reason: "invalid_request" }, { status: 400 });
    }

    const venueId = bodyVenueId || getPortalVenueId();

    const result = await validatePromoCode({
      code,
      venueId,
      playerId,
      bookingType,
      originalPrice,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[promo/validate]", err);
    return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
  }
}
