import { NextRequest } from "next/server";
import { verifyOtp, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await parseBody<{ phone: string; code: string }>(request);
    if (!phone || !code) return error("Phone and code are required");

    const result = await verifyOtp(phone, code);
    if (!result.valid) return error(result.error || "Invalid code", 401);

    const existingPlayer = await prisma.player.findUnique({ where: { phone } });

    if (existingPlayer) {
      const token = signToken({ id: existingPlayer.id, role: "player" });
      return json({
        token,
        player: existingPlayer,
        isNew: false,
      });
    }

    return json({ verified: true, phone, isNew: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
