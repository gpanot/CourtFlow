/**
 * Read-only audit: compare DB `faceSubjectId` values to faces in the Rekognition collection.
 *
 * Run from repo root (loads `.env`):
 *   npx tsx scripts/audit-mock-enrollments.ts
 *   npx ts-node scripts/audit-mock-enrollments.ts
 *
 * Also writes: scripts/audit-mock-enrollments-output.json
 *
 * Does not delete or update any data.
 */

import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { ListFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";

loadEnv({ path: ".env" });

const COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-1";

function hasValidAwsCredentials(): boolean {
  const k = process.env.AWS_ACCESS_KEY_ID;
  return !!(
    k &&
    k !== "your-key-here" &&
    k.trim() !== "" &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

interface Row {
  playerName: string;
  phone: string;
  faceSubjectId: string;
  note: string;
}

async function listAllFaceIdsInCollection(
  client: RekognitionClient,
  collectionId: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new ListFacesCommand({
        CollectionId: collectionId,
        MaxResults: 4096,
        NextToken: nextToken,
      })
    );
    for (const face of res.Faces ?? []) {
      if (face.FaceId) ids.add(face.FaceId);
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return ids;
}

function printList(title: string, rows: Row[]): void {
  console.log(`\n${title} (${rows.length})`);
  console.log("-".repeat(72));
  for (const r of rows) {
    console.log(
      `  name=${r.playerName}  phone=${r.phone}  faceSubjectId=${r.faceSubjectId}  ${r.note}`
    );
  }
}

async function main(): Promise<void> {
  if (!hasValidAwsCredentials()) {
    console.error(
      "Audit aborted: set valid AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (and optional AWS_REGION / AWS_REKOGNITION_COLLECTION) in .env to query Rekognition."
    );
    process.exit(1);
  }

  const client = new RekognitionClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const prisma = new PrismaClient();

  try {
    console.log(
      `Listing faces in collection "${COLLECTION_ID}" (region ${AWS_REGION})...`
    );
    const faceIdsInAws = await listAllFaceIdsInCollection(client, COLLECTION_ID);
    console.log(`Rekognition reported ${faceIdsInAws.size} face(s) in the collection.\n`);

    const players = await prisma.player.findMany({
      where: { faceSubjectId: { not: null } },
      select: { name: true, phone: true, faceSubjectId: true },
    });

    const valid: Row[] = [];
    const stale: Row[] = [];

    for (const p of players) {
      const fid = p.faceSubjectId!; // not null from query
      if (faceIdsInAws.has(fid)) {
        valid.push({
          playerName: p.name,
          phone: p.phone,
          faceSubjectId: fid,
          note: "confirmed in AWS",
        });
      } else {
        stale.push({
          playerName: p.name,
          phone: p.phone,
          faceSubjectId: fid,
          note: "not found in AWS collection",
        });
      }
    }

    printList("Valid (faceSubjectId exists in Rekognition collection)", valid);
    printList("Stale / mock (faceSubjectId not in collection)", stale);

    const outPath = join(
      process.cwd(),
      "scripts",
      "audit-mock-enrollments-output.json"
    );
    const payload = {
      collectionId: COLLECTION_ID,
      awsRegion: AWS_REGION,
      listedFaceCount: faceIdsInAws.size,
      playerRowsWithNonNullFaceSubject: players.length,
      generatedAt: new Date().toISOString(),
      valid: valid.map((r) => ({
        playerName: r.playerName,
        phone: r.phone,
        faceSubjectId: r.faceSubjectId,
        confirmedInAws: true,
      })),
      staleOrNotInCollection: stale.map((r) => ({
        playerName: r.playerName,
        phone: r.phone,
        faceSubjectId: r.faceSubjectId,
        notFoundInAws: true,
      })),
    };

    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`\nWrote ${outPath}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
