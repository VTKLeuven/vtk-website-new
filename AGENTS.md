<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dev server: do NOT use Turbopack

`apps/web` and `apps/logistiek` both run `next dev --webpack` in their `dev`
script. This is intentional. Next.js 16 + Turbopack + Tailwind v4's PostCSS
plugin has a severe memory leak where every CSS recompile spawns a fresh
`.next/dev/build/postcss.js` child process that is never reaped. In this
monorepo that quickly balloons to hundreds of workers and tens of GB of
memory (see https://github.com/vercel/next.js/discussions/77102).

- Do NOT change the dev script back to plain `next dev`.
- If you need to experiment with Turbopack, use the explicit
  `npm run dev:turbopack -w @vtk/web` script and watch
  `pgrep -f postcss.js | wc -l` — if that number keeps growing, kill it.
- `next build` uses Turbopack and is fine (single-shot, no leak).

# Workspace root is pinned

Both `next.config.ts` files set `turbopack.root` and `outputFileTracingRoot`
to the monorepo root. Do not remove these. Without them Next.js walks
upwards to find a lockfile and can latch onto a stray `package-lock.json`
in the user's home directory, then try to scan things like OrbStack
container mounts (which contain symlink cycles).

# Tailwind v4 source scanning is explicit

`apps/*/app/globals.css` uses `@import "tailwindcss" source(none);` plus
explicit `@source` directives. Do not switch back to auto-detection: the
oxide scanner follows symlinks and was walking `~/OrbStack/**`.

# Never hand-edit deps; regenerate the lockfile

npm drops other platforms' native binaries from `package-lock.json` on an
incremental `npm install` (npm/cli#4828). The lockfile keeps working on the
machine that wrote it, so this ships unnoticed: `npm ci` on Linux (the server
and CI) or macOS then installs a binding package with no `.node` file in it,
and the failure only surfaces at build/dev time as a cryptic "cannot find
native binding". It has bitten us twice: `@rolldown/binding-*` (fixed in
691f554) and `lightningcss-*` (fixed after `cee7046` shipped it broken again).

- After changing dependencies, do NOT commit an incrementally-updated lockfile.
  Regenerate it: `rm -rf node_modules package-lock.json && npm install`.
  A clean resolve pulls in every platform's optional deps.
- `npm run verify:lockfile` (`scripts/check-lockfile-platforms.mjs`) asserts
  that every declared platform binding has a lockfile entry. CI runs it before
  `npm ci`, so a pruned lockfile fails the PR instead of the deploy.
- Symptom on Windows: every page 500s in dev with a lightningcss error.
  Installing just the one missing binary (`npm install --no-save
  lightningcss-win32-x64-msvc`) unblocks your machine but leaves the lockfile
  broken for Linux and macOS. Fix the lockfile instead.

# Prisma client must not be re-exported from @vtk/db

`packages/db/src/index.ts` exports `prisma` only. Do NOT re-export from
`@prisma/client` (not even as types). The generated `index.d.ts` is
~28k lines and pulling it through the bundler is pathologically slow.
Import Prisma model types directly from `@prisma/client` at the call site
if you need them.
