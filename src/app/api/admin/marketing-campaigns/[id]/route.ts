import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import type { CampaignDetail, CampaignRedemptionRow } from "@/modules/marketing/types";

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

/** GET /api/admin/marketing-campaigns/[id] — campaign detail + redemption rows */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const promo = await prisma.promoCode.findUnique({
      where: { id },
      include: {
        redemptions: {
          include: {
            player: { select: { name: true, phone: true } },
            firstClick: { select: { clickedAt: true } },
          },
          orderBy: { redeemedAt: "desc" },
        },
        linkClicks: { select: { utmSource: true, clickedAt: true } },
      },
    });

    if (!promo) return error("Campaign not found", 404);

    const now = new Date();
    const totalClicks = promo.linkClicks.length;
    const totalRevenue = promo.redemptions.reduce((s, r) => s + r.finalPrice, 0);

    // Top channel
    const channelCounts: Record<string, number> = {};
    for (const click of promo.linkClicks) {
      if (click.utmSource) {
        channelCounts[click.utmSource] = (channelCounts[click.utmSource] ?? 0) + 1;
      }
    }
    const topChannel = Object.keys(channelCounts).sort(
      (a, b) => channelCounts[b] - channelCounts[a]
    )[0] ?? null;

    let status: "active" | "scheduled" | "ended";
    if (!promo.isActive || (promo.endsAt && promo.endsAt < now)) {
      status = "ended";
    } else if (promo.startsAt > now) {
      status = "scheduled";
    } else {
      status = "active";
    }

    // Median time-to-convert (only for redemptions with firstClick)
    const timesToConvert = promo.redemptions
      .filter((r) => r.firstClick)
      .map((r) => r.redeemedAt.getTime() - r.firstClick!.clickedAt.getTime());
    let medianTimeToConvertMs: number | null = null;
    if (timesToConvert.length > 0) {
      timesToConvert.sort((a, b) => a - b);
      const mid = Math.floor(timesToConvert.length / 2);
      medianTimeToConvertMs = timesToConvert.length % 2 === 0
        ? (timesToConvert[mid - 1] + timesToConvert[mid]) / 2
        : timesToConvert[mid];
    }

    const redemptionRows: CampaignRedemptionRow[] = promo.redemptions.map((r) => {
      let timeToConvertMs: number | null = null;
      let convertBucket: CampaignRedemptionRow["convertBucket"] = "no_click";

      if (r.firstClick) {
        timeToConvertMs = r.redeemedAt.getTime() - r.firstClick.clickedAt.getTime();
        const hours = timeToConvertMs / (1000 * 60 * 60);
        if (hours < 0.5) convertBucket = "instant";
        else if (hours < 24) convertBucket = "same_day";
        else convertBucket = "deliberated";
      }

      return {
        id: r.id,
        playerName: r.player.name,
        playerPhone: r.player.phone ?? "",
        redeemedAt: r.redeemedAt.toISOString(),
        discountAmount: r.discountAmount,
        originalPrice: r.originalPrice,
        finalPrice: r.finalPrice,
        convertBucket,
        timeToConvertMs,
      };
    });

    const detail: CampaignDetail = {
      id: promo.id,
      name: promo.name,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      appliesTo: promo.appliesTo,
      maxRedemptions: promo.maxRedemptions,
      redemptionCount: promo.redemptionCount,
      isActive: promo.isActive,
      startsAt: promo.startsAt.toISOString(),
      endsAt: promo.endsAt?.toISOString() ?? null,
      createdAt: promo.createdAt.toISOString(),
      totalClicks,
      totalRevenue,
      topChannel,
      status,
      totalRedemptions: promo.redemptions.length,
      medianTimeToConvertMs,
      redemptions: redemptionRows,
    };

    return json(detail);
  } catch (e) {
    const msg = (e as Error).message;
    return authErrorResponse(msg) ?? error(msg, 500);
  }
}

/** PATCH /api/admin/marketing-campaigns/[id] — toggle is_active, edit dates/limits */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;
    const body = await request.json() as {
      isActive?: boolean;
      endsAt?: string | null;
      maxRedemptions?: number | null;
      maxRedemptionsPerPlayer?: number | null;
    };

    const promo = await prisma.promoCode.update({
      where: { id },
      data: {
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
        ...(body.maxRedemptions !== undefined && { maxRedemptions: body.maxRedemptions }),
        ...(body.maxRedemptionsPerPlayer !== undefined && { maxRedemptionsPerPlayer: body.maxRedemptionsPerPlayer }),
        updatedAt: new Date(),
      },
    });

    return json(promo);
  } catch (e) {
    const msg = (e as Error).message;
    return authErrorResponse(msg) ?? error(msg, 500);
  }
}
