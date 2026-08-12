"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import type { RewardRow } from "./ShiftAdmin";
import { YearPicker } from "./YearPicker";

type SortKey = "name" | "outstanding" | "paid";
type AwardResponse = {
  awardedBonnetjes?: number;
  remainingBonnetjes?: number;
  error?: string;
};

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
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: "asc" | "desc";
  }>({ key: "outstanding", dir: "desc" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rewards.filter(
      (reward) =>
        !query ||
        `${reward.name} ${reward.email}`.toLowerCase().includes(query),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sort.key === "name") comparison = a.name.localeCompare(b.name);
      else if (sort.key === "paid") {
        comparison = a.paidBonnetjes - b.paidBonnetjes;
      } else {
        comparison = a.outstandingBonnetjes - b.outstandingBonnetjes;
      }
      return comparison * direction;
    });
  }, [rewards, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  function amountFor(row: RewardRow): string {
    return amounts[row.userId] ?? String(row.outstandingBonnetjes);
  }

  async function awardBonnetjes(row: RewardRow) {
    const amount = Number(amountFor(row));
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > row.outstandingBonnetjes
    ) {
      showToast({
        variant: "error",
        message: nl
          ? `Kies een geheel aantal tussen 1 en ${row.outstandingBonnetjes}.`
          : `Choose a whole number between 1 and ${row.outstandingBonnetjes}.`,
      });
      return;
    }

    setBusyId(row.userId);
    try {
      const response = await fetch("/api/shift/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.userId,
          shiftIds: row.outstandingShiftIds,
          amount,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as AwardResponse;

      if (!response.ok) {
        showToast({
          variant: "error",
          message: body.error
            ? body.error
            : nl
              ? "Toekenning mislukt. Vernieuw de pagina en probeer opnieuw."
              : "Award failed. Refresh the page and try again.",
        });
        return;
      }

      setAmounts((current) => {
        const next = { ...current };
        delete next[row.userId];
        return next;
      });
      const remaining = body.remainingBonnetjes ?? row.outstandingBonnetjes - amount;
      showToast({
        variant: "success",
        message: nl
          ? `${amount} bonnetjes toegekend. ${remaining} blijven openstaan.`
          : `${amount} vouchers awarded. ${remaining} remain outstanding.`,
      });
      router.refresh();
    } catch {
      showToast({
        variant: "error",
        message: nl
          ? "De toekenning kon niet worden verstuurd. Probeer opnieuw."
          : "The award could not be submitted. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/35 p-4 text-sm text-[#34405e]">
        <h2 className="font-semibold text-vtk-ink">
          {nl ? "Bonnetjessaldo lezen" : "Understanding the voucher balance"}
        </h2>
        <p className="mt-1 leading-6">
          {nl
            ? "Het grote getal is het aantal bonnetjes. De kleinere regel toont over hoeveel shiften dat saldo verdeeld is. Een gedeeltelijk uitbetaalde shift kan daarom zowel bij openstaand als bij toegekend meetellen."
            : "The large number is the voucher count. The smaller line shows how many shifts make up that balance. A partially paid shift can therefore appear in both outstanding and awarded totals."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <YearPicker locale={locale} year={year} years={years} />
        <div>
          <Label>{nl ? "Zoeken" : "Search"}</Label>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={nl ? "Naam of e-mail..." : "Name or email..."}
            className="w-56"
          />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th
                className="cursor-pointer px-4 py-2"
                onClick={() => toggleSort("name")}
              >
                {nl ? "Naam" : "Name"}
                {arrow("name")}
              </th>
              <th className="px-4 py-2">Email</th>
              <th
                className="cursor-pointer px-4 py-2"
                onClick={() => toggleSort("outstanding")}
              >
                {nl ? "Openstaande bonnetjes" : "Outstanding vouchers"}
                {arrow("outstanding")}
              </th>
              <th
                className="cursor-pointer px-4 py-2"
                onClick={() => toggleSort("paid")}
              >
                {nl ? "Toegekend" : "Awarded"}
                {arrow("paid")}
              </th>
              <th className="px-4 py-2 text-right">
                {nl ? "Nu toekennen" : "Award now"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const amount = Number(amountFor(row));
              const validAmount =
                Number.isInteger(amount) &&
                amount > 0 &&
                amount <= row.outstandingBonnetjes;

              return (
                <tr key={row.userId} className="border-t border-zinc-200">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{row.email}</td>
                  <td className="px-4 py-3">
                    <strong className="block text-base text-vtk-ink">
                      {row.outstandingBonnetjes}{" "}
                      {nl ? "bonnetjes" : "vouchers"}
                    </strong>
                    <span className="text-xs text-zinc-500">
                      {nl
                        ? `saldo uit ${row.outstandingShiftCount} shiften`
                        : `balance from ${row.outstandingShiftCount} shifts`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <strong className="block text-base text-vtk-ink">
                      {row.paidBonnetjes} {nl ? "bonnetjes" : "vouchers"}
                    </strong>
                    <span className="text-xs text-zinc-500">
                      {nl
                        ? `toegekend over ${row.paidShiftCount} shiften`
                        : `awarded across ${row.paidShiftCount} shifts`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[250px] items-center justify-end gap-2">
                      <label className="sr-only" htmlFor={`reward-${row.userId}`}>
                        {nl
                          ? `Aantal bonnetjes voor ${row.name}`
                          : `Voucher amount for ${row.name}`}
                      </label>
                      <Input
                        id={`reward-${row.userId}`}
                        type="number"
                        min={1}
                        max={row.outstandingBonnetjes}
                        step={1}
                        value={amountFor(row)}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [row.userId]: event.target.value,
                          }))
                        }
                        className="w-20"
                        disabled={
                          busyId !== null ||
                          row.outstandingBonnetjes === 0
                        }
                      />
                      <span className="whitespace-nowrap text-xs text-zinc-500">
                        {nl ? `van ${row.outstandingBonnetjes}` : `of ${row.outstandingBonnetjes}`}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          busyId !== null ||
                          row.outstandingBonnetjes === 0 ||
                          !validAmount
                        }
                        onClick={() => awardBonnetjes(row)}
                      >
                        {busyId === row.userId
                          ? nl
                            ? "Bezig..."
                            : "Working..."
                          : nl
                            ? "Toekennen"
                            : "Award"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {nl
                    ? "Geen bonnetjes voor dit jaar."
                    : "No vouchers for this year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
