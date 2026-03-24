import { NextResponse } from "next/server";

export async function GET() {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    return NextResponse.json({ error: "Missing VAPID public key on server" }, { status: 500 });
  }
  return NextResponse.json({ vapidKey });
}
