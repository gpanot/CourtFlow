import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cf-site-access";
const TOKEN_VALUE = "granted";

/** Set to `false` when you want the site gate back (still respects `SITE_GATE_ENABLED`). */
const SITE_GATE_TEMPORARILY_OFF = true;

function isSiteGateEnabled(): boolean {
  const v = process.env.SITE_GATE_ENABLED;
  return v === "true" || v === "1";
}

export function middleware(request: NextRequest) {
  if (SITE_GATE_TEMPORARILY_OFF || !isSiteGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === "/gate") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/gate/")) {
    return NextResponse.next();
  }

  const accessCookie = request.cookies.get(COOKIE_NAME);
  if (accessCookie?.value === TOKEN_VALUE) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

/**
 * Exclude Next.js internals so dev HMR / Turbopack / devtools work when SITE_GATE_ENABLED.
 * Without `/_next/` (not just static|image), webpack-hmr and chunk loads hit the gate and break.
 * `__nextjs_*` routes are used by Next dev overlay (e.g. stack frames).
 */
export const config = {
  matcher: [
    "/((?!_next/|__nextjs|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|woff2?|js|json)).*)",
  ],
};
