import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);

    let config = await prisma.billingConfig.findUnique({
      where: { id: "default" },
    });

    if (!config) {
      config = await prisma.billingConfig.create({
        data: { id: "default" },
      });
    }

    return NextResponse.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    requireSuperAdmin(req.headers);

    const body = await req.json();
    const {
      bankBin,
      bankAccount,
      bankOwner,
      defaultBaseRate,
      defaultSubAddon,
      defaultSepayAddon,
    } = body;

    const config = await prisma.billingConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        bankBin: bankBin ?? "",
        bankAccount: bankAccount ?? "",
        bankOwner: bankOwner ?? "",
        defaultBaseRate: defaultBaseRate ?? 5000,
        defaultSubAddon: defaultSubAddon ?? 1000,
        defaultSepayAddon: defaultSepayAddon ?? 1000,
      },
      update: {
        ...(bankBin !== undefined && { bankBin }),
        ...(bankAccount !== undefined && { bankAccount }),
        ...(bankOwner !== undefined && { bankOwner }),
        ...(defaultBaseRate !== undefined && { defaultBaseRate }),
        ...(defaultSubAddon !== undefined && { defaultSubAddon }),
        ...(defaultSepayAddon !== undefined && { defaultSepayAddon }),
      },
    });

    return NextResponse.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
