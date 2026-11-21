"use client";

import { useMemo, useState } from "react";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { normalizeSearchText } from "../../../admin-table";
import type { Cell } from "@/lib/bo/attendance/stats";
import { pct, RateBar, StatusCell } from "../parts";

export type PersonRow = {
  key: string;
  href: string;
  name: string;
  posts: string[];
  linked: boolean;
  present: number;
  excused: number;
  absent: number;
  rate: number | null;
  recentRate: number | null;
  presentStreak: number;
  absentStreak: number;
  cells: Cell[];
};

type SortKey = "name" | "rate" | "recent" | "excused" | "absent" | "streak";

/**
 * Iedereen uit de verslagen van één jaar, met zoeken en sorteren in de browser:
 * het hele praesidium past in één keer op de pagina (een tachtigtal namen).
 */
export function PeopleTable({
  rows,
  meetings,
  average,
  nl,
}: {
  rows: PersonRow[];
  meetings: string[];
  average: number | null;
  nl: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const shown = useMemo(() => {
    const q = normalizeSearchText(query);
    const filtered = q
      ? rows.filter((r) => normalizeSearchText(`${r.name} ${r.posts.join(" ")}`).includes(q))
      : rows;
    const value = (r: PersonRow): number | string => {
      switch (sort.key) {
        case "name":
          return r.name;
        case "rate":
          return r.rate ?? -1;
        case "recent":
          return r.recentRate ?? -1;
        case "excused":
          return r.excused;
        case "absent":
          return r.absent;
        case "streak":
          return r.absentStreak > 0 ? -r.absentStreak : r.presentStreak;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "nl") : va - (vb as number);
      return c !== 0 ? c * sort.dir : a.name.localeCompare(b.name, "nl");
    });
  }, [rows, query, sort]);

  const header = (key: SortKey, label: string, first: 1 | -1 = -1) => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className="bo-att-sort"
          onClick={() => setSort(active ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: first })}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="ticket-admin-field bo-att-search">
        <label htmlFor="att-search">{nl ? "Zoeken op naam of post" : "Search by name or post"}</label>
        <input
          id="att-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {nl ? `${shown.length} personen` : `${shown.length} people`}
      </p>
      <div className="ticket-admin-table-wrap">
        <table className="ticket-admin-table bo-att-table">
          <thead>
            <tr>
              {header("name", nl ? "Naam" : "Name", 1)}
              {header("rate", nl ? "Aanwezig" : "Attended")}
              {header("recent", nl ? "Laatste 5" : "Last 5")}
              {header("excused", nl ? "Verontsch." : "Excused")}
              {header("absent", nl ? "Afwezig" : "Absent")}
              {header("streak", nl ? "Reeks" : "Streak")}
              <th scope="col">{nl ? "Per BO" : "Per meeting"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <LinkedRow key={r.key} href={r.href} className="ticket-admin-linked-row">
                <td data-wrap="true">
                  <Link href={r.href}>
                    <strong>{r.name}</strong>
                  </Link>
                  <small className="bo-att-sub">
                    {r.posts.length ? r.posts.join(", ") : r.linked ? "" : nl ? "niet gekoppeld" : "not linked"}
                  </small>
                </td>
                <td>
                  <RateBar rate={r.rate} average={average} />
                </td>
                <td className="tabular-nums">{pct(r.recentRate)}</td>
                <td className="tabular-nums">{r.excused}</td>
                <td className="tabular-nums">{r.absent}</td>
                <td className="tabular-nums">
                  {r.absentStreak > 0
                    ? nl
                      ? `${r.absentStreak}× weg`
                      : `${r.absentStreak}× away`
                    : r.presentStreak > 0
                      ? nl
                        ? `${r.presentStreak}× er`
                        : `${r.presentStreak}× there`
                      : "–"}
                </td>
                <td>
                  <span className="bo-att-timeline">
                    {r.cells.map((cell, i) => (
                      <StatusCell key={i} cell={cell} nl={nl} title={meetings[i]} />
                    ))}
                  </span>
                </td>
              </LinkedRow>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
