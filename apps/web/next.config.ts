import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./lib/legacyRedirects";

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
  // Do not let stale declarations from a previous dev server break a clean
  // production build (Next 16 stores them separately in .next/dev/types).
  typescript: {
    tsconfigPath: process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json",
  },
  allowedDevOrigins: ["192.168.9.206", "192.168.9.226", "127.0.0.1", "*.trycloudflare.com"],
  transpilePackages: ["@vtk/ui", "@vtk/auth", "@vtk/db", "@vtk/i18n", "@vtk/mail", "@vtk/storage", "@vtk/payments"],
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
    "nodemailer",
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
  // Er staat hier bewust géén `images`-sleutel. Alles wat via next/image gaat is
  // een pad op deze host (`/api/media/...` en de statische bestanden onder
  // `public/`), en daar heeft de optimizer geen `remotePatterns` voor nodig.
  //
  // De fotogalerij is de reden dat je hier misschien naar zoekt: die haalt haar
  // beelden bij Immich Public Proxy, een aparte host uit `GALLERY_PUBLIC_PROXY_URL`.
  // Die kan hier niet in `remotePatterns`, want de hostname komt uit de omgeving en
  // verschilt per installatie. Bovendien wijst ze lokaal naar localhost, en Next 16
  // weigert een upstream die naar een privé-IP resolvet ("resolved to private ip",
  // 400) tenzij je `dangerouslyAllowLocalIP` aanzet. De galerij houdt dus `<img>`;
  // Immich levert daar al thumbnails en previews op maat aan.
  async redirects() {
    return [
      {
        source: "/mijn-tickets",
        destination: "/account#mijn-vtk-tickets",
        permanent: true,
      },
      {
        source: "/mijn-tickets/:orderId",
        destination: "/tickets/bestelling/:orderId",
        permanent: true,
      },
      {
        source: "/nl/mijn-tickets",
        destination: "/account#mijn-vtk-tickets",
        permanent: true,
      },
      {
        source: "/nl/mijn-tickets/:orderId",
        destination: "/tickets/bestelling/:orderId",
        permanent: true,
      },
      {
        source: "/en/mijn-tickets",
        destination: "/en/account#mijn-vtk-tickets",
        permanent: true,
      },
      {
        source: "/en/mijn-tickets/:orderId",
        destination: "/en/tickets/bestelling/:orderId",
        permanent: true,
      },
      // De uitleendienstpagina heette hier eerst "reservaties-en-logistiek".
      // Die naam heeft in de sitemap gestaan, dus ze mag niet doodlopen.
      {
        source: "/info/reservaties-en-logistiek",
        destination: "/info/uitleendienst",
        permanent: true,
      },
      {
        source: "/en/info/reservaties-en-logistiek",
        destination: "/en/info/uitleendienst",
        permanent: true,
      },
      // De adressen van de oude vtk.be. De map zelf staat in
      // lib/legacyRedirects.ts, zodat ze getest kan worden; hier rollen we ze
      // enkel uit.
      ...LEGACY_REDIRECTS,
    ];
  },
  async headers() {
    return [
      {
        source: "/scan/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      ...[
        "/tickets/bestelling/:path*",
        "/nl/tickets/bestelling/:path*",
        "/en/tickets/bestelling/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      })),
    ];
  },
};

// Wrap met Sentry: injecteert de client/server/edge-instrumentatie en uploadt
// source maps bij `next build`. org/project/authToken komen uit de omgeving
// (root-.env is hierboven al geladen via loadEnvConfig). Zonder SENTRY_ORG/
// SENTRY_PROJECT/SENTRY_AUTH_TOKEN wordt de source-map-upload stil overgeslagen,
// dus builds blijven ook zonder Sentry-config werken.
//
// NB: we zetten bewust géén `tunnelRoute`; dat zou botsen met de app/[locale]
// catch-all routing. Voeg het pas toe als je een niet-gelokaliseerd top-level
// pad reserveert.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload een bredere set client-bestanden voor betere stack traces.
  widenClientFileUpload: true,

  // Onderdruk plugin-output buiten CI.
  silent: !process.env.CI,
});
