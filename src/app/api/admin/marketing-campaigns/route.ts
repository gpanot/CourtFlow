import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { normalizePromoCode } from "@/modules/marketing/lib/promo-code";
import type { CampaignListItem } from "@/modules/marketing/types";

function authErrorResponse(msg: string) {
  if (
    msg === "Authentication required" ||
    msg === "Missing authorization token" ||
    msg === "Invalid or expired token" ||
    msg === "Manager or super admin access required"
  ) {
    return error(msg, 401);
  }
  return null;
}

export const dynamic = "force-dynamic";

/** GET /api/admin/marketing-campaigns?venueId= */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const codes = await prisma.promoCode.findMany({
      where: { venueId },
      include: {
        redemptions: {
          select: { finalPrice: true, utmSource: true },
        },
        linkClicks: {
          select: { utmSource: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();

    const campaigns: CampaignListItem[] = codes.map((c) => {
      const totalClicks = c.linkClicks.length;
      const totalRevenue = c.redemptions.reduce((s, r) => s + r.finalPrice, 0);

      // Top channel by click count
      const channelCounts: Record<string, number> = {};
      for (const click of c.linkClicks) {
        if (click.utmSource) {
          channelCounts[click.utmSource] = (channelCounts[click.utmSource] ?? 0) + 1;
        }
      }
      const topChannel = Object.keys(channelCounts).sort(
        (a, b) => channelCounts[b] - channelCounts[a]
      )[0] ?? null;

      let status: "active" | "scheduled" | "ended";
      if (!c.isActive || (c.endsAt && c.endsAt < now)) {
        status = "ended";
      } else if (c.startsAt > now) {
        status = "scheduled";
      } else {
        status = "active";
      }

      return {
        id: c.id,
        name: c.name,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        appliesTo: c.appliesTo,
        maxRedemptions: c.maxRedemptions,
        redemptionCount: c.redemptionCount,
        isActive: c.isActive,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        totalClicks,
        totalRevenue,
        topChannel,
        status,
      };
    });

    return json(campaigns);
  } catch (e) {
    const msg = (e as Error).message;
    return authErrorResponse(msg) ?? error(msg, 500);
  }
}

/** POST /api/admin/marketing-campaigns */
export async function POST(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
    const body = await request.json() as {
      venueId: string;
      name: string;
      code: string;
      discountType: "percent" | "fixed" | "free";
      discountValue?: number | null;
      appliesTo?: string;
      maxRedemptions?: number | null;
      maxRedemptionsPerPlayer?: number | null;
      startsAt: string;
      endsAt?: string | null;
      postText?: string | null;
      headline?: string | null;
    };

    const {
      venueId,
      name,
      code,
      discountType,
      discountValue = null,
      appliesTo = "all",
      maxRedemptions = null,
      maxRedemptionsPerPlayer = 1,
      startsAt,
      endsAt = null,
      postText = null,
      headline = null,
    } = body;

    if (!venueId || !name || !code || !discountType || !startsAt) {
      return error("venueId, name, code, discountType, and startsAt are required", 400);
    }

    // Validate discount value
    if (discountType === "percent" && (discountValue == null || discountValue <= 0 || discountValue > 100)) {
      return error("Percent discount must be between 1 and 100", 400);
    }
    if (discountType === "fixed" && (discountValue == null || discountValue <= 0)) {
      return error("Fixed discount must be a positive integer in the venue's currency", 400);
    }

    const normalizedCode = normalizePromoCode(code);

    const promo = await prisma.promoCode.create({
      data: {
        venueId,
        name,
        code: normalizedCode,
        discountType,
        discountValue: discountType === "free" ? null : discountValue,
        appliesTo: appliesTo as "court_booking" | "coaching" | "open_play" | "all",
        maxRedemptions,
        maxRedemptionsPerPlayer,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        postText,
        headline,
      },
    });

    return json(promo, 201);
  } catch (e) {
    const msg = (e as Error).message;
    const authErr = authErrorResponse(msg);
    if (authErr) return authErr;
    if ((e as { code?: string }).code === "P2002") {
      return error("A promo code with that code already exists for this venue", 409);
    }
    return error(msg, 500);
  }
}
