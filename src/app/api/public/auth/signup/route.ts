import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || name.trim().length < 2)
      return error("Name must be at least 2 characters", 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return error("Invalid email address", 400);
    if (!password || password.length < 8)
      return error("Password must be at least 8 characters", 400);

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.playerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "credentials",
          providerAccountId: normalizedEmail,
        },
      },
    });
    if (existing) return error("An account with this email already exists", 409);

    const passwordHash = await bcrypt.hash(password, 12);

    const player = await prisma.player.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: `email_${normalizedEmail}`,
        gender: "male",
        skillLevel: "beginner",
      },
    });

    await prisma.playerAccount.create({
      data: {
        playerId: player.id,
        provider: "credentials",
        providerAccountId: normalizedEmail,
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        emailVerified: false,
      },
    });

    return json({ playerId: player.id }, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
