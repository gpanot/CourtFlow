import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PLAYER_JWT_SECRET =
  process.env.PLAYER_JWT_SECRET || process.env.JWT_SECRET || "courtflow-dev-secret-change-in-production";

export interface PlayerTokenPayload {
  playerId: string;
  email: string;
  type: "player_credentials";
}

export function signPlayerToken(payload: PlayerTokenPayload): string {
  return jwt.sign(payload, PLAYER_JWT_SECRET, { expiresIn: "30d" });
}

export function verifyPlayerToken(token: string): PlayerTokenPayload | null {
  try {
    const decoded = jwt.verify(token, PLAYER_JWT_SECRET) as PlayerTokenPayload;
    if (decoded.type !== "player_credentials") return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return error("Email and password are required", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const account = await prisma.playerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "credentials",
          providerAccountId: normalizedEmail,
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            registrationVenueId: true,
          },
        },
      },
    });

    if (!account?.passwordHash) {
      return error("Invalid email or password", 401);
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      return error("Invalid email or password", 401);
    }

    const player = account.player;
    const hasRealPhone =
      player.phone &&
      !player.phone.startsWith("oauth_") &&
      !player.phone.startsWith("email_");
    const onboardingComplete = !!hasRealPhone && !!player.registrationVenueId;

    const token = signPlayerToken({
      playerId: player.id,
      email: normalizedEmail,
      type: "player_credentials",
    });

    return json({
      token,
      playerId: player.id,
      name: player.name,
      email: player.email ?? normalizedEmail,
      onboardingComplete,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
