import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cf-site-access";
const TOKEN_VALUE = "granted";

/** Set to `false` when you want the site gate back (still respects `SITE_GATE_ENABLED`). */
const SITE_GATE_TEMPORARILY_OFF = true;

function isSiteGateEnabled(): boolean {
  const v = process.env.SITE_GATE_ENABLED;
  return v === "true" || v === "1";
}

/**
 * Returns true when the request is coming from the CourtPass player-portal
 * hostname. We match:
 *   - courtpass.thecourtflow.com          (production)
 *   - courtpass.localhost / courtpass.*   (local dev convenience — any host
 *     whose first label is "courtpass")
 *   - NEXT_PUBLIC_COURTPASS_URL override  (staging / preview domains)
 */
function isCourtPassHost(host: string): boolean {
  const courtpassUrl = process.env.NEXT_PUBLIC_COURTPASS_URL ?? "";
  if (courtpassUrl) {
    try {
      const cpHost = new URL(courtpassUrl).hostname;
      if (host === cpHost) return true;
    } catch {
      // ignore malformed env value
    }
  }
  // First label of the hostname is "courtpass"
  return host.split(".")[0] === "courtpass";
}

/**
 * Returns true when the request is from the main CourtFlow domain and the
 * path starts with /book — i.e. an old bookmark or hardcoded link that should
 * now live on CourtPass.
 */
function isMainDomainBookPath(host: string, pathname: string): boolean {
  if (!pathname.startsWith("/book")) return false;
  // Do NOT redirect if this is already on the CourtPass host or if the request
  // is an internal rewrite (host will be localhost:* on the second middleware pass).
  if (isCourtPassHost(host)) return false;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false;
  return true;
}

export function middleware(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  const { pathname, search } = request.nextUrl;

  // ── CourtPass hostname → rewrite /xxx to /book/xxx ────────────────────────
  if (isCourtPassHost(host)) {
    // Pass through requests that are already under /book, Next.js internals,
    // API routes, and all public static assets (images, icons, manifests, uploads).
    if (
      pathname.startsWith("/book") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/__nextjs") ||
      pathname.startsWith("/images/") ||
      pathname.startsWith("/icons/") ||
      pathname.startsWith("/uploads/") ||
      pathname.startsWith("/store-assets/") ||
      pathname === "/favicon.ico" ||
      pathname === "/manifest.json" ||
      pathname === "/manifest-tv.json" ||
      /\.(png|jpg|jpeg|svg|webp|ico|json|woff2?|txt|xml)$/.test(pathname)
    ) {
      return NextResponse.next();
    }

    // / → /book/intro, /login → /book/login, etc.
    const rewrittenPath = pathname === "/" ? "/book/intro" : `/book${pathname}`;
    // Force the rewrite target to the internal server origin (localhost:3000).
    // If we leave the host as courtpass.thecourtflow.com, Next.js treats it as
    // an external rewrite and tries to proxy to that host externally — which
    // fails because the custom domain points back to this same server.
    // Using the internal origin makes Next.js resolve the route locally.
    const url = request.nextUrl.clone();
    url.protocol = "http";
    url.host = "localhost:3000";
    url.pathname = rewrittenPath;
    return NextResponse.rewrite(url);
  }

  // ── Main domain: /book/* → 308 permanent redirect to CourtPass ────────────
  if (isMainDomainBookPath(host, pathname)) {
    const courtpassUrl =
      process.env.NEXT_PUBLIC_COURTPASS_URL?.replace(/\/$/, "") ??
      "https://courtpass.thecourtflow.com";

    // Strip the leading /book from the path: /book/login → /login, /book → /
    const strippedPath = pathname.slice("/book".length) || "/";
    const destination = `${courtpassUrl}${strippedPath}${search}`;
    return NextResponse.redirect(destination, { status: 308 });
  }

  // ── Site gate (unchanged logic) ───────────────────────────────────────────
  if (SITE_GATE_TEMPORARILY_OFF || !isSiteGateEnabled()) {
    return NextResponse.next();
  }

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
