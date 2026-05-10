import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.stickerTemplate.findUnique({ where: { id } });
    if (!existing) return notFound("Template not found");

    const body = await parseBody<{
      name?: string;
      malePrompt?: string;
      femalePrompt?: string;
    }>(request);

    const template = await prisma.stickerTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.malePrompt !== undefined && { malePrompt: body.malePrompt }),
        ...(body.femalePrompt !== undefined && { femalePrompt: body.femalePrompt }),
      },
    });

    return json(template);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.stickerTemplate.findUnique({ where: { id } });
    if (!existing) return notFound("Template not found");

    await prisma.stickerTemplate.delete({ where: { id } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
