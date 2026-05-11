import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const templates = await prisma.stickerTemplate.findMany({
      orderBy: { createdAt: "asc" },
    });

    return json(templates);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const body = await parseBody<{
      name?: string;
      malePrompt?: string;
      femalePrompt?: string;
    }>(request);

    if (!body.name?.trim()) return error("name is required", 400);
    if (!body.malePrompt?.trim()) return error("malePrompt is required", 400);
    if (!body.femalePrompt?.trim()) return error("femalePrompt is required", 400);

    const template = await prisma.stickerTemplate.create({
      data: {
        name: body.name.trim(),
        malePrompt: body.malePrompt.trim(),
        femalePrompt: body.femalePrompt.trim(),
      },
    });

    return json(template, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
