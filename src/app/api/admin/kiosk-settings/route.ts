import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const settings = await prisma.kioskSettings.findUnique({
      where: { id: "global" },
    });

    return json({
      stickerPrice: settings?.stickerPrice ?? 30000,
      bankBin: settings?.bankBin ?? "",
      bankAccount: settings?.bankAccount ?? "",
      bankOwnerName: settings?.bankOwnerName ?? "",
      chromaTolerance: settings?.chromaTolerance ?? 65,
      featherRadius: settings?.featherRadius ?? 0.8,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const body = await parseBody<{
      stickerPrice?: number;
      bankBin?: string;
      bankAccount?: string;
      bankOwnerName?: string;
      chromaTolerance?: number;
      featherRadius?: number;
    }>(request);

    const settings = await prisma.kioskSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        stickerPrice: body.stickerPrice ?? 30000,
        bankBin: body.bankBin ?? "",
        bankAccount: body.bankAccount ?? "",
        bankOwnerName: body.bankOwnerName ?? "",
        chromaTolerance: body.chromaTolerance ?? 65,
        featherRadius: body.featherRadius ?? 0.8,
      },
      update: {
        ...(body.stickerPrice !== undefined && { stickerPrice: body.stickerPrice }),
        ...(body.bankBin !== undefined && { bankBin: body.bankBin }),
        ...(body.bankAccount !== undefined && { bankAccount: body.bankAccount }),
        ...(body.bankOwnerName !== undefined && { bankOwnerName: body.bankOwnerName }),
        ...(body.chromaTolerance !== undefined && { chromaTolerance: body.chromaTolerance }),
        ...(body.featherRadius !== undefined && { featherRadius: body.featherRadius }),
      },
    });

    return json({
      stickerPrice: settings.stickerPrice,
      bankBin: settings.bankBin,
      bankAccount: settings.bankAccount,
      bankOwnerName: settings.bankOwnerName,
      chromaTolerance: settings.chromaTolerance,
      featherRadius: settings.featherRadius,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
