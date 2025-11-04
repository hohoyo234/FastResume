// Next.js 16 config (TS): avoid strict typing to prevent
// property validation errors for evolving config surface.
const nextConfig = {
  // Ensure native module is treated as external in server bundles
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
