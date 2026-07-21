import type { KulAuthLogEntry } from "@vtk/auth/server";

// Superadmin-only tooling: copy stays in English (technical terms).

function formatAt(at: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Brussels",
  }).format(at);
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(toText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Claims die vermoedelijk de faculteit / het type medewerker dragen. We lichten
 * ze uit zodat een superadmin in één oogopslag ziet of ICTS dit vrijgeeft, zonder
 * de volledige claimset te moeten uitklappen. De claimnaam kennen we niet zeker
 * (dat is net wat we onderzoeken), dus matchen we breed op de sleutel.
 */
function facultyClaims(claims: Record<string, unknown>): [string, unknown][] {
  return Object.entries(claims).filter(([key]) =>
    /employeetype|faculty|facult|department|affiliation|studie|program/i.test(key),
  );
}

export function KulAuthLogViewer({ logs }: { logs: KulAuthLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No logins captured yet. Turn on logging above, then sign in via KU Leuven once
        and reload this page.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {logs.map((log) => {
        const keys = Object.keys(log.claims);
        const faculty = facultyClaims(log.claims);
        return (
          <li key={log.id} className="rounded-lg border border-vtk-blue/10 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="font-medium text-vtk-ink">{formatAt(log.at)}</span>
              {log.email && <span className="text-zinc-500">{log.email}</span>}
              {log.rNumber && <span className="text-zinc-500">{log.rNumber}</span>}
            </div>

            {faculty.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {faculty.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                  >
                    {key}: {toText(value) || "(empty)"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                No faculty / employee-type claim found in this login.
              </p>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500">
                All {keys.length} claims
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-vtk-blue/10 bg-zinc-50 p-3 text-xs leading-relaxed text-vtk-ink">
                {JSON.stringify(log.claims, null, 2)}
              </pre>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
