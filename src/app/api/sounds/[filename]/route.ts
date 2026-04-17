import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const ALLOWED_FILES = new Map<string, string>([
  ["202029__hykenfreak__notification-chime.mp3", "audio/mpeg"],
  ["415763__thebuilder15__doorbell-notification.mp3", "audio/mpeg"],
  ["209578__zott820__cash-register-purchase.mp3", "audio/mpeg"],
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const contentType = ALLOWED_FILES.get(filename);
  if (!contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "sounds", filename);
  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
