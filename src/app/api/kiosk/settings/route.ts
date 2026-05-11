import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

export async function GET(request: NextRequest) {
  try {
    if (!validateKioskSecret(request)) {
      return error("Unauthorized", 401);
    }

    const settings = await prisma.kioskSettings.findUnique({
      where: { id: "global" },
    });

    return json({
      stickerPrice: settings?.stickerPrice ?? 30000,
      bankBin: settings?.bankBin ?? "",
      bankAccount: settings?.bankAccount ?? "",
      bankOwnerName: settings?.bankOwnerName ?? "",
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
