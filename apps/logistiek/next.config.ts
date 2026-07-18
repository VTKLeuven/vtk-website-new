import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

loadEnvConfig(monorepoRoot);

// See apps/web/next.config.ts for the rationale on dev-mode builder and
// workspace-root pinning.
const nextConfig: NextConfig = {
  transpilePackages: ["@vtk/auth", "@vtk/ui", "@vtk/db", "@vtk/payments"],
  // Keep the generated Prisma client out of the bundler module graph; see
  // apps/web/next.config.ts for the full rationale.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
