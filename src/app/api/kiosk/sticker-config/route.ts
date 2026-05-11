import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export async function GET() {
  return json({ secret: process.env.STICKER_KIOSK_SECRET ?? "" });
}
