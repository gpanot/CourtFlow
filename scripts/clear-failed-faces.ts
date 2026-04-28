import { config as loadEnv } from "dotenv";
import { readFile } from "fs/promises";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env" });

type EnrollmentStatus = "enrolled" | "failed" | "skipped";

interface EnrollmentEntry {
  playerId: string;
  name: string;
  status: EnrollmentStatus;
}

interface EnrollmentOutput {
  results: EnrollmentEntry[];
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const jsonPath = join(process.cwd(), "scripts", "enrollment-output.json");

  try {
    const raw = await readFile(jsonPath, "utf-8");
    const output = JSON.parse(raw) as EnrollmentOutput;
    const failed = (output.results ?? []).filter((p) => p.status === "failed");

    if (failed.length === 0) {
      console.log("No failed enrollment entries found.");
      return;
    }

    console.log(
      `[${new Date().toISOString()}] Found ${failed.length} failed enrollment player(s).`
    );
    console.log(
      DRY_RUN
        ? "Dry run enabled: no database updates will be made."
        : "Applying updates: clearing faceSubjectId for failed players."
    );

    let updated = 0;
    for (const player of failed) {
      if (DRY_RUN) {
        console.log(`[DRY] Would clear faceSubjectId for ${player.name} (${player.playerId})`);
        continue;
      }

      await prisma.player.update({
        where: { id: player.playerId },
        data: { faceSubjectId: null },
      });
      updated++;
      console.log(`Cleared faceSubjectId for ${player.name}`);
    }

    console.log(
      DRY_RUN
        ? `[${new Date().toISOString()}] Dry run complete.`
        : `[${new Date().toISOString()}] Done. Cleared ${updated} player(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
