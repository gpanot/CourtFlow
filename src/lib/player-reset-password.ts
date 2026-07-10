/**
 * Password reset flow for CourtPass player accounts.
 *
 * Flow:
 *   1. Player submits email → createPasswordResetToken(email)
 *      - Looks up PlayerAccount by provider=credentials
 *      - Creates a PlayerPasswordResetToken DB row with a signed JWT jti
 *      - Sends the reset link via Resend
 *   2. Player clicks link → /book/reset-password/confirm?token=<jwt>
 *   3. Player submits new password → consumePasswordResetToken(token) + update passwordHash
 *
 * Security:
 *   - Token is a JWT (type=password_reset) with a random jti; the jti is stored in DB
 *   - DB row tracks usedAt for single-use enforcement
 *   - TTL: 15 minutes
 *   - Always returns 200 on request (no email enumeration)
 *   - Rate-limit: max 1 token per player per 2 minutes (checked in DB)
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getResendClient } from "./email/client";

const PLAYER_JWT_SECRET =
  process.env.PLAYER_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "courtflow-dev-secret-change-in-production";

const RESET_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const ACTIVATION_TOKEN_TTL_SECONDS = 72 * 60 * 60; // 72 hours
const RATE_LIMIT_SECONDS = 2 * 60; // 2 minutes between requests

const FROM = "noreply_bookings@thecourtflow.com";

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_COURTPASS_URL ?? "https://courtpass.thecourtflow.com"
  ).replace(/\/$/, "");
}

export const TOKEN_TYPE_RESET = "password_reset" as const;

interface ResetTokenPayload {
  playerId: string;
  type: typeof TOKEN_TYPE_RESET;
  jti: string;
}

export class PasswordResetError extends Error {
  constructor(
    message: string,
    public readonly code: "expired" | "already_used" | "invalid"
  ) {
    super(message);
    this.name = "PasswordResetError";
  }
}

function buildResetEmailHtml(resetUrl: string, playerName: string): string {
  const name = playerName || "there";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <p style="margin:0 0 16px 0;font-size:15px;color:#111827;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#374151;">
      We received a request to reset the password for your CourtPass account. Click the button below to set a new password. This link expires in <strong>15 minutes</strong>.
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#22c55e;color:#000000;font-weight:600;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:10px;">
      Reset Password
    </a>
    <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
      If you didn't request this, you can ignore this email — your password won't change.
    </p>
    <p style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;color:#6b7280;">
      Powered by <a href="https://www.thecourtflow.com/" target="_blank" style="color:#7c3aed;text-decoration:none;font-weight:600;">CourtPass</a>
    </p>
  </div>
</body>
</html>`.trim();
}

function buildActivationEmailHtml(activationUrl: string, playerName: string): string {
  const name = playerName || "there";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <p style="margin:0 0 16px 0;font-size:15px;color:#111827;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#374151;">
      A booking account has been created for you on CourtPass. Click the button below to set your password and access your bookings online. This link expires in <strong>72 hours</strong>.
    </p>
    <a href="${activationUrl}" style="display:inline-block;background:#22c55e;color:#000000;font-weight:600;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:10px;">
      Set up my account
    </a>
    <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
      If you weren't expecting this, you can safely ignore this email.
    </p>
    <p style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;color:#6b7280;">
      Powered by <a href="https://www.thecourtflow.com/" target="_blank" style="color:#7c3aed;text-decoration:none;font-weight:600;">CourtPass</a>
    </p>
  </div>
</body>
</html>`.trim();
}

/**
 * Wraps a payment URL in an account-setup link for a new, unverified player.
 *
 * Instead of: booking email → Pay now → payment page (fails — not logged in)
 * This creates:  booking email → Pay now → /book/auth/setup-password → set password
 *                → auto sign-in → payment page
 *
 * Uses the same PlayerPasswordResetToken infrastructure as the regular reset flow,
 * but routes through the setup-password page with a 72-hour TTL.
 *
 * @param playerId   Prisma Player.id
 * @param paymentUrl Absolute payment URL (e.g. https://…/book/pay/:id)
 * @returns          The setup-password URL (or bare paymentUrl on error)
 */
export async function wrapPaymentUrlForNewPlayer(
  playerId: string,
  paymentUrl: string
): Promise<string> {
  try {
    const url = new URL(paymentUrl);
    const redirectTo = url.pathname + url.search;

    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_SECONDS * 1000);
    const payload: ResetTokenPayload = {
      playerId,
      type: TOKEN_TYPE_RESET,
      jti,
    };
    const token = jwt.sign(payload, PLAYER_JWT_SECRET, {
      expiresIn: ACTIVATION_TOKEN_TTL_SECONDS,
    });

    await prisma.playerPasswordResetToken.create({
      data: { id: randomUUID(), playerId, jti, expiresAt },
    });

    const baseUrl = getBaseUrl();
    return `${baseUrl}/book/auth/setup-password?token=${encodeURIComponent(token)}&next=${encodeURIComponent(redirectTo)}`;
  } catch (err) {
    console.warn("[wrapPaymentUrlForNewPlayer] Failed to create setup token — using bare URL:", err);
    return paymentUrl;
  }
}

/**
 * Send an account activation email to a player whose account was just created
 * by a staff member. Uses the same player_password_reset_tokens table as the
 * regular reset flow, but with a 72-hour TTL and welcome-flavored copy.
 */
export async function sendAccountActivationEmail(
  playerId: string,
  email: string,
  playerName: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_SECONDS * 1000);

  const payload: ResetTokenPayload = {
    playerId,
    type: TOKEN_TYPE_RESET,
    jti,
  };

  const token = jwt.sign(payload, PLAYER_JWT_SECRET, {
    expiresIn: ACTIVATION_TOKEN_TTL_SECONDS,
  });

  await prisma.playerPasswordResetToken.create({
    data: { id: randomUUID(), playerId, jti, expiresAt },
  });

  const activationUrl = `${getBaseUrl()}/book/reset-password/confirm?token=${token}`;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM,
      to: normalizedEmail,
      subject: "Set up your CourtPass account",
      html: buildActivationEmailHtml(activationUrl, playerName),
    });
    if (result.error) {
      console.error("[sendAccountActivationEmail] Resend error:", result.error);
    } else {
      console.log(`[sendAccountActivationEmail] Sent activation link to ${normalizedEmail} id=${result.data?.id}`);
    }
  } catch (err) {
    console.error("[sendAccountActivationEmail] Failed to send email:", err);
  }
}

/**
 * Request a password reset for the given email address.
 * Silently no-ops if the email is not associated with a credentials account
 * (to prevent email enumeration).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const account = await prisma.playerAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "credentials",
        providerAccountId: normalizedEmail,
      },
    },
    include: {
      player: { select: { id: true, name: true } },
    },
  });

  if (!account) {
    // Don't reveal whether the account exists
    return;
  }

  const { player } = account;

  // Rate-limit: skip if a token was already created for this player within the last 2 minutes
  const recentToken = await prisma.playerPasswordResetToken.findFirst({
    where: {
      playerId: player.id,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_SECONDS * 1000) },
    },
  });

  if (recentToken) {
    return;
  }

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000);

  const payload: ResetTokenPayload = {
    playerId: player.id,
    type: TOKEN_TYPE_RESET,
    jti,
  };

  const token = jwt.sign(payload, PLAYER_JWT_SECRET, {
    expiresIn: RESET_TOKEN_TTL_SECONDS,
  });

  await prisma.playerPasswordResetToken.create({
    data: { id: randomUUID(), playerId: player.id, jti, expiresAt },
  });

  const resetUrl = `${getBaseUrl()}/book/reset-password/confirm?token=${token}`;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM,
      to: normalizedEmail,
      subject: "Reset your CourtPass password",
      html: buildResetEmailHtml(resetUrl, player.name ?? ""),
    });
    if (result.error) {
      console.error("[requestPasswordReset] Resend error:", result.error);
    } else {
      console.log(`[requestPasswordReset] Sent reset link to ${normalizedEmail} id=${result.data?.id}`);
    }
  } catch (err) {
    console.error("[requestPasswordReset] Failed to send email:", err);
  }
}

/**
 * Consume a password reset token.
 * Returns the playerId and matching PlayerAccount on success.
 * Throws PasswordResetError on all failure paths.
 */
export async function consumePasswordResetToken(
  rawToken: string
): Promise<{ playerId: string }> {
  let payload: ResetTokenPayload;

  try {
    payload = jwt.verify(rawToken, PLAYER_JWT_SECRET) as ResetTokenPayload;
  } catch (e) {
    const isExpired = (e as Error).name === "TokenExpiredError";
    throw new PasswordResetError(
      isExpired ? "This reset link has expired." : "Invalid reset link.",
      isExpired ? "expired" : "invalid"
    );
  }

  if (payload.type !== TOKEN_TYPE_RESET) {
    throw new PasswordResetError("Invalid reset link.", "invalid");
  }

  const row = await prisma.playerPasswordResetToken.findUnique({
    where: { jti: payload.jti },
    select: { id: true, usedAt: true },
  });

  if (!row) {
    throw new PasswordResetError("Invalid reset link.", "invalid");
  }

  if (row.usedAt !== null) {
    throw new PasswordResetError(
      "This reset link has already been used.",
      "already_used"
    );
  }

  await prisma.playerPasswordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return { playerId: payload.playerId };
}
