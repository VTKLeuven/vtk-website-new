"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import type { RewardRow } from "./ShiftAdmin";
import { YearPicker } from "./YearPicker";

type SortKey = "name" | "unclaimed" | "claimed";

export function ShiftRewards({
  locale,
  rewards,
  year,
  years,
}: {
  locale: Locale;
  rewards: RewardRow[];
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "unclaimed", dir: "desc" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rewards.filter((r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") cmp = a.name.localeCompare(b.name);
      else if (sort.key === "claimed") cmp = a.claimedReward - b.claimedReward;
      else cmp = a.unclaimedReward - b.unclaimedReward;
      return cmp * dir;
    });
  }, [rewards, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  async function markPaid(row: RewardRow) {
    if (row.unclaimedShiftIds.length === 0) return;
    setBusyId(row.userId);
    const resp = await fetch("/api/shift/reward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: row.userId, shiftIds: row.unclaimedShiftIds }),
    });
    setBusyId(null);
    if (resp.ok) {
      showToast({ variant: "success", message: nl ? "Gemarkeerd als betaald." : "Marked as paid." });
      router.refresh();
    } else {
      showToast({ variant: "error", message: nl ? "Actie mislukt." : "Action failed." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <YearPicker locale={locale} year={year} years={years} />
        <div>
          <Label>{nl ? "Zoeken" : "Search"}</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={nl ? "Naam of e-mail..." : "Name or email..."}
            className="w-56"
          />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("name")}>
                {nl ? "Naam" : "Name"}
                {arrow("name")}
              </th>
              <th className="px-4 py-2">Email</th>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("unclaimed")}>
                {nl ? "Openstaand" : "Unclaimed"}
                {arrow("unclaimed")}
              </th>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("claimed")}>
                {nl ? "Betaald" : "Claimed"}
                {arrow("claimed")}
              </th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-zinc-500">{r.email}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {r.unclaimedReward} <span className="text-zinc-400">({r.unclaimedShifts})</span>
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {r.claimedReward} <span className="text-zinc-400">({r.claimedShifts})</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.userId || r.unclaimedShifts === 0}
                    onClick={() => markPaid(r)}
                  >
                    {nl ? "Markeer als betaald" : "Mark as paid"}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {nl ? "Geen vergoedingen voor dit jaar." : "No rewards for this year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
