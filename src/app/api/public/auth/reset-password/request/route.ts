import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { requestPasswordReset } from "@/lib/player-reset-password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string };
    const { email } = body;

    if (!email || typeof email !== "string") {
      // Still return 200 to prevent enumeration
      return json({ ok: true });
    }

    await requestPasswordReset(email);

    return json({ ok: true });
  } catch (e) {
    console.error("[reset-password/request] error:", (e as Error).message);
    // Always 200 — never reveal internal errors to the client
    return json({ ok: true });
  }
}
