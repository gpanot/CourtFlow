import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId?.trim()) return error("venueId is required", 400);

    const staff = await prisma.staffMember.findUnique({
      where: { id: auth.id },
      select: { venues: { where: { id: venueId }, select: { id: true } } },
    });
    if (!staff?.venues.length) return error("Not assigned to this venue", 403);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { bankName: true, bankAccount: true, bankOwnerName: true, settings: true },
    });
    if (!venue) return error("Venue not found", 404);
    const settings = (venue.settings ?? {}) as Record<string, unknown>;

    const openSession = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      orderBy: { openedAt: "desc" },
      select: { sessionFee: true },
    });
    const latestClosedSession = openSession
      ? null
      : await prisma.session.findFirst({
          where: { venueId, status: "closed" },
          orderBy: { openedAt: "desc" },
          select: { sessionFee: true },
        });

    return json({
      bankName: venue.bankName || "",
      bankAccount: venue.bankAccount || "",
      bankOwnerName: venue.bankOwnerName || "",
      sessionFee: openSession?.sessionFee ?? latestClosedSession?.sessionFee ?? 0,
      autoApprovalPhone: typeof settings.autoApprovalPhone === "string" ? settings.autoApprovalPhone : "",
      autoApprovalCCCD: typeof settings.autoApprovalCCCD === "string" ? settings.autoApprovalCCCD : "",
      showSubscriptionsInFlow: settings.showSubscriptionsInFlow !== false, // default true
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      bankName?: string;
      bankAccount?: string;
      bankOwnerName?: string;
      sessionFee?: number;
      autoApprovalPhone?: string;
      autoApprovalCCCD?: string;
      showSubscriptionsInFlow?: boolean;
    }>(request);

    const { venueId } = body;
    if (!venueId?.trim()) return error("venueId is required", 400);

    const staff = await prisma.staffMember.findUnique({
      where: { id: auth.id },
      select: { venues: { where: { id: venueId }, select: { id: true } } },
    });
    if (!staff?.venues.length) return error("Not assigned to this venue", 403);

    const venueUpdate: Record<string, unknown> = {};
    if (body.bankName !== undefined) venueUpdate.bankName = body.bankName || null;
    if (body.bankAccount !== undefined) venueUpdate.bankAccount = body.bankAccount || null;
    if (body.bankOwnerName !== undefined) venueUpdate.bankOwnerName = body.bankOwnerName || null;

    const hasSettingsPayload =
      body.autoApprovalPhone !== undefined ||
      body.autoApprovalCCCD !== undefined ||
      body.showSubscriptionsInFlow !== undefined;
    if (hasSettingsPayload) {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true },
      });
      const currentSettings = (venue?.settings ?? {}) as Record<string, unknown>;
      venueUpdate.settings = {
        ...currentSettings,
        ...(body.autoApprovalPhone !== undefined
          ? { autoApprovalPhone: body.autoApprovalPhone.trim() || null }
          : {}),
        ...(body.autoApprovalCCCD !== undefined
          ? { autoApprovalCCCD: body.autoApprovalCCCD.trim() || null }
          : {}),
        ...(body.showSubscriptionsInFlow !== undefined
          ? { showSubscriptionsInFlow: body.showSubscriptionsInFlow }
          : {}),
      };
    }

    if (Object.keys(venueUpdate).length > 0) {
      await prisma.venue.update({
        where: { id: venueId },
        data: venueUpdate,
      });
    }

    if (body.sessionFee !== undefined && body.sessionFee >= 0) {
      const openSession = await prisma.session.findFirst({
        where: { venueId, status: "open" },
        orderBy: { openedAt: "desc" },
        select: { id: true },
      });
      const targetSession =
        openSession ??
        (await prisma.session.findFirst({
          where: { venueId, status: "closed" },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        }));
      if (targetSession) {
        await prisma.session.update({
          where: { id: targetSession.id },
          data: { sessionFee: body.sessionFee },
        });
      }
    }

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
