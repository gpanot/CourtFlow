/**
 * Bulk-enroll players who have a stored face photo but no valid AWS face
 * (or stale/mock faceSubjectId not in the Rekognition collection).
 *
 * Uses `faceRecognitionService.enrollFace` from `src/lib/face-recognition.ts`.
 *
 * Run from repo root (uses `tsx` so `@/lib/*` path aliases resolve; same as other scripts in this repo):
 *   npx tsx scripts/reenroll-mock-players.ts --dry-run
 *   npx tsx scripts/reenroll-mock-players.ts
 *   npx tsx scripts/reenroll-mock-players.ts --crop-retry
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
import {
  CreateCollectionCommand,
  DetectFacesCommand,
  ListFacesCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { faceRecognitionService, USE_MOCK_SERVICE } from "@/lib/face-recognition";

loadEnv({ path: ".env" });

const COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-1";
const COURTFLOW_BASE_URL =
  process.env.COURTFLOW_BASE_URL ||
  "https://courtflow-production-0441.up.railway.app";
const DRY_RUN = process.argv.includes("--dry-run");
const CROP_RETRY = process.argv.includes("--crop-retry");

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

async function ensureCollectionExists(
  client: RekognitionClient,
  collectionId: string
): Promise<void> {
  try {
    await client.send(
      new CreateCollectionCommand({ CollectionId: collectionId })
    );
    console.log(
      `[${new Date().toISOString()}] Created new collection: ${collectionId}`
    );
  } catch (err: any) {
    if (
      err?.__type === "ResourceAlreadyExistsException" ||
      err?.name === "ResourceAlreadyExistsException"
    ) {
      // Collection already exists.
      return;
    }
    throw err;
  }
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
  if (raw0.startsWith("/uploads/")) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const base = COURTFLOW_BASE_URL.replace(/\/$/, "");
      const url = `${base}${stripQuery(raw0)}`;
      const res = await fetch(url, { signal: ctrl.signal });
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

function isMultiFaceError(err: string | undefined): boolean {
  if (!err) return false;
  return err.toLowerCase().includes("multiple faces");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

async function cropBestFaceWithPaddingBase64(
  client: RekognitionClient,
  imageBase64: string
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  try {
    const inputBytes = Buffer.from(imageBase64, "base64");
    const meta = await sharp(inputBytes).metadata();
    const width = meta.width;
    const height = meta.height;
    if (!width || !height) {
      return { ok: false, error: "Cannot read image dimensions for crop retry" };
    }

    const detect = await client.send(
      new DetectFacesCommand({
        Image: { Bytes: inputBytes },
        Attributes: ["DEFAULT"],
      })
    );

    const faces = detect.FaceDetails ?? [];
    if (faces.length === 0) {
      return { ok: false, error: "DetectFaces found no faces for crop retry" };
    }

    const bestFace = faces.reduce((best, cur) => {
      const bestConfidence = best.Confidence ?? 0;
      const curConfidence = cur.Confidence ?? 0;
      return curConfidence > bestConfidence ? cur : best;
    });

    const bbox = bestFace.BoundingBox;
    if (
      !bbox ||
      bbox.Left == null ||
      bbox.Top == null ||
      bbox.Width == null ||
      bbox.Height == null
    ) {
      return { ok: false, error: "Best face has no valid bounding box" };
    }

    const faceLeft = Math.round(bbox.Left * width);
    const faceTop = Math.round(bbox.Top * height);
    const faceWidth = Math.round(bbox.Width * width);
    const faceHeight = Math.round(bbox.Height * height);
    if (faceWidth <= 0 || faceHeight <= 0) {
      return { ok: false, error: "Invalid face bounding box size for crop retry" };
    }

    const padX = Math.round(faceWidth * 0.3);
    const padY = Math.round(faceHeight * 0.3);

    const left = clamp(faceLeft - padX, 0, width - 1);
    const top = clamp(faceTop - padY, 0, height - 1);
    const right = clamp(faceLeft + faceWidth + padX, left + 1, width);
    const bottom = clamp(faceTop + faceHeight + padY, top + 1, height);

    const cropWidth = right - left;
    const cropHeight = bottom - top;

    const croppedBuffer = await sharp(inputBytes)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .jpeg({ quality: 95 })
      .toBuffer();

    if (croppedBuffer.length < 100) {
      return { ok: false, error: "Cropped image too small for retry" };
    }

    return { ok: true, base64: croppedBuffer.toString("base64") };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown crop retry error",
    };
  }
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

  await ensureCollectionExists(awsClient, COLLECTION_ID);
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
  let cropRetrySuccess = 0;
  let cropRetryFailed = 0;

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
      if (CROP_RETRY && isMultiFaceError(res.error)) {
        logPlayer(`RETRY (crop) ${p.name} | ${p.phone} | multiple faces detected`);
        const cropped = await cropBestFaceWithPaddingBase64(awsClient, rawB64);

        if (cropped.ok) {
          const retryRes = await faceRecognitionService.enrollFace(cropped.base64, p.id);
          if (retryRes.success && retryRes.subjectId) {
            success++;
            cropRetrySuccess++;
            const entry: OutputEntry = {
              playerId: p.id,
              name: p.name,
              phone: p.phone,
              facePhotoPath: p.facePhotoPath,
              status: "enrolled",
              newFaceSubjectId: retryRes.subjectId,
              reason: "IndexFaces + DB update OK (cropped retry)",
            };
            output.push(entry);
            logPlayer(`ENROLLED (cropped) ${p.name} | ${p.phone} | ${retryRes.subjectId}`);
            continue;
          }

          const retryCat = categorizeEnrollError(retryRes.error);
          if (retryCat === "no_face") failNoFace++;
          else failAws++;
          cropRetryFailed++;
          const entry: OutputEntry = {
            playerId: p.id,
            name: p.name,
            phone: p.phone,
            facePhotoPath: p.facePhotoPath,
            status: "failed",
            newFaceSubjectId: "",
            reason: `Crop retry failed: ${retryRes.error ?? "Unknown enrollment error"}`,
          };
          output.push(entry);
          logPlayer(`FAIL (crop retry failed) ${p.name} | ${retryRes.error ?? "unknown"}`);
          continue;
        }

        failAws++;
        cropRetryFailed++;
        const entry: OutputEntry = {
          playerId: p.id,
          name: p.name,
          phone: p.phone,
          facePhotoPath: p.facePhotoPath,
          status: "failed",
          newFaceSubjectId: "",
          reason: `Crop retry failed: ${cropped.error}`,
        };
        output.push(entry);
        logPlayer(`FAIL (crop retry failed) ${p.name} | ${cropped.error}`);
        continue;
      }

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
  if (CROP_RETRY && !DRY_RUN) {
    console.log(`Crop retry enabled:            yes`);
    console.log(`  Crop retry enrolled:         ${cropRetrySuccess}`);
    console.log(`  Crop retry failed:           ${cropRetryFailed}`);
  }
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
              cropRetryEnabled: CROP_RETRY,
              cropRetrySuccess,
              cropRetryFailed,
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
