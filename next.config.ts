// Next.js 16 config (TS): avoid strict typing to prevent
// property validation errors for evolving config surface.
const isGhPages = process.env.GH_PAGES === "true";
const repoName = "FastResume"; // 用于 GitHub Pages 的 basePath

const nextConfig = {
  // 纯静态导出，便于 GitHub Pages 部署
  output: "export",
  images: { unoptimized: true },

  // GitHub Pages 需要设置资源前缀与 basePath
  ...(isGhPages
    ? { basePath: `/${repoName}`, assetPrefix: `/${repoName}/` }
    : {}),

  // 保留原有 serverExternalPackages 配置（Vercel/其他平台使用）
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
