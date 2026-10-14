"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import Link from "@/components/ui/Link";
import { formatCount, formatWeight } from "@/lib/praesidiumShifts/stats";

export type ListResultMember = {
  userId: string;
  name: string;
  posts: string[];
  phone: string | null;
  /** Shiften zoals ze op de lijst staan, nog zonder `weight`. */
  count: number;
  slots: string[];
  /**
   * Hoeveel deze lijst voor dit lid weegt: 1 volledig, 0.5 voor de helft, 0
   * overgeslagen (`count` is dan wat er niet meetelt).
   */
  weight: number;
  skipReason: string | null;
};

/**
 * De stand op één lijst: per praesidiumlid hoeveel, tegen de richtlijn of
 * (zonder richtlijn) het gemiddelde. "Wie moet ik bellen" staat standaard
 * aan: wie eronder zit, met nummer, wie het verst eronder zit eerst. Wie voor
 * een deel meetelt, staat er met dat deel van zijn shiften en van het doel.
 */
export function ListResult({
  locale,
  members: allMembers,
  expected,
  average,
  skipHref,
}: {
  locale: "nl" | "en";
  members: ListResultMember[];
  expected: number | null;
  average: number;
  /** Het tabblad "Overslaan" van deze lijst. */
  skipHref: string;
}) {
  const members = allMembers.filter((m) => m.weight > 0);
  const skippedMembers = allMembers.filter((m) => m.weight === 0);
  const partialCount = members.filter((m) => m.weight < 1).length;
  const nl = locale === "nl";
  const showToast = useToast();
  const target = expected ?? average;
  const [onlyBelow, setOnlyBelow] = useState(true);
  const [copied, setCopied] = useState(false);
  // Wat telt, en het verschil: allebei met het gewicht vermenigvuldigd.
  const counts = (m: ListResultMember) => m.count * m.weight;
  const diffOf = (m: ListResultMember) => (m.count - target) * m.weight;
  const below = members.filter((m) => m.count < target);
  const rows = [...(onlyBelow ? below : members)].sort((a, b) => diffOf(a) - diffOf(b) || a.name.localeCompare(b.name, "nl"));
  const withPhone = rows.filter((m) => m.phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        withPhone.map((m) => `${m.name}: ${m.phone} (${formatCount(counts(m), locale)})`).join("\n"),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({ message: nl ? `${withPhone.length} nummers gekopieerd.` : `${withPhone.length} numbers copied.`, variant: "success" });
    } catch {
      showToast({
        message: nl ? "Kopiëren lukte niet; je browser liet het klembord niet toe." : "Copy failed; your browser blocked the clipboard.",
        variant: "error",
        duration: 0,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyBelow} onChange={(e) => setOnlyBelow(e.currentTarget.checked)} className="size-4 accent-vtk-ink" />
          {expected !== null
            ? nl
              ? `Enkel wie de richtlijn van ${formatCount(expected, locale)} niet haalt (${below.length})`
              : `Only who does not reach the target of ${formatCount(expected, locale)} (${below.length})`
            : nl
              ? `Enkel wie onder het gemiddelde van ${formatCount(average, locale)} zit (${below.length})`
              : `Only who is below the average of ${formatCount(average, locale)} (${below.length})`}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {(skippedMembers.length > 0 || partialCount > 0) && (
            <Link href={skipHref} className="text-xs text-vtk-muted underline decoration-vtk-navy/25 underline-offset-4 hover:text-vtk-ink">
              {[
                skippedMembers.length > 0
                  ? nl
                    ? `${skippedMembers.length} overgeslagen${skippedMembers[0]?.skipReason ? ` (${[...new Set(skippedMembers.map((m) => m.skipReason).filter(Boolean))].join(", ")})` : ""}`
                    : `${skippedMembers.length} skipped`
                  : null,
                partialCount > 0 ? (nl ? `${partialCount} voor een deel` : `${partialCount} partly`) : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </Link>
          )}
        <IconButton
          label={
            withPhone.length
              ? nl
                ? `Kopieer de nummers van wie hieronder staat (${withPhone.length})`
                : `Copy the numbers of who is listed below (${withPhone.length})`
              : nl
                ? "Niemand hieronder heeft een nummer"
                : "Nobody below has a number"
          }
          onClick={copy}
          disabled={withPhone.length === 0}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
        </div>
      </div>
      <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        <table className="vtk-psl-table w-full min-w-[640px]">
          <thead>
            <tr>
              <th>{nl ? "Naam" : "Name"}</th>
              <th>{nl ? "Telefoon" : "Phone"}</th>
              <th className="vtk-psl-num">{nl ? "Shiften" : "Shifts"}</th>
              <th className="vtk-psl-num">{expected !== null ? (nl ? "t.o.v. richtlijn" : "vs target") : nl ? "t.o.v. gem." : "vs avg."}</th>
              <th>{nl ? "Wanneer" : "When"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const diff = Math.round(diffOf(m) * 10) / 10;
              const tone = diff <= -1 ? "down" : diff >= 1 || (expected !== null && diff >= 0) ? "up" : "even";
              return (
                <tr key={m.userId}>
                  <td>
                    <span className="font-semibold text-vtk-ink">{m.name}</span>{" "}
                    <span className="text-xs text-vtk-muted">{m.posts.join(", ")}</span>
                    {m.weight < 1 && (
                      <span className="ml-2 rounded-full bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-semibold text-vtk-body">
                        {nl ? `telt voor ${formatWeight(m.weight, locale)}` : `counts for ${formatWeight(m.weight, locale)}`}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-vtk-muted tabular-nums">
                    {m.phone ? (
                      <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="hover:underline">
                        {m.phone}
                      </a>
                    ) : (
                      <span className="text-xs">{nl ? "geen nummer" : "no number"}</span>
                    )}
                  </td>
                  <td
                    className="text-right font-semibold tabular-nums"
                    title={
                      m.weight < 1
                        ? nl
                          ? `${formatCount(m.count, locale)} op de lijst, telt voor ${formatWeight(m.weight, locale)}`
                          : `${formatCount(m.count, locale)} on the list, counts for ${formatWeight(m.weight, locale)}`
                        : undefined
                    }
                  >
                    {formatCount(counts(m), locale)}
                  </td>
                  <td className="text-right">
                    <span className="vtk-psl-diff" data-tone={tone}>
                      {Math.abs(diff) < 0.05 ? "0" : `${diff > 0 ? "+" : "\u2212"}${formatCount(Math.abs(diff), locale)}`}
                    </span>
                  </td>
                  <td className="max-w-[16rem] text-xs text-vtk-body">
                    <span className="line-clamp-2" title={m.slots.join(", ")}>
                      {m.slots.join(", ")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-vtk-muted">
                  {nl ? "Iedereen haalt het." : "Everyone made it."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
