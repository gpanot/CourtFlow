import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { consumePasswordResetToken, PasswordResetError } from "@/lib/player-reset-password";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: string; password?: string };
    const { token, password } = body;

    if (!token || typeof token !== "string") {
      return error("Invalid or missing token.", 400);
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return error("Password must be at least 8 characters.", 400);
    }

    let playerId: string;
    try {
      ({ playerId } = await consumePasswordResetToken(token));
    } catch (e) {
      if (e instanceof PasswordResetError) {
        const statusMap = { expired: 410, already_used: 410, invalid: 400 } as const;
        return error(e.message, statusMap[e.code]);
      }
      throw e;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.playerAccount.updateMany({
      where: { playerId, provider: "credentials" },
      data: { passwordHash },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[reset-password/confirm] error:", (e as Error).message);
    return error("Something went wrong. Please try again.", 500);
  }
}
