"use client";
import { useMemo, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Card, Select } from "@vtk/ui";
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
    const perUser = new Map<string, { name: string; count: number }>();
    for (const r of ranking) {
      if (postFilter !== "ALL" && r.post !== postFilter) continue;
      const entry = perUser.get(r.userId) ?? { name: r.name, count: 0 };
      entry.count += r.count;
      perUser.set(r.userId, entry);
    }
    const list = [...perUser.values()];
    const sign = dir === "asc" ? 1 : -1;
    list.sort((a, b) => (a.count - b.count || a.name.localeCompare(b.name)) * sign);
    return list;
  }, [ranking, postFilter, dir]);

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
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name + i} className="border-t border-zinc-200">
                <td className="px-4 py-2 text-zinc-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-zinc-500">{r.count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  {nl ? "Nog geen voltooide shiften." : "No completed shifts yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
