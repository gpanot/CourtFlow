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
        // /anything (except /book/*, /api/*, /_next/*, and static assets)
        // → /book/anything
        {
          source: "/:path((?!book(?:/|$)|api(?:/|$)|_next(?:/|$)|uploads(?:/|$)|images(?:/|$)|icons(?:/|$)|store-assets(?:/|$)).*)",
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
