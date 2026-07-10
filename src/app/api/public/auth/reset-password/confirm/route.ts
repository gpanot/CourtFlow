import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { consumePasswordResetToken, PasswordResetError } from "@/lib/player-reset-password";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signPlayerToken } from "@/app/api/public/auth/login/route";

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

    // Also mark emailVerified: true — the player clicked an emailed link,
    // which implicitly proves they own the address (both for activation and reset flows).
    const account = await prisma.playerAccount.findFirst({
      where: { playerId, provider: "credentials" },
      select: { id: true, providerAccountId: true },
    });

    if (!account) {
      console.error("[reset-password/confirm] No credentials account found for playerId:", playerId);
      return error("Account not found.", 400);
    }

    await prisma.playerAccount.update({
      where: { id: account.id },
      data: { passwordHash, emailVerified: true },
    });

    // Issue a session token so the caller can sign the player in immediately
    // (used by the /book/auth/setup-password page to auto-sign-in after account setup).
    const sessionToken = signPlayerToken({
      playerId,
      email: account.providerAccountId,
      type: "player_credentials",
    });

    return json({ ok: true, email: account.providerAccountId, sessionToken });
  } catch (e) {
    console.error("[reset-password/confirm] error:", (e as Error).message);
    return error("Something went wrong. Please try again.", 500);
  }
}
