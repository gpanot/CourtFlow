import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { payos } from "@/lib/payos";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    if (!validateKioskSecret(request)) {
      return error("Unauthorized", 401);
    }

    const body = await request.json() as { playerId?: string };
    const { playerId } = body;

    if (!playerId) {
      return error("playerId is required", 400);
    }

    // Use the most recently created pack for this player
    const stickerPack = await prisma.playerStickerPack.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      include: { player: { select: { name: true } } },
    });

    if (!stickerPack) {
      return error("Player has no sticker pack", 404);
    }

    // Delete any existing session for this player
    await prisma.stickerSession.deleteMany({ where: { playerId } });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const session = await prisma.stickerSession.create({
      data: { playerId, expiresAt },
    });

    const appUrl =
      process.env.APP_URL ??
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "");

    const kioskSettings = await prisma.kioskSettings.findUnique({ where: { id: "global" } });
    const price = kioskSettings?.stickerPrice ?? 30000;
    const playerFirstName = stickerPack.player.name.split(" ")[0];

    // PayOS requires a unique numeric orderCode (max 9007199254740991)
    // Use last 9 digits of epoch ms — safe for reasonable transaction volumes
    const orderCode = Number(Date.now().toString().slice(-9));
    const payosOrderCode = String(orderCode);

    // Build the PayOS payment link
    const returnUrl = `${appUrl}/my-balance?sticker_token=${session.token}&paid=true`;
    const cancelUrl = `${appUrl}/my-balance?sticker_token=${session.token}&cancelled=true`;

    let checkoutUrl: string | null = null;
    let qrCode: string | null = null;

    try {
      const paymentLink = await payos.paymentRequests.create({
        orderCode,
        amount: price,
        description: `Sticker ${playerFirstName}`.slice(0, 25), // PayOS max 25 chars
        returnUrl,
        cancelUrl,
      });
      checkoutUrl = paymentLink.checkoutUrl ?? null;
      qrCode = paymentLink.qrCode ?? null;

      // Store the PayOS order code on the pack for webhook matching
      await prisma.playerStickerPack.update({
        where: { id: stickerPack.id },
        data: { payosOrderCode },
      });

      console.log(`[sticker-session] PayOS payment link created — orderCode: ${orderCode} — ${price} VND`);
    } catch (payosErr) {
      console.error("[sticker-session] PayOS createPaymentLink failed:", payosErr);
      // Fall through — return session without payment link so kiosk can still show stickers
    }

    const shopUrl = `${appUrl}/my-balance?sticker_token=${session.token}&paid=true`;
    const stickers = [
      stickerPack.sticker1Url,
      stickerPack.sticker2Url,
      stickerPack.sticker3Url,
      stickerPack.sticker4Url,
    ].filter(Boolean) as string[];

    return json({
      token: session.token,
      shopUrl,
      playerName: playerFirstName,
      stickers,
      isPaid: stickerPack.isPaid,
      // PayOS fields
      checkoutUrl,
      qrCode,
      payosOrderCode,
      price,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
