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
  // Een dev-server die je over het netwerk opent (LAN, Tailscale, tunnel) moet
  // hier staan. Anders weigert Next de HMR-websocket en hydrateert de pagina
  // nooit: de HTML staat er, maar geen enkele knop, menu of formulier reageert.
  allowedDevOrigins: ["127.0.0.1", "apollo", "100.113.230.81", "**.ts.net"],
  transpilePackages: ["@vtk/auth", "@vtk/ui", "@vtk/db", "@vtk/mail", "@vtk/payments", "@vtk/storage"],
  // Keep the generated Prisma client and native image lib out of the bundler
  // module graph; see apps/web/next.config.ts for the full rationale.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "sharp"],
  outputFileTracingRoot: monorepoRoot,
  // Dezelfde basis als apps/web/next.config.ts; de uitleg per header staat daar.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
