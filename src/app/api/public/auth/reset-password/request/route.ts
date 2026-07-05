import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { requestPasswordReset } from "@/lib/player-reset-password";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({})) as { email?: string };
  const { email } = body;
  const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";

  console.debug("[reset-password/request] received", {
    email: normalizedEmail || "(missing)",
    at: new Date(startedAt).toISOString(),
  });

  if (normalizedEmail) {
    requestPasswordReset(normalizedEmail)
      .then(() => {
        console.debug("[reset-password/request] background send finished", {
          email: normalizedEmail,
          elapsedMs: Date.now() - startedAt,
        });
      })
      .catch((e) => {
        console.error("[reset-password/request] background error:", {
          email: normalizedEmail,
          elapsedMs: Date.now() - startedAt,
          message: (e as Error).message,
        });
      });
  }

  console.debug("[reset-password/request] responding immediately", {
    email: normalizedEmail || "(missing)",
    elapsedMs: Date.now() - startedAt,
  });

  return json({ ok: true });
}
