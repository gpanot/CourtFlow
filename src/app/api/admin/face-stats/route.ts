import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const where = {
    createdAt: { gte: since },
    similarityScore: { not: null },
    ...(venueId ? { venueId } : {}),
  };

  const logs = await prisma.faceRecognitionLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      similarityScore: true,
      threshold: true,
      passed: true,
      createdAt: true,
      player: {
        select: { id: true, name: true, facePhotoPath: true, createdAt: true },
      },
    },
  });

  const totalCheckins = logs.length;
  const scores = logs
    .map((l) => l.similarityScore)
    .filter((s): s is number => s != null);
  const passScores = scores.filter((s) => s >= 80);
  const avgScore =
    passScores.length > 0
      ? passScores.reduce((a, b) => a + b, 0) / passScores.length
      : 0;
  const passedCount = logs.filter((l) => l.passed).length;
  const passRate = totalCheckins > 0 ? (passedCount / totalCheckins) * 100 : 0;

  const distribution: { bucket: string; count: number }[] = [];
  for (let low = 80; low < 100; low += 2) {
    const high = low + 2;
    const label = `${low}-${high}%`;
    const count = scores.filter((s) => s >= low && s < high).length;
    distribution.push({ bucket: label, count });
  }
  const below80 = scores.filter((s) => s < 80).length;
  if (below80 > 0) {
    distribution.unshift({ bucket: "<80%", count: below80 });
  }

  const rows = logs.map((l) => ({
    id: l.id,
    playerName: l.player?.name ?? "Unknown",
    playerId: l.player?.id ?? null,
    playerFacePhotoPath: l.player?.facePhotoPath ?? null,
    playerCreatedAt: l.player?.createdAt?.toISOString() ?? null,
    similarityScore: l.similarityScore,
    threshold: l.threshold,
    passed: l.passed,
    createdAt: l.createdAt.toISOString(),
  }));

  return NextResponse.json({
    totalCheckins,
    avgScore: Math.round(avgScore * 10) / 10,
    passedCount,
    passRate: Math.round(passRate * 10) / 10,
    distribution,
    rows,
    days,
  });
}
