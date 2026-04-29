import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
