import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const appleAccounts = await prisma.playerAccount.findMany({
    where: { provider: "apple" },
    include: { player: { select: { id: true, name: true, email: true, phone: true, registrationVenueId: true } } },
  });
  return NextResponse.json({ appleAccounts });
}

export async function DELETE(req: NextRequest) {
  const { playerId } = await req.json();
  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });
  await prisma.playerAccount.deleteMany({ where: { playerId } });
  await prisma.player.delete({ where: { id: playerId } });
  return NextResponse.json({ deleted: playerId });
}
