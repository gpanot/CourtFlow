import { NextRequest, NextResponse } from "next/server";
import {
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { prisma } from "@/lib/db";
import { FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";
import { requireSuperAdmin } from "@/lib/auth";
import { USE_MOCK_SERVICE } from "@/lib/face-recognition";

const COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";
const SEARCH_FACE_MATCH_THRESHOLD = 50;
const MAX_FACES = 5;

if (process.env.NODE_ENV === "production" && USE_MOCK_SERVICE) {
  console.error(
    "[FaceRecognition] CRITICAL: Mock mode is active in production. AWS_ACCESS_KEY_ID is missing or invalid. All face enrollments and recognition calls will be fake."
  );
}

function allowSearch(headers: Headers): boolean {
  if (process.env.NODE_ENV === "development") return true;
  try {
    requireSuperAdmin(headers);
    return true;
  } catch {
    return false;
  }
}

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  if (t.includes(",")) return t.split(",").pop() ?? t;
  return t;
}

function base64ToBytes(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}

/**
 * POST /api/rekognition/search
 * Superadmin (or dev): SearchFacesByImage against the global collection — diagnostic.
 */
export async function POST(req: NextRequest) {
  if (!allowSearch(req.headers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64.trim()) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const raw = stripDataUrl(imageBase64);

    if (USE_MOCK_SERVICE) {
      return NextResponse.json({
        searchFaceMatchThreshold: SEARCH_FACE_MATCH_THRESHOLD,
        productionThreshold: FACE_MATCH_THRESHOLD,
        mock: true,
        matches: [],
        message:
          "MOCK: AWS credentials not configured — SearchFacesByImage was not run. Set AWS keys to search the live collection.",
      });
    }

    const rekognition = new RekognitionClient({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const imageBytes = base64ToBytes(raw);

    const response = await rekognition.send(
      new SearchFacesByImageCommand({
        CollectionId: COLLECTION_ID,
        Image: { Bytes: imageBytes },
        MaxFaces: MAX_FACES,
        FaceMatchThreshold: SEARCH_FACE_MATCH_THRESHOLD,
        QualityFilter: "AUTO",
      })
    );

    const faceMatches = response.FaceMatches ?? [];
    const playerIds = [
      ...new Set(
        faceMatches
          .map((m) => {
            const ext = m.Face?.ExternalImageId ?? "";
            return ext.replace(/^player_/, "").trim();
          })
          .filter((id) => id.length > 0)
      ),
    ];

    const players =
      playerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: playerIds } },
            select: {
              id: true,
              name: true,
              avatar: true,
              avatarPhotoPath: true,
              facePhotoPath: true,
            },
          })
        : [];
    const byId = new Map(players.map((p) => [p.id, p]));

    const matches = faceMatches.map((m) => {
      const sim = m.Similarity ?? 0;
      const ext = m.Face?.ExternalImageId ?? null;
      const awsFaceId = m.Face?.FaceId ?? null;
      const parsedId = (ext ?? "").replace(/^player_/, "").trim();
      const p = parsedId ? byId.get(parsedId) : undefined;
      const passedProduction = sim >= FACE_MATCH_THRESHOLD;
      return {
        playerId: p?.id ?? (parsedId || "unknown"),
        name:
          p?.name ??
          (parsedId
            ? "Not in database (orphaned face?)"
            : "Unknown (missing external id)"),
        avatar: p?.avatar ?? "🏓",
        avatarPhotoPath: p?.avatarPhotoPath ?? null,
        facePhotoPath: p?.facePhotoPath ?? null,
        similarity: Math.round(sim * 10) / 10,
        passedProduction,
        productionThreshold: FACE_MATCH_THRESHOLD,
        awsFaceId,
        externalImageId: ext,
      };
    });

    return NextResponse.json({
      searchFaceMatchThreshold: SEARCH_FACE_MATCH_THRESHOLD,
      productionThreshold: FACE_MATCH_THRESHOLD,
      matches,
    });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (
      err?.name === "InvalidParameterException" &&
      (err?.message?.includes("no face") || err?.message?.includes("There are no faces"))
    ) {
      return NextResponse.json({
        searchFaceMatchThreshold: SEARCH_FACE_MATCH_THRESHOLD,
        productionThreshold: FACE_MATCH_THRESHOLD,
        matches: [],
        noFaceInImage: true,
      });
    }
    console.error("[rekognition/search]", e);
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
