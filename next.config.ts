import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*"],
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
