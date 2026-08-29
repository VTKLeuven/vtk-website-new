import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

loadEnvConfig(monorepoRoot);

// See apps/web/next.config.ts for the rationale on dev-mode builder and
// workspace-root pinning.
const nextConfig: NextConfig = {
  // A production build must not type-check stale route declarations left by
  // an earlier dev server. Next 16 keeps those in .next/dev/types alongside
  // the production declarations.
  typescript: {
    tsconfigPath: process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json",
  },
  transpilePackages: ["@vtk/gallery", "@vtk/auth", "@vtk/ui", "@vtk/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
