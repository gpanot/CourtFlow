/**
 * Optional one-time warm-up: generate WebP thumbnails for all Player rows
 * that have a facePhotoPath but no thumb yet.
 *
 * Run: npm run backfill:face-thumbs
 */

import { PrismaClient } from "@prisma/client";
import { ensureFaceThumb, playerIdFromFacePhotoPath } from "../src/lib/player-face-thumb";

const prisma = new PrismaClient();

async function main() {
  const players = await prisma.player.findMany({
    where: { facePhotoPath: { not: null } },
    select: { id: true, facePhotoPath: true },
  });

  console.log(`Found ${players.length} players with facePhotoPath.`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of players) {
    // Resolve the player ID to use for the thumb filename.
    // Normally it's just p.id, but we double-check via path parsing in case
    // older records stored a different id in the filename.
    const idFromPath = p.facePhotoPath ? playerIdFromFacePhotoPath(p.facePhotoPath) : null;
    const thumbId = idFromPath ?? p.id;

    const success = await ensureFaceThumb(thumbId);
    if (success) {
      ok++;
    } else {
      // Source image not available locally or via production fetch
      skipped++;
    }

    if ((ok + skipped + failed) % 10 === 0) {
      console.log(`  progress: ${ok} ok / ${skipped} skipped / ${failed} failed`);
    }
  }

  console.log(`\nDone. ${ok} thumbnails generated, ${skipped} skipped (source unavailable), ${failed} errors.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
