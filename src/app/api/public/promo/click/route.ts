import { NextRequest, NextResponse } from "next/server";
import { logPromoLinkClick } from "@/modules/marketing/lib/promo-code";
import { getPortalVenueId } from "@/lib/venue-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      venueId: bodyVenueId,
      utmSource = null,
      deviceSessionId,
      playerId = null,
    } = body as {
      code: string;
      venueId?: string;
      utmSource?: string | null;
      deviceSessionId: string;
      playerId?: string | null;
    };

    if (!code || !deviceSessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const venueId = bodyVenueId || getPortalVenueId();

    // Fire-and-forget — logPromoLinkClick never throws
    await logPromoLinkClick({ code, venueId, utmSource, deviceSessionId, playerId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
