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
  experimental: {
    /**
     * Zonder dit weigert Next elke server action met een body boven 1 MiB, en
     * dat is elke foto. De actie kwam daardoor nooit aan bod: je kreeg "Body
     * exceeded 1 MB limit" in de serverlog terwijl het album al aangemaakt was,
     * dus bleef er een leeg album staan.
     *
     * Iets ruimer dan de 100 MB die `uploadAssetAction` zelf toelaat, zodat de
     * vriendelijke melding van de actie ("te groot") afgaat en niet de harde
     * weigering van Next; de multipart-envelop eromheen telt namelijk mee.
     */
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
