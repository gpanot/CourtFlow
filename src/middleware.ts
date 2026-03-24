import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cf-site-access";
const TOKEN_VALUE = "granted";

function isSiteGateEnabled(): boolean {
  const v = process.env.SITE_GATE_ENABLED;
  return v === "true" || v === "1";
}

export function middleware(request: NextRequest) {
  if (!isSiteGateEnabled()) {
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|woff2?|js|json)).*)",
  ],
};
