import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeMagicLoginToken, MagicLinkError } from "@/lib/player-magic-link";
import { signPlayerToken } from "@/app/api/public/auth/login/route";

export const dynamic = "force-dynamic";

// Read lazily per-request so NEXT_PUBLIC_COURTPASS_URL changes (e.g. env.local
// pointing to localhost:3001) are picked up without a module-level cache.
function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_COURTPASS_URL ?? "https://courtpass.thecourtflow.com"
  ).replace(/\/$/, "");
}

// Use the clean /auth/magic URL — next.config.ts rewrites it to /book/auth/magic
// on the CourtPass host, so the client page renders without an extra round-trip.
function errorRedirect(code: "expired" | "already_used" | "invalid"): NextResponse {
  return NextResponse.redirect(`${getBaseUrl()}/auth/magic?error=${code}`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawToken = request.nextUrl.searchParams.get("token");

  if (!rawToken) {
    return errorRedirect("invalid");
  }

  let playerId: string;
  try {
    ({ playerId } = await consumeMagicLoginToken(rawToken));
  } catch (e) {
    if (e instanceof MagicLinkError) {
      return errorRedirect(e.code);
    }
    console.error("[magic-auth] unexpected error:", e);
    return errorRedirect("invalid");
  }

  // Fetch the player's email for the session token (required by signPlayerToken)
  const account = await prisma.playerAccount.findFirst({
    where: { playerId, provider: "credentials" },
    select: { providerAccountId: true },
  });
  const email = account?.providerAccountId ?? "";

  const sessionToken = signPlayerToken({
    playerId,
    email,
    type: "player_credentials",
  });

  // Redirect to the client-side page that persists the token to localStorage.
  // /auth/magic is the clean public URL; next.config.ts rewrites it to /book/auth/magic.
  return NextResponse.redirect(
    `${getBaseUrl()}/auth/magic?session=${encodeURIComponent(sessionToken)}`
  );
}
