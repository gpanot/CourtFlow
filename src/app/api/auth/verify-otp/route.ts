import { NextRequest, NextResponse } from "next/server";
import { verifyOtp, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { setPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";
import { logPlayerAppAuth } from "@/lib/player-app-auth-log";
import { isWalkInSyntheticPhone } from "@/lib/walk-in-phone";

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await parseBody<{ phone: string; code: string }>(request);
    if (!phone || !code) return error("Phone and code are required");
    if (isWalkInSyntheticPhone(phone)) {
      return error("Walk-in synthetic phone numbers cannot verify OTP", 400);
    }

    const result = await verifyOtp(phone, code);
    if (!result.valid) return error(result.error || "Invalid code", 401);

    const existingPlayer = await prisma.player.findUnique({ where: { phone } });

    if (existingPlayer) {
      const openSession = await prisma.session.findFirst({
        where: { status: "open" },
        orderBy: { openedAt: "desc" },
        select: { id: true },
      });
      void logPlayerAppAuth(existingPlayer.id, "phone_otp", openSession?.id);

      const token = signToken({ id: existingPlayer.id, role: "player" });
      const res = NextResponse.json({
        token,
        player: existingPlayer,
        isNew: false,
      });
      setPlayerAuthCookieOnResponse(res, token);
      return res;
    }

    return json({ verified: true, phone, isNew: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
