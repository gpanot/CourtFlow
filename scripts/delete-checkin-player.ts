/**
 * Delete a CourtPay check-in player by phone (and related rows).
 * Usage: npx tsx scripts/delete-checkin-player.ts <phone>
 */
import { PrismaClient } from "@prisma/client";

const phone = process.argv[2]?.trim();
if (!phone) {
  console.error("Usage: npx tsx scripts/delete-checkin-player.ts <phone>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const player = await prisma.checkInPlayer.findFirst({
    where: { phone },
    select: { id: true, name: true, venueId: true },
  });

  if (!player) {
    console.log(`No check-in player found with phone: ${phone}`);
    return;
  }

  console.log(`Deleting ${player.name} (${player.id})…`);

  const subs = await prisma.playerSubscription.findMany({
    where: { playerId: player.id },
    select: { id: true },
  });
  const subIds = subs.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    await tx.pendingPayment.deleteMany({ where: { checkInPlayerId: player.id } });
    await tx.checkInRecord.deleteMany({ where: { playerId: player.id } });
    if (subIds.length > 0) {
      await tx.subscriptionUsage.deleteMany({ where: { subscriptionId: { in: subIds } } });
    }
    await tx.playerSubscription.deleteMany({ where: { playerId: player.id } });
    await tx.checkInPlayer.delete({ where: { id: player.id } });
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
