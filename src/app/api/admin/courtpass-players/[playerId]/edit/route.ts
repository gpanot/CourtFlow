import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { playerId } = await params;

    const body = await request.json() as {
      name?: string;
      phone?: string;
      email?: string;
      newPassword?: string;
    };

    const { name, phone, email, newPassword } = body;

    // Validate
    if (name !== undefined && (!name || name.trim().length < 2)) {
      return error("Name must be at least 2 characters", 400);
    }
    if (phone !== undefined && (!phone || phone.trim().length < 6)) {
      return error("Invalid phone number", 400);
    }
    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return error("Invalid email address", 400);
    }
    if (newPassword !== undefined && newPassword && newPassword.length < 8) {
      return error("Password must be at least 8 characters", 400);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return error("Player not found", 404);

    // Check phone uniqueness (exclude current player)
    if (phone && phone.trim() !== player.phone) {
      const normalizedPhone = phone.replace(/\s+/g, "");
      const phoneConflict = await prisma.player.findFirst({
        where: { phone: normalizedPhone, NOT: { id: playerId } },
        select: { id: true },
      });
      if (phoneConflict) return error("Phone number already in use by another player", 409);
    }

    // Check email uniqueness across PlayerAccount (exclude current player's account)
    if (email && email.trim()) {
      const normalizedEmail = email.toLowerCase().trim();
      const emailConflict = await prisma.playerAccount.findFirst({
        where: {
          provider: "credentials",
          providerAccountId: normalizedEmail,
          NOT: { playerId },
        },
        select: { id: true },
      });
      if (emailConflict) return error("Email already in use by another account", 409);
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.replace(/\s+/g, "");
    if (email !== undefined) updateData.email = email ? email.toLowerCase().trim() : null;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: updateData,
      select: { id: true, name: true, phone: true, email: true },
    });

    // Update the PlayerAccount email/providerAccountId if a credentials account exists
    if (email !== undefined && email) {
      const normalizedEmail = email.toLowerCase().trim();
      const account = await prisma.playerAccount.findFirst({
        where: { playerId, provider: "credentials" },
        select: { id: true },
      });
      if (account) {
        await prisma.playerAccount.update({
          where: { id: account.id },
          data: { email: normalizedEmail, providerAccountId: normalizedEmail },
        });
      }
    }

    // Reset password if requested
    if (newPassword) {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const account = await prisma.playerAccount.findFirst({
        where: { playerId, provider: "credentials" },
        select: { id: true },
      });
      if (account) {
        await prisma.playerAccount.update({
          where: { id: account.id },
          data: { passwordHash },
        });
      }
    }

    return json({ player: updated });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required" || msg === "Manager or super admin access required") {
      return error(msg, 401);
    }
    return error(msg, 500);
  }
}
