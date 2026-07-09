import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireAdminAccess, requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/admin/company-accounts?venueId=xxx */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required", 400);

    const accounts = await prisma.companyAccount.findMany({
      where: { venueId },
      include: {
        primaryPlayer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        players: {
          include: {
            player: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        bills: {
          where: { status: { not: "void" } },
          orderBy: { periodStart: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            periodStart: true,
            periodEnd: true,
            totalAmount: true,
            invoiceNumber: true,
            issuedAt: true,
            paidAt: true,
            dueDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(accounts);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

/** POST /api/admin/company-accounts — create a company account */
export async function POST(request: NextRequest) {
  try {
    const payload = await requireManagerOrSuperAdmin(request.headers);
    const body = await request.json();
    const {
      venueId,
      name,
      billingEmail,
      taxId,
      billingAddress,
      vatPercent = 10,
      priceVatMode = "excluded",
      fixedDiscountPercent = 0,
      paymentTermsDays,
      openBillCreditLimit,
      creditLimitMode = "warn_only",
      primaryPlayerId,
      contactPhone,
      isSolo = false,
    } = body as {
      venueId: string;
      name: string;
      billingEmail?: string;
      taxId?: string;
      billingAddress?: string;
      vatPercent?: number;
      priceVatMode?: "excluded" | "included";
      fixedDiscountPercent?: number;
      paymentTermsDays?: number;
      openBillCreditLimit?: number;
      creditLimitMode?: "warn_only" | "block";
      primaryPlayerId?: string;
      contactPhone?: string;
      isSolo?: boolean;
    };

    if (!venueId || !name) return error("venueId and name are required", 400);

    const account = await prisma.companyAccount.create({
      data: {
        id: generateId("ca"),
        venueId,
        name,
        billingEmail,
        taxId,
        billingAddress,
        vatPercent,
        priceVatMode,
        fixedDiscountPercent,
        paymentTermsDays,
        openBillCreditLimit,
        creditLimitMode,
        primaryPlayerId,
        contactPhone,
        isSolo,
        updatedAt: new Date(),
      },
    });

    // If a primaryPlayerId is given, auto-link them as a member
    if (primaryPlayerId) {
      await prisma.companyAccountPlayer.create({
        data: {
          id: generateId("cap"),
          companyAccountId: account.id,
          playerId: primaryPlayerId,
          addedBy: payload.id,
        },
      });
    }

    return json(account, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

function generateId(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = prefix + "_";
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
