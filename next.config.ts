import type { NextConfig } from "next";

// Hostname used for the CourtPass player portal custom domain.
// Also matches localhost variants whose first label is "courtpass" for local dev.
const COURTPASS_HOST = process.env.NEXT_PUBLIC_COURTPASS_URL
  ? new URL(process.env.NEXT_PUBLIC_COURTPASS_URL).hostname
  : "courtpass.thecourtflow.com";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": [
      "mobile/android/**",
      "mobile/ios/**",
      "mobile/.gradle/**",
      "mobile/android/app/build/**",
    ],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  allowedDevOrigins: ["*"],
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_DEPLOYMENT_ID ||
      Date.now().toString(),
  },
  turbopack: {
    root: ".",
  },
  async rewrites() {
    // Paths that must NEVER be rewritten — they are served directly from
    // public/ or Next.js internals. Listed explicitly because next.config.ts
    // path patterns do not support non-capturing groups inside named params,
    // so we cannot use a single negative-lookahead regex for these.
    const PASSTHROUGH: string[] = [
      // Next.js internals / API routes (handled separately; these are here as
      // a safety net in case the catch-all fires before them)
      "/api/:path*",
      "/_next/:path*",
      // Static asset directories
      "/images/:path*",
      "/icons/:path*",
      "/uploads/:path*",
      "/store-assets/:path*",
      // Root-level public files
      "/sw.js",
      "/manifest.json",
      "/manifest-tv.json",
      "/favicon.ico",
      "/favicon-16x16.png",
      "/favicon-32x32.png",
      "/apple-touch-icon.png",
      "/robots.txt",
      "/sitemap.xml",
    ];

    // Build passthrough rewrites that simply call NextResponse.next() by
    // mapping each path to itself (i.e. destination === source). These are
    // listed first in beforeFiles so they short-circuit the catch-all below.
    const passthroughRewrites = PASSTHROUGH.map((source) => ({
      source,
      has: [{ type: "host" as const, value: COURTPASS_HOST }],
      destination: source,
    }));

    return {
      // beforeFiles rewrites run before the filesystem is checked, so they
      // transparently map CourtPass paths to the /book/* route tree.
      beforeFiles: [
        // / → /book/intro
        {
          source: "/",
          has: [{ type: "host", value: COURTPASS_HOST }],
          destination: "/book/intro",
        },

        // Static-file / internal passthroughs come before the catch-all so
        // favicon, manifest, sw.js, etc. are never rewritten.
        ...passthroughRewrites,

        // /anything (except paths matched above) → /book/anything
        // Excludes /book/*, /api/*, /_next/*, and all public/ static paths.
        {
          source:
            "/:path((?!book|api|_next|images|icons|uploads|store-assets|manifest\\.json|manifest-tv\\.json|sw\\.js|favicon|apple-touch-icon|robots\\.txt|sitemap\\.xml).*)",
          has: [{ type: "host", value: COURTPASS_HOST }],
          destination: "/book/:path",
        },
      ],
    };
  },

  async headers() {
    const rules = [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript" },
        ],
      },
    ];

    if (process.env.NODE_ENV !== "production") {
      rules.push({
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; default-src 'self'; connect-src *; style-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' data:;",
          },
        ],
      });
    }

    return rules;
  },
};

export default nextConfig;
