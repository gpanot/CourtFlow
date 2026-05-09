import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { access } from "fs/promises";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const execFileAsync = promisify(execFile);

const PACKS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-packs");
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "split-stickers.py");

/**
 * Resolve the Python binary to use for sticker processing.
 * All paths are constructed at runtime (not statically) so Turbopack
 * never tries to resolve them as module imports during the build.
 *
 * Priority:
 *  1. STICKER_PYTHON_BIN env var (set in Dockerfile for production)
 *  2. Local .venv (development)
 *  3. Common system paths
 *  4. Bare command as last resort
 */
async function resolvePythonBin(): Promise<string> {
  const cwd = process.cwd();

  // Build candidate list at runtime — never at module-evaluation time
  const candidates: string[] = [];

  const envBin = process.env["STICKER_PYTHON_BIN"];
  if (envBin) candidates.push(envBin);

  // Construct local venv path at runtime to avoid Turbopack following symlinks
  candidates.push([cwd, ".venv", "bin", "python3"].join(path.sep));
  candidates.push(["", "usr", "bin", "python3"].join(path.sep));
  candidates.push(["", "usr", "local", "bin", "python3"].join(path.sep));
  candidates.push(["", "opt", "sticker-venv", "bin", "python3"].join(path.sep));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }

  // Bare commands as final fallback (no fs check needed)
  return "python3";
}

/**
 * POST: Split the player's generated sticker result into 4 quadrants,
 * remove background, save as 512x512 webp stickers.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const result = await prisma.playerStickerResult.findUnique({ where: { playerId } });
    if (!result) return notFound("No sticker result found. Generate stickers first.");

    const resultImagePath = path.join(process.cwd(), result.imageUrl.split("?")[0]);
    const outputDir = path.join(PACKS_DIR, playerId);

    const pythonBin = await resolvePythonBin();
    console.log(`[sticker-process] Using Python: ${pythonBin}`);

    const { stdout, stderr } = await execFileAsync(pythonBin, [
      SCRIPT_PATH,
      resultImagePath,
      outputDir,
    ], { timeout: 120_000 });

    if (stderr) {
      console.warn("[sticker-process] Python stderr:", stderr);
    }

    let outputPaths: string[];
    try {
      outputPaths = JSON.parse(stdout.trim());
    } catch {
      console.error("[sticker-process] Failed to parse Python output:", stdout);
      return error("Processing script returned invalid output", 500);
    }

    const baseUrl = `/uploads/players/sticker-packs/${playerId}`;
    const stickerUrls = {
      sticker1Url: `${baseUrl}/sticker_1.webp?t=${Date.now()}`,
      sticker2Url: `${baseUrl}/sticker_2.webp?t=${Date.now()}`,
      sticker3Url: `${baseUrl}/sticker_3.webp?t=${Date.now()}`,
      sticker4Url: `${baseUrl}/sticker_4.webp?t=${Date.now()}`,
    };

    const pack = await prisma.playerStickerPack.upsert({
      where: { playerId },
      create: {
        playerId,
        resultId: result.id,
        ...stickerUrls,
      },
      update: {
        resultId: result.id,
        ...stickerUrls,
        updatedAt: new Date(),
      },
    });

    return json({
      id: pack.id,
      sticker1Url: pack.sticker1Url,
      sticker2Url: pack.sticker2Url,
      sticker3Url: pack.sticker3Url,
      sticker4Url: pack.sticker4Url,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("[sticker-process] Error:", msg);
    return error(`Sticker processing failed: ${msg}`, 500);
  }
}
