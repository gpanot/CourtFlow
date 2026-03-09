import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Find all bot player IDs
  const bots = await prisma.player.findMany({
    where: { phone: { startsWith: "+1900" } },
    select: { id: true },
  });
  const botIds = new Set(bots.map((b) => b.id));
  console.log(`Found ${botIds.size} bot players`);

  // 2. End only assignments where ALL players are bots
  const activeAssignments = await prisma.courtAssignment.findMany({
    where: { endedAt: null },
  });

  let endedCount = 0;
  for (const a of activeAssignments) {
    const allBots = a.playerIds.every((id) => botIds.has(id));
    if (allBots) {
      await prisma.courtAssignment.update({
        where: { id: a.id },
        data: { endedAt: new Date() },
      });
      await prisma.court.update({
        where: { id: a.courtId },
        data: { status: "idle" },
      });
      endedCount++;
    }
  }
  console.log(`Ended ${endedCount} bot-only assignments (kept ${activeAssignments.length - endedCount} with real players)`);

  // 3. Delete bot queue entries then bot players
  const qd = await prisma.queueEntry.deleteMany({
    where: { player: { phone: { startsWith: "+1900" } } },
  });
  console.log(`Deleted ${qd.count} bot queue entries`);

  const pd = await prisma.player.deleteMany({
    where: { phone: { startsWith: "+1900" } },
  });
  console.log(`Deleted ${pd.count} bot players`);

  await prisma.$disconnect();
}

main().catch(console.error);
