/**
 * Bulk-enroll players who have a stored face photo but no valid AWS face
 * (or stale/mock faceSubjectId not in the Rekognition collection).
 *
 * Uses `faceRecognitionService.enrollFace` from `src/lib/face-recognition.ts`.
 *
 * Run from repo root (uses `tsx` so `@/lib/*` path aliases resolve; same as other scripts in this repo):
 *   npx tsx scripts/reenroll-mock-players.ts --dry-run
 *   npx tsx scripts/reenroll-mock-players.ts
 *
 * Plain `ts-node` will not resolve `@/` imports without extra config; use `tsx` or wire tsconfig-paths.
 *
 * Writes: scripts/enrollment-output.json
 */

import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { isAbsolute, join } from "path";
import { PrismaClient } from "@prisma/client";
import { ListFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { faceRecognitionService, USE_MOCK_SERVICE } from "@/lib/face-recognition";

loadEnv({ path: ".env" });

const COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-1";
const DRY_RUN = process.argv.includes("--dry-run");

type OutcomeStatus = "enrolled" | "failed" | "skipped";

interface PlayerRow {
  id: string;
  name: string;
  phone: string;
  faceSubjectId: string | null;
  facePhotoPath: string | null;
}

interface OutputEntry {
  playerId: string;
  name: string;
  phone: string;
  facePhotoPath: string | null;
  status: OutcomeStatus;
  newFaceSubjectId: string;
  reason: string;
}

function hasValidAwsCredentials(): boolean {
  const k = process.env.AWS_ACCESS_KEY_ID;
  return !!(
    k &&
    k !== "your-key-here" &&
    k.trim() !== "" &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  if (t.includes(",")) return t.split(",").pop() ?? t;
  return t;
}

function stripQuery(s: string): string {
  const i = s.indexOf("?");
  return i >= 0 ? s.slice(0, i) : s;
}

function isNonEmptyPhotoPath(p: string | null | undefined): boolean {
  return p != null && String(p).trim() !== "";
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

async function loadFacePhotoAsBase64(
  facePhotoPath: string | null
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  if (!isNonEmptyPhotoPath(facePhotoPath)) {
    return { ok: false, error: "No facePhotoPath" };
  }
  const raw0 = String(facePhotoPath).trim();
  if (raw0.toLowerCase().startsWith("data:image")) {
    return { ok: true, base64: stripDataUrl(raw0) };
  }
  if (raw0.startsWith("http://") || raw0.startsWith("https://")) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch(stripQuery(raw0), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} fetching image` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) return { ok: false, error: "Image too small" };
      return { ok: true, base64: buf.toString("base64") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fetch error" };
    }
  }
  const cleaned = stripQuery(raw0);
  const rel = cleaned.startsWith("/") ? cleaned.slice(1) : cleaned;
  const abs = isAbsolute(cleaned) ? cleaned : join(process.cwd(), rel);
  try {
    const buf = await readFile(abs);
    if (buf.length < 100) return { ok: false, error: "Image file too small" };
    return { ok: true, base64: buf.toString("base64") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "readFile error" };
  }
}

function isNoFaceError(err: string | undefined): boolean {
  if (!err) return false;
  const t = err.toLowerCase();
  return t.includes("no face detected") || t.includes("no face ");
}

function categorizeEnrollError(err: string | undefined): "no_face" | "aws" {
  if (isNoFaceError(err)) return "no_face";
  return "aws";
}

function logPlayer(line: string): void {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

async function main(): Promise<void> {
  if (!hasValidAwsCredentials() || USE_MOCK_SERVICE) {
    console.error(
      "This script requires real AWS credentials and USE_MOCK_SERVICE=false to list the Rekognition collection" +
        (DRY_RUN ? " (read-only in --dry-run)." : " and call IndexFaces.")
    );
    process.exit(1);
  }

  const awsClient = new RekognitionClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  logPlayer(`Loading FaceIds from collection "${COLLECTION_ID}" (read-only)...`);
  const faceIdsInAws = await listAllFaceIdsInCollection(awsClient, COLLECTION_ID);
  logPlayer(`Collection has ${faceIdsInAws.size} face(s).`);

  const prisma = new PrismaClient();

  const players = await prisma.player.findMany({
    where: {
      OR: [
        {
          AND: [{ faceSubjectId: null }, { NOT: { facePhotoPath: null } }],
        },
        { NOT: { faceSubjectId: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      faceSubjectId: true,
      facePhotoPath: true,
    },
  });

  let alreadyValid = 0;
  let noPhoto = 0;
  let success = 0;
  let failNoFace = 0;
  let failPhotoLoad = 0;
  let failAws = 0;
  let dryPhotoOk = 0;
  let dryPhotoBad = 0;

  const output: OutputEntry[] = [];
  const baseUrlNote = DRY_RUN
    ? " (dry-run: not calling IndexFaces, not updating database)"
    : "";

  for (const p of players) {
    const inAws =
      p.faceSubjectId != null &&
      p.faceSubjectId !== "" &&
      faceIdsInAws.has(p.faceSubjectId);

    if (inAws) {
      alreadyValid++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "skipped",
        newFaceSubjectId: "",
        reason: "faceSubjectId already present in AWS collection",
      };
      output.push(entry);
      logPlayer(
        `SKIP (valid) ${p.name} | ${p.phone} | face=${p.faceSubjectId?.slice(0, 12) ?? ""}...`
      );
      continue;
    }

    if (!isNonEmptyPhotoPath(p.facePhotoPath)) {
      noPhoto++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "skipped",
        newFaceSubjectId: "",
        reason: "no face photo path (required for enrollment)",
      };
      output.push(entry);
      logPlayer(
        `SKIP (no photo) ${p.name} | ${p.phone} | faceSubjectId=${p.faceSubjectId ?? "null"}`
      );
      continue;
    }

    const loaded = await loadFacePhotoAsBase64(p.facePhotoPath);
    if (!loaded.ok) {
      if (DRY_RUN) dryPhotoBad++;
      else failPhotoLoad++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "failed",
        newFaceSubjectId: "",
        reason: `Photo load: ${loaded.error}${baseUrlNote}`,
      };
      output.push(entry);
      logPlayer(`FAIL (photo) ${p.name} | ${loaded.error}`);
      continue;
    }
    if (DRY_RUN) {
      dryPhotoOk++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "skipped",
        newFaceSubjectId: "",
        reason: `dry-run: photo loaded OK, would call enrollFace (${loaded.base64.length} chars b64)${baseUrlNote}`,
      };
      output.push(entry);
      logPlayer(
        `DRY-RUN (photo OK, would enroll) ${p.name} | ${p.phone} | b64~${Math.round(loaded.base64.length / 1024)}kb`
      );
      continue;
    }

    const rawB64 = stripDataUrl(loaded.base64);
    const res = await faceRecognitionService.enrollFace(rawB64, p.id);
    if (res.success && res.subjectId) {
      success++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "enrolled",
        newFaceSubjectId: res.subjectId,
        reason: "IndexFaces + DB update OK",
      };
      output.push(entry);
      logPlayer(`ENROLLED ${p.name} | ${p.phone} | ${res.subjectId}`);
    } else {
      const cat = categorizeEnrollError(res.error);
      if (cat === "no_face") failNoFace++;
      else failAws++;
      const entry: OutputEntry = {
        playerId: p.id,
        name: p.name,
        phone: p.phone,
        facePhotoPath: p.facePhotoPath,
        status: "failed",
        newFaceSubjectId: "",
        reason: res.error ?? "Unknown enrollment error",
      };
      output.push(entry);
      logPlayer(`FAIL (enroll) ${p.name} | ${res.error ?? "unknown"}`);
    }
  }

  const attemptedEnrollment = players.length - alreadyValid - noPhoto;

  console.log("\n" + "=".repeat(72));
  console.log(DRY_RUN ? "SUMMARY (DRY RUN)" : "SUMMARY");
  console.log("=".repeat(72));
  console.log(`Total players scanned:         ${players.length}`);
  console.log(`Already valid in AWS:         ${alreadyValid}`);
  console.log(`No photo available:            ${noPhoto}`);
  console.log(`Attempted enrollment:         ${attemptedEnrollment}` + (DRY_RUN ? "  (enrollFace not called)" : ""));
  if (DRY_RUN) {
    console.log(`  Successfully enrolled:        0  (dry-run; would enroll: ${dryPhotoOk})`);
    console.log(`  Failed - no face detected:    0  (dry-run — not run)`);
    console.log(`  Failed - photo load error:   ${dryPhotoBad}`);
    console.log(`  Failed - AWS error:            0  (dry-run — not run)`);
  } else {
    console.log(`  Successfully enrolled:        ${success}`);
    console.log(`  Failed - no face detected:    ${failNoFace}`);
    console.log(`  Failed - photo load error:     ${failPhotoLoad}`);
    console.log(`  Failed - AWS error:         ${failAws}`);
  }
  console.log("=".repeat(72) + "\n");

  const outPath = join(process.cwd(), "scripts", "enrollment-output.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        collectionId: COLLECTION_ID,
        at: new Date().toISOString(),
        totalPlayersScanned: players.length,
        alreadyValidInAws: alreadyValid,
        noPhotoAvailable: noPhoto,
        attemptedEnrollment,
        ...(DRY_RUN
          ? {
              dryRunPhotoLoadOk: dryPhotoOk,
              dryRunPhotoLoadFailed: dryPhotoBad,
            }
          : {
              successCount: success,
              failNoFace,
              failPhotoLoad,
              failAws,
            }),
        results: output,
      },
      null,
      2
    ),
    "utf-8"
  );
  logPlayer(`Wrote ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
