import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@vtk/auth", "@vtk/db"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
