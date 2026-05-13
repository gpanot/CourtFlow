import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { processStickerQueue } from "@/lib/sticker-job-processor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifySecret(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return true; // allow in dev when not configured
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const result = await processStickerQueue();
  return json(result);
}

// GET: queue status counts
export async function GET(request: NextRequest) {
  if (!verifySecret(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const [pending, processing, done, failed] = await Promise.all([
    prisma.stickerJobQueue.count({ where: { status: "pending" } }),
    prisma.stickerJobQueue.count({ where: { status: "processing" } }),
    prisma.stickerJobQueue.count({ where: { status: "done" } }),
    prisma.stickerJobQueue.count({ where: { status: "failed" } }),
  ]);
  return json({ pending, processing, done, failed });
}
