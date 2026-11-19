import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // E2E builds (dummy Supabase keys) export to `out-e2e/` so they never replace the deployable `out/`.
  ...(process.env.E2E_BUILD === "1" ? { distDir: "out-e2e" } : {}),
};

export default nextConfig;
