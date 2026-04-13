/**
 * Check in existing bot players (+1900xxxx phones) for the open session at MM Pickleball
 * (or COURTFLOW_VENUE_ID). Sets gender mix; creates/updates QueueEntry as on_break only
 * (checked in — not in the waiting queue).
 *
 * Usage: npx tsx scripts/check-in-bots.ts [count] [menPercent]
 * Example: npx tsx scripts/check-in-bots.ts 40 60
 */

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env" });

const prisma = new PrismaClient();

function genderForMix(index: number, count: number, menPercent: number): "male" | "female" {
  const menCount = Math.round((count * menPercent) / 100);
  return index < menCount ? "male" : "female";
}

async function getNextQueueNumber(sessionId: string): Promise<number> {
  const last = await prisma.queueEntry.findFirst({
    where: { sessionId, queueNumber: { not: null } },
    orderBy: { queueNumber: "desc" },
  });
  return (last?.queueNumber ?? 0) + 1;
}

async function main() {
  const count = parseInt(process.argv[2] || "40", 10);
  const menPercent = parseFloat(process.argv[3] || process.env.COURTFLOW_BOT_MEN_PERCENT || "60");

  const venueIdEnv = process.env.COURTFLOW_VENUE_ID?.trim();
  let venue = venueIdEnv
    ? await prisma.venue.findUnique({ where: { id: venueIdEnv } })
    : null;
  if (!venue) {
    venue = await prisma.venue.findFirst({
      where: {
        OR: [
          { name: { equals: "MM", mode: "insensitive" } },
          { name: { contains: "MM Pickleball", mode: "insensitive" } },
        ],
      },
    });
  }

  if (!venue) {
    console.error("Venue not found. Set COURTFLOW_VENUE_ID or create MM Pickleball Club.");
    process.exit(1);
  }

  const session = await prisma.session.findFirst({
    where: { venueId: venue.id, status: "open" },
  });

  if (!session) {
    console.error("No open session for this venue.");
    process.exit(1);
  }

  const men = Math.round((count * menPercent) / 100);
  console.log(`Venue: ${venue.name} (${venue.id})`);
  console.log(`Session: ${session.id}`);
  console.log(`Check-in ${count} bots: ~${menPercent}% men → ${men} male, ${count - men} female\n`);

  let ok = 0;
  let missing = 0;
  let court = 0;

  for (let i = 0; i < count; i++) {
    const phone = `+1900${String(i).padStart(4, "0")}`;
    const player = await prisma.player.findUnique({ where: { phone } });

    if (!player) {
      console.log(`  ✗ ${phone} — no player in DB (run seed-bots or register first)`);
      missing++;
      continue;
    }

    const gender = genderForMix(i, count, menPercent);
    if (player.gender !== gender) {
      await prisma.player.update({
        where: { id: player.id },
        data: { gender },
      });
    }

    const existing = await prisma.queueEntry.findUnique({
      where: {
        sessionId_playerId: { sessionId: session.id, playerId: player.id },
      },
    });

    if (existing) {
      if (existing.status === "assigned" || existing.status === "playing") {
        console.log(`  ⊘ ${player.name} — on court (${existing.status}), skip`);
        court++;
        continue;
      }
      const queueNumber =
        existing.queueNumber != null && existing.queueNumber > 0
          ? existing.queueNumber
          : await getNextQueueNumber(session.id);
      await prisma.queueEntry.update({
        where: { id: existing.id },
        data: {
          status: "on_break",
          queueNumber,
          groupId: null,
          breakUntil: null,
        },
      });
      console.log(`  ✓ ${player.name} — checked in (was ${existing.status})`);
    } else {
      const queueNumber = await getNextQueueNumber(session.id);
      await prisma.queueEntry.create({
        data: {
          sessionId: session.id,
          playerId: player.id,
          status: "on_break",
          queueNumber,
        },
      });
      console.log(`  ✓ ${player.name} — checked in (new)`);
    }
    ok++;
  }

  console.log(`\nDone: ${ok} checked in, ${missing} missing player, ${court} skipped (on court).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
