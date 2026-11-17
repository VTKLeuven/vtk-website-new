"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { InfoTip } from "@/components/ui/InfoTip";
import { RewardCoins } from "@/components/shift/RewardCoins";
import { formatVoucherCount, formatVouchers, wholeVouchers } from "@/lib/shift/rewards";
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
  const lang = nl ? "nl" : "en";
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

  // Wat je fysiek kan meegeven: enkel hele bonnetjes. Een half (van een broodje
  // aan de afhaalbalie) bestaat niet op papier en blijft openstaan.
  function amountFor(row: RewardRow): string {
    return amounts[row.userId] ?? String(wholeVouchers(row.outstandingBonnetjes));
  }

  async function awardBonnetjes(row: RewardRow) {
    const amount = Number(amountFor(row));
    const payable = wholeVouchers(row.outstandingBonnetjes);
    if (!Number.isInteger(amount) || amount <= 0 || amount > payable) {
      showToast({
        variant: "error",
        message: nl
          ? `Kies een geheel aantal tussen 1 en ${payable}.`
          : `Choose a whole number between 1 and ${payable}.`,
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
          palSessionIds: row.outstandingPalSessionIds,
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
          ? `${formatVoucherCount(amount)} toegekend, ${formatVouchers(remaining)} blijven openstaan.`
          : `${formatVoucherCount(amount, "en")} awarded, ${formatVouchers(remaining, "en")} remain outstanding.`,
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
        {/* De uitleg stond als blok boven de tabel; ze is voor wie het één keer
            wil weten, niet voor elke keer dat je bonnetjes toekent. */}
        <div className="flex items-center gap-1.5 pb-2 text-sm text-vtk-muted">
          {nl ? "Hoe lees je het saldo?" : "How to read the balance"}
          <InfoTip label={nl ? "Bonnetjessaldo lezen" : "Understanding the voucher balance"}>
            <p>
              {nl
                ? "Het getal is het aantal bonnetjes; ernaast staat over hoeveel shiften dat saldo verdeeld is. Een gedeeltelijk uitbetaalde shift kan daarom zowel bij openstaand als bij toegekend meetellen."
                : "The number is the voucher count; next to it is how many shifts make up that balance. A partially paid shift can therefore appear in both outstanding and awarded totals."}
            </p>
            <p>
              {nl
                ? "Je kent enkel hele bonnetjes toe: een broodje aan de afhaalbalie kost per half bonnetje, en zo'n half bestaat niet op papier. Het blijft openstaan tot de student het aan de balie gebruikt."
                : "You only award whole vouchers: a sandwich at the pickup counter costs half vouchers, and such a half does not exist on paper. It stays outstanding until the student uses it at the counter."}
            </p>
          </InfoTip>
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
              <th
                className="cursor-pointer px-4 py-2"
                onClick={() => toggleSort("outstanding")}
              >
                {nl ? "Openstaand" : "Outstanding"}
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
              const payable = wholeVouchers(row.outstandingBonnetjes);
              const validAmount =
                Number.isInteger(amount) && amount > 0 && amount <= payable;
              const halfLeft = row.outstandingBonnetjes - payable;

              return (
                <tr key={row.userId} className="border-t border-vtk-navy/10">
                  {/* Geen aparte kolom voor het adres: zoeken vindt het nog, en de tooltip toont het. */}
                  <td className="px-4 py-2 font-medium" title={row.email}>
                    {row.name}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <RewardCoins
                        amount={row.outstandingBonnetjes}
                        display={formatVouchers(row.outstandingBonnetjes, lang)}
                        label={formatVoucherCount(row.outstandingBonnetjes, lang)}
                        size="sm"
                      />
                      <span className="text-xs text-vtk-muted">
                        {sourceSummary(nl, "balance", row.outstandingShiftCount, row.outstandingPalCount)}
                      </span>
                    </span>
                    {halfLeft > 0 ? (
                      <span className="block text-xs text-vtk-muted">
                        {nl
                          ? `${formatVouchers(halfLeft)} enkel aan de afhaalbalie`
                          : `${formatVouchers(halfLeft, "en")} only at the pickup counter`}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <RewardCoins
                        amount={row.paidBonnetjes}
                        display={formatVouchers(row.paidBonnetjes, lang)}
                        label={formatVoucherCount(row.paidBonnetjes, lang)}
                        size="sm"
                      />
                      <span className="text-xs text-vtk-muted">
                        {sourceSummary(nl, "awarded", row.paidShiftCount, row.paidPalCount)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <label className="sr-only" htmlFor={`reward-${row.userId}`}>
                        {nl
                          ? `Aantal bonnetjes voor ${row.name}`
                          : `Voucher amount for ${row.name}`}
                      </label>
                      <Input
                        id={`reward-${row.userId}`}
                        type="number"
                        min={1}
                        max={payable}
                        step={1}
                        value={amountFor(row)}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [row.userId]: event.target.value,
                          }))
                        }
                        className="!w-20"
                        disabled={busyId !== null || payable === 0}
                      />
                      <span className="whitespace-nowrap text-xs text-vtk-muted">
                        {nl ? `van ${payable}` : `of ${payable}`}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId !== null || payable === 0 || !validAmount}
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
                  colSpan={4}
                  className="px-4 py-8 text-center text-vtk-muted"
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

/**
 * "saldo uit 3 shiften en 1 PAL+-sessie": waar een saldo vandaan komt. De
 * PAL+-sessies staan er enkel bij wanneer er zijn, zodat de lijst voor wie
 * enkel shiften doet niet verandert.
 */
function sourceSummary(nl: boolean, kind: "balance" | "awarded", shifts: number, pal: number): string {
  const shiftPart = nl ? `${shifts} ${shifts === 1 ? "shift" : "shiften"}` : `${shifts} ${shifts === 1 ? "shift" : "shifts"}`;
  const palPart = pal > 0 ? (nl ? ` en ${pal} PAL+-${pal === 1 ? "sessie" : "sessies"}` : ` and ${pal} PAL+ ${pal === 1 ? "session" : "sessions"}`) : "";
  if (kind === "balance") return nl ? `uit ${shiftPart}${palPart}` : `from ${shiftPart}${palPart}`;
  return nl ? `over ${shiftPart}${palPart}` : `across ${shiftPart}${palPart}`;
}
