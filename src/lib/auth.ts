import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "courtflow-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "30d";

export interface JwtPayload {
  id: string;
  role: "player" | "staff" | "superadmin";
  venueId?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateOtp(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

export async function sendOtp(phone: string): Promise<{ success: boolean; code?: string }> {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.otpCode.create({
    data: { phone, code, expiresAt },
  });

  // Mock: log to console instead of sending SMS
  console.log(`\n========================================`);
  console.log(`  OTP for ${phone}: ${code}`);
  console.log(`  Expires at: ${expiresAt.toISOString()}`);
  console.log(`========================================\n`);

  return { success: true, code: process.env.NODE_ENV === "development" ? code : undefined };
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { valid: false, error: "No valid OTP found. Please request a new code." };
  }

  if (otpRecord.attempts >= 3) {
    return { valid: false, error: "Too many attempts. Please request a new code." };
  }

  if (otpRecord.code !== code) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    return { valid: false, error: "Invalid code. Please try again." };
  }

  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { verified: true },
  });

  return { valid: true };
}

export function extractToken(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function requireAuth(headers: Headers): JwtPayload {
  const token = extractToken(headers);
  if (!token) throw new Error("Missing authorization token");
  const payload = verifyToken(token);
  if (!payload) throw new Error("Invalid or expired token");
  return payload;
}

export function requireStaff(headers: Headers): JwtPayload {
  const payload = requireAuth(headers);
  if (payload.role !== "staff" && payload.role !== "superadmin") {
    throw new Error("Staff access required");
  }
  return payload;
}

export function requireSuperAdmin(headers: Headers): JwtPayload {
  const payload = requireAuth(headers);
  if (payload.role !== "superadmin") {
    throw new Error("Super admin access required");
  }
  return payload;
}
