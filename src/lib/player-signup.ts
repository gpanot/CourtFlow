import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export class SignupValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 409 = 400
  ) {
    super(message);
    this.name = "SignupValidationError";
  }
}

/**
 * Creates a new player account using email/password credentials.
 *
 * Validates inputs, checks for duplicate accounts, then writes two rows:
 *  - Player (with placeholder phone until onboarding completes)
 *  - PlayerAccount (provider="credentials", bcrypt-hashed password)
 *
 * Throws SignupValidationError (400) on invalid input, (409) on duplicate.
 * Throws raw errors from Prisma for unexpected DB failures.
 *
 * No side effects beyond DB writes — no emails, no tokens, no cookies.
 */
export async function createCredentialsPlayer(
  name: string,
  email: string,
  password: string
): Promise<{ playerId: string }> {
  if (!name || name.trim().length < 2)
    throw new SignupValidationError("Name must be at least 2 characters");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new SignupValidationError("Invalid email address");
  if (!password || password.length < 8)
    throw new SignupValidationError("Password must be at least 8 characters");

  const normalizedEmail = email.toLowerCase().trim();

  console.log("[createCredentialsPlayer] checking existing account for:", normalizedEmail);
  const existing = await prisma.playerAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "credentials",
        providerAccountId: normalizedEmail,
      },
    },
  });
  if (existing) {
    console.log("[createCredentialsPlayer] account already exists");
    throw new SignupValidationError("An account with this email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  console.log("[createCredentialsPlayer] creating player...");
  const player = await prisma.player.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      phone: `email_${normalizedEmail}`,
      gender: "male",
      skillLevel: "beginner",
    },
  });
  console.log("[createCredentialsPlayer] player created:", player.id);

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
  console.log("[createCredentialsPlayer] account created, done");

  return { playerId: player.id };
}
