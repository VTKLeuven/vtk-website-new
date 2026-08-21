"use client";

import { Fragment, useState } from "react";
import type { KulAuthLogEntry } from "@vtk/auth/server";

// Superadmin-only tooling: copy stays in English (technical terms).

const ENGINEERING_FACULTY_UNIT = "50000486";

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
    /employeetype|orgunit|faculty|facult|department|affiliation|studie|program|kuldipl|kulopl/i.test(
      key,
    ),
  );
}

function containsValue(value: unknown, needle: string): boolean {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).includes(needle);
  }
  if (Array.isArray(value)) return value.some((item) => containsValue(item, needle));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((item) => containsValue(item, needle));
  }
  return false;
}

export function KulAuthLogViewer({ logs }: { logs: KulAuthLogEntry[] }) {
  const [openLogs, setOpenLogs] = useState<Set<string>>(new Set());

  function toggleLog(id: string) {
    setOpenLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/20 p-8 text-center">
        <p className="text-sm font-medium text-vtk-ink">No logins captured yet</p>
        <p className="mt-1 text-xs text-zinc-500">
          Turn on logging above, then sign in via KU Leuven once and reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-vtk-blue/15 bg-white shadow-xs">
      <table className="w-full table-fixed text-left text-xs text-vtk-ink">
        <colgroup>
          <col className="w-[145px]" />
          <col className="w-[210px]" />
          <col />
          <col className="w-[125px]" />
        </colgroup>
        <thead className="border-b border-vtk-blue/10 bg-vtk-blue-soft/40 text-[11px] font-semibold uppercase tracking-wider text-[#5c667f]">
          <tr>
            <th className="px-3.5 py-2.5 whitespace-nowrap">Timestamp</th>
            <th className="px-3.5 py-2.5">User</th>
            <th className="px-3.5 py-2.5">Faculty & Roles</th>
            <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Claims</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-vtk-blue/10">
          {logs.map((log) => {
            const keys = Object.keys(log.claims);
            const faculty = facultyClaims(log.claims);
            const engineeringFaculty = Object.values(log.claims).some((value) =>
              containsValue(value, ENGINEERING_FACULTY_UNIT),
            );
            const isOpen = openLogs.has(log.id);

            return (
              <Fragment key={log.id}>
                <tr className="hover:bg-vtk-blue-soft/20 align-top transition">
                  <td className="px-3.5 py-2.5 font-medium whitespace-nowrap text-vtk-ink">
                    {formatAt(log.at)}
                  </td>
                  <td className="px-3.5 py-2.5 min-w-0">
                    {log.email ? (
                      <div className="font-medium text-vtk-ink truncate" title={log.email}>
                        {log.email}
                      </div>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                    {log.rNumber && (
                      <div className="text-[11px] font-mono text-zinc-500">{log.rNumber}</div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 min-w-0">
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {engineeringFaculty && (
                        <span className="inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 font-medium">
                          Engineering ({ENGINEERING_FACULTY_UNIT})
                        </span>
                      )}
                      {faculty.map(([key, value]) => (
                        <span
                          key={key}
                          className="inline-block max-w-full truncate rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                          title={`${key}: ${toText(value)}`}
                        >
                          <span className="font-medium">{key}:</span> {toText(value) || "(empty)"}
                        </span>
                      ))}
                      {!engineeringFaculty && faculty.length === 0 && (
                        <span className="text-zinc-400">No faculty claims</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleLog(log.id)}
                      className="cursor-pointer text-xs text-zinc-600 hover:text-vtk-ink font-medium select-none"
                    >
                      {isOpen ? "▼" : "▶"} {keys.length} claims
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-zinc-50/50">
                    <td colSpan={4} className="px-4 py-3 border-t border-vtk-blue/10">
                      <pre className="max-h-96 overflow-auto rounded-lg border border-vtk-blue/10 bg-zinc-50 p-3 text-xs leading-relaxed text-vtk-ink font-mono">
                        {JSON.stringify(log.claims, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
