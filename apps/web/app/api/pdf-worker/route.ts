import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zoekt `pdf.worker.min.mjs` vanaf `process.cwd()` naar boven (lokaal ligt
 * `node_modules` in de monorepo-root, in de Docker-image in `/app/node_modules`).
 * Zo hoeft de client-bundel onder webpack geen worker-asset via `import.meta.url`
 * op te lossen.
 */
function resolvePdfWorkerPath(): string | null {
  let dir = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(dir, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function GET() {
  const workerPath = resolvePdfWorkerPath();
  if (!workerPath) {
    return new Response("PDF worker not found", { status: 404 });
  }

  try {
    const source = await readFile(workerPath);
    return new Response(new Uint8Array(source), {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("PDF worker not found", { status: 404 });
  }
}
