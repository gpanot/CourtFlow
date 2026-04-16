import { NextResponse } from "next/server";
import { identifyPlayer } from "@/modules/courtpay/lib/check-in";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { venueCode, phone } = await req.json();

    if (!venueCode || !phone) {
      return NextResponse.json(
        { error: "venueCode and phone are required" },
        { status: 400 }
      );
    }

    const venue = await prisma.venue.findFirst({
      where: { id: venueCode, active: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const result = await identifyPlayer(venue.id, phone.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[courtpay/identify]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
