import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*"],
  turbopack: {
    root: ".",
  },
  async headers() {
    if (process.env.NODE_ENV !== "production") {
      return [
        {
          source: "/(.*)",
          headers: [
            {
              key: "Content-Security-Policy",
              value: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; default-src 'self'; connect-src *; style-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' data:;",
            },
          ],
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
