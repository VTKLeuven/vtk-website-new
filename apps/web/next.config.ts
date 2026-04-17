import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

// Load .env from the monorepo root so we don't need to duplicate it per app.
loadEnvConfig(monorepoRoot);

// NOTE on `npm run dev`:
//   We run the dev server with `next dev --webpack` (see package.json).
//   Turbopack + Tailwind v4's PostCSS plugin has a known leak in Next 16.x
//   where every recompile spawns a fresh .next/dev/build/postcss.js
//   subprocess that is never reaped. In a workspace this can balloon to
//   hundreds of processes / tens of GB of memory within minutes. See
//   https://github.com/vercel/next.js/discussions/77102 (search for
//   "tailwind.css compilation, it spawns an infinite amount of nodejs
//   processes"). Until that is fixed upstream, we stay on the webpack
//   builder in dev. Production builds with `next build` use Turbopack
//   (single shot, no leak), which is fine.

const nextConfig: NextConfig = {
  transpilePackages: ["@vtk/ui", "@vtk/auth", "@vtk/db", "@vtk/i18n", "@vtk/storage"],
  // Keep heavy, native, or generated server-only packages OUT of the
  // bundler module graph. Without this, the bundler tries to fully
  // resolve the generated Prisma client (which is huge) across every
  // page/route that imports @vtk/db.
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@node-rs/argon2",
    "sharp",
    "archiver",
  ],
  // Pin the workspace root explicitly so Next.js / webpack / Turbopack do
  // not walk upwards and try to index the user's home directory (there's
  // a stray package-lock.json at ~ on some machines, and OrbStack mounts
  // under ~/OrbStack contain symlink cycles).
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    // Allow uploads bigger than the default 1 MiB body limit for server actions.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
