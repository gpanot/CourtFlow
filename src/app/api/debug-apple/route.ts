import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const appleAccounts = await prisma.playerAccount.findMany({
    where: { provider: "apple" },
    include: { player: { select: { id: true, name: true, email: true, phone: true, registrationVenueId: true } } },
  });

  const hotmailPlayers = await prisma.player.findMany({
    where: { email: "panotg@hotmail.com" },
    select: { id: true, name: true, email: true, phone: true, registrationVenueId: true },
  });

  const oauthApple = await prisma.player.findMany({
    where: { phone: { startsWith: "oauth_apple" } },
    select: { id: true, name: true, email: true, phone: true },
  });

  return NextResponse.json({ appleAccounts, hotmailPlayers, oauthApple });
}
