import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

loadEnvConfig(monorepoRoot);

// See apps/web/next.config.ts for the rationale on dev-mode builder and
// workspace-root pinning.
const nextConfig: NextConfig = {
  transpilePackages: ["@vtk/auth", "@vtk/ui"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
