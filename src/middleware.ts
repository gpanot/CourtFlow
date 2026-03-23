import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "CourtFlow2026!";
const COOKIE_NAME = "cf-site-access";
const TOKEN_VALUE = "granted";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/gate") {
    return NextResponse.next();
  }

  if (pathname === "/api/gate/verify") {
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
