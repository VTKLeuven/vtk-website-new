"use client";
import { useMemo, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Card, Select } from "@vtk/ui";
import { shiftTierFor, shiftTierRange, type ShiftTier } from "@/lib/shift/tiers";
import type { RankingRow } from "./ShiftAdmin";
import { YearPicker } from "./YearPicker";

export function ShiftRanking({
  locale,
  ranking,
  year,
  years,
}: {
  locale: Locale;
  ranking: RankingRow[];
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const [postFilter, setPostFilter] = useState("ALL");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Alleen posten die effectief in de ranglijst voorkomen.
  const presentPosts = useMemo(
    () => [...new Set(ranking.map((r) => r.post))].sort(),
    [ranking],
  );

  const rows = useMemo(() => {
    // Per user het aantal voltooide shiften optellen (totaal of voor één post).
    const perUser = new Map<string, { userId: string; name: string; count: number }>();
    for (const r of ranking) {
      if (postFilter !== "ALL" && r.post !== postFilter) continue;
      const entry = perUser.get(r.userId) ?? { userId: r.userId, name: r.name, count: 0 };
      entry.count += r.count;
      perUser.set(r.userId, entry);
    }
    const list = [...perUser.values()];
    const sign = dir === "asc" ? 1 : -1;
    list.sort((a, b) => (a.count - b.count || a.name.localeCompare(b.name)) * sign);
    return list;
  }, [ranking, postFilter, dir]);

  // Een groep per titel (`lib/shift/tiers.ts`). De titels gaan over alle
  // shiften van het jaar samen; binnen één post zou een scheiding een titel
  // suggereren die niet klopt, dus daar blijft het één lijst.
  const groups = useMemo(() => {
    const ranked = rows.map((row, i) => ({ ...row, rank: i + 1 }));
    if (postFilter !== "ALL") return [{ tier: undefined, rows: ranked }];
    const out: { tier: ShiftTier | null | undefined; rows: typeof ranked }[] = [];
    for (const row of ranked) {
      const tier = shiftTierFor(row.count);
      const last = out.at(-1);
      if (last && last.tier === tier) last.rows.push(row);
      else out.push({ tier, rows: [row] });
    }
    return out;
  }, [rows, postFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <YearPicker locale={locale} year={year} years={years} />
        <Select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} className="w-52">
          <option value="ALL">{nl ? "Totaal (alle posten)" : "Total (all groups)"}</option>
          {presentPosts.map((p) => (
            <option key={p} value={p}>
              {p === "GEEN" ? (nl ? "Geen post" : "No group") : p}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className="text-sm text-vtk-blue hover:underline"
          onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          {dir === "desc" ? (nl ? "Hoogste eerst ↓" : "Highest first ↓") : nl ? "Laagste eerst ↑" : "Lowest first ↑"}
        </button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="w-12 px-4 py-2">#</th>
              <th className="px-4 py-2">{nl ? "Naam" : "Name"}</th>
              <th className="px-4 py-2">{nl ? "Voltooide shiften" : "Completed shifts"}</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.tier === undefined ? "all" : (group.tier?.min ?? 0)}>
              {group.tier !== undefined && (
                <tr className="vtk-table-group">
                  <th scope="rowgroup" colSpan={3}>
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${group.tier ? "bg-vtk-yellow" : "bg-vtk-navy/20"}`}
                      />
                      <span className="font-semibold text-vtk-ink">
                        {group.tier ? group.tier[locale] : nl ? "Nog geen titel" : "No title yet"}
                      </span>
                      <span className="text-vtk-muted">{shiftTierRange(group.tier, locale)}</span>
                    </span>
                  </th>
                </tr>
              )}
              {group.rows.map((r) => (
                <tr key={r.userId} className="border-t border-vtk-navy/10">
                  <td className="px-4 py-2 text-vtk-muted">{r.rank}</td>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 tabular-nums text-vtk-muted">{r.count}</td>
                </tr>
              ))}
            </tbody>
          ))}
          {rows.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-vtk-muted">
                  {nl ? "Nog geen voltooide shiften." : "No completed shifts yet."}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </Card>
    </div>
  );
}
