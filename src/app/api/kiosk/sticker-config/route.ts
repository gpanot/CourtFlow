import { json } from "@/lib/api-helpers";

export async function GET() {
  return json({ secret: process.env.STICKER_KIOSK_SECRET ?? "" });
}
