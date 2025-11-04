import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ensure native module is treated as external in server bundles
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
