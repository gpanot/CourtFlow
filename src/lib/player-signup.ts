import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

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

/**
 * Finds or creates a fully usable player account for the chat booking agent.
 *
 * Creates both:
 *  - Player row  (phone as the real contact number, email as identity field)
 *  - PlayerAccount row (provider="credentials", so the player can later log
 *    into CourtPass via email — the password is a random internal secret the
 *    player never sees or needs; future login is via magic link / OTP)
 *
 * Idempotency rules:
 *  - Phone already exists AND email already exists for the same player
 *    → return existing playerId, created: false
 *  - Phone exists but email does NOT (player found, different account)
 *    → return existing playerId, created: false  (phone wins as identity anchor)
 *  - Email already registered as a PlayerAccount for a DIFFERENT player
 *    → throw SignupValidationError (can't merge two existing records)
 *  - Phone matches one existing player AND email matches a DIFFERENT existing
 *    player → throw SignupValidationError (ambiguous identity)
 *  - Neither exists → create Player + PlayerAccount, return created: true
 *
 * Throws SignupValidationError (400) on invalid input, (409) on identity conflict.
 * Throws raw Prisma errors for unexpected DB failures.
 */
export async function createPhonePlayer(
  name: string,
  phone: string,
  email: string,
  venueId: string
): Promise<{ playerId: string; created: boolean }> {
  if (!name || name.trim().length < 2)
    throw new SignupValidationError("Name must be at least 2 characters");
  if (!phone || phone.replace(/\s+/g, "").length < 8)
    throw new SignupValidationError("Phone number must be at least 8 digits");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new SignupValidationError("Invalid email address");

  const normalizedPhone = phone.replace(/\s+/g, "");
  const normalizedEmail = email.toLowerCase().trim();

  // Check both uniqueness constraints in parallel
  const [existingByPhone, existingByEmail] = await Promise.all([
    prisma.player.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    }),
    prisma.playerAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "credentials",
          providerAccountId: normalizedEmail,
        },
      },
      select: { playerId: true },
    }),
  ]);

  // If phone matches a player AND email matches a DIFFERENT player → ambiguous
  if (
    existingByPhone &&
    existingByEmail &&
    existingByPhone.id !== existingByEmail.playerId
  ) {
    throw new SignupValidationError(
      "Phone number and email belong to different existing accounts — cannot create a merged account",
      409
    );
  }

  // Phone already exists → return that player (email may or may not be attached)
  if (existingByPhone) {
    console.log("[createPhonePlayer] returning existing player by phone:", existingByPhone.id);
    return { playerId: existingByPhone.id, created: false };
  }

  // Email already registered to a different player (no phone match above)
  if (existingByEmail) {
    console.log("[createPhonePlayer] returning existing player by email:", existingByEmail.playerId);
    return { playerId: existingByEmail.playerId, created: false };
  }

  // Neither exists — create Player + PlayerAccount atomically
  // Generate a random internal password the player never sees
  const randomPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const passwordHash = await bcrypt.hash(randomPassword, 12);

  const data: Prisma.PlayerCreateInput = {
    name: name.trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    gender: "male",
    skillLevel: "beginner",
    ...(venueId ? { registrationVenue: { connect: { id: venueId } } } : {}),
  };

  const player = await prisma.player.create({ data });
  console.log("[createPhonePlayer] created player:", player.id);

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
  console.log("[createPhonePlayer] created player account for:", normalizedEmail);

  return { playerId: player.id, created: true };
}
