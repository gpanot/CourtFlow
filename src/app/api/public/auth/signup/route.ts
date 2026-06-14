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

    console.log("[signup API] received — email:", email, "name:", name, "DATABASE_URL set:", !!process.env.DATABASE_URL);

    if (!name || name.trim().length < 2)
      return error("Name must be at least 2 characters", 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return error("Invalid email address", 400);
    if (!password || password.length < 8)
      return error("Password must be at least 8 characters", 400);

    const normalizedEmail = email.toLowerCase().trim();

    console.log("[signup API] checking existing account for:", normalizedEmail);
    const existing = await prisma.playerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "credentials",
          providerAccountId: normalizedEmail,
        },
      },
    });
    if (existing) { console.log("[signup API] account already exists"); return error("An account with this email already exists", 409); }

    const passwordHash = await bcrypt.hash(password, 12);

    console.log("[signup API] creating player...");
    const player = await prisma.player.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: `email_${normalizedEmail}`,
        gender: "male",
        skillLevel: "beginner",
      },
    });
    console.log("[signup API] player created:", player.id);

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
    console.log("[signup API] account created, done");

    return json({ playerId: player.id }, 201);
  } catch (e) {
    console.error("[signup API] error:", (e as Error).message, (e as Error).stack?.slice(0, 300));
    return error((e as Error).message, 500);
  }
}
