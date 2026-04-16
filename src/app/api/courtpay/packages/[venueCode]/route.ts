import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ venueCode: string }> }
) {
  try {
    const { venueCode } = await params;

    const venue = await prisma.venue.findFirst({
      where: { id: venueCode, active: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const packages = await prisma.subscriptionPackage.findMany({
      where: { venueId: venue.id, isActive: true },
      orderBy: { price: "asc" },
    });

    return NextResponse.json({ packages, venueName: venue.name });
  } catch (err) {
    console.error("[courtpay/packages]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
