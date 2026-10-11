"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import { SkipPostForm, SkipToggle } from "./SkipControls";

export type ListResultMember = {
  userId: string;
  name: string;
  posts: string[];
  phone: string | null;
  count: number;
  slots: string[];
  /** Wordt op deze lijst overgeslagen; `count` is dan wat er niet meetelt. */
  skipped: boolean;
  skipReason: string | null;
};

/**
 * De stand op één lijst: per praesidiumlid hoeveel, tegen de richtlijn of
 * (zonder richtlijn) het gemiddelde. "Wie moet ik bellen" staat standaard
 * aan: wie eronder zit, met nummer, de kleinste eerst.
 */
export function ListResult({
  locale,
  listId,
  members: allMembers,
  expected,
  average,
  posts,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  members: ListResultMember[];
  expected: number | null;
  average: number;
  /** Posten van dit werkingsjaar, om in één keer over te slaan. */
  posts: { id: string; name: string; members: number }[];
  errorMessages: Record<string, string>;
}) {
  const members = allMembers.filter((m) => !m.skipped);
  const skippedMembers = allMembers.filter((m) => m.skipped);
  const nl = locale === "nl";
  const showToast = useToast();
  const target = expected ?? average;
  const [onlyBelow, setOnlyBelow] = useState(true);
  const [copied, setCopied] = useState(false);
  const below = members.filter((m) => m.count < target);
  const rows = [...(onlyBelow ? below : members)].sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "nl"));
  const withPhone = rows.filter((m) => m.phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        withPhone.map((m) => `${m.name}: ${m.phone} (${formatCount(m.count, locale)})`).join("\n"),
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
        <div className="flex flex-wrap items-center gap-2">
          <SkipPostForm locale={locale} listId={listId} posts={posts} errorMessages={errorMessages} />
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
        <table className="w-full min-w-[620px] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
            <tr>
              <th className="px-4 py-2.5">{nl ? "Naam" : "Name"}</th>
              <th className="px-2 py-2.5">{nl ? "Telefoon" : "Phone"}</th>
              <th className="px-2 py-2.5 text-right!">{nl ? "Shiften" : "Shifts"}</th>
              <th className="px-2 py-2.5 text-right!">{expected !== null ? (nl ? "t.o.v. richtlijn" : "vs target") : nl ? "t.o.v. gem." : "vs avg."}</th>
              <th className="px-2 py-2.5">{nl ? "Wanneer" : "When"}</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const diff = m.count - target;
              return (
                <tr key={m.userId} className="border-b border-vtk-blue/5 last:border-0 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-vtk-muted">{m.posts.join(", ")}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {m.phone ? (
                      <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="tabular-nums hover:underline">
                        {m.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-vtk-muted">{nl ? "geen nummer" : "no number"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatCount(m.count, locale)}</td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      diff <= -1 ? "text-vtk-danger" : diff >= 0 && expected !== null ? "text-[var(--ok-ink)]" : "text-vtk-muted"
                    }`}
                  >
                    {Math.abs(diff) < 0.05
                      ? "0"
                      : `${diff > 0 ? "+" : "−"}${formatCount(Math.abs(Math.round(diff * 10) / 10), locale)}`}
                  </td>
                  <td className="px-2 py-2 text-xs text-vtk-body">{m.slots.join(", ")}</td>
                  <td className="px-4 py-2 text-right">
                    <SkipToggle locale={locale} listId={listId} userId={m.userId} name={m.name} skipped={false} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-vtk-muted">
                  {nl ? "Iedereen haalt het." : "Everyone made it."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {skippedMembers.length > 0 && (
        <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <h3 className="px-4 pt-3 text-sm font-semibold">
            {nl ? "Overgeslagen op deze lijst" : "Skipped on this list"}{" "}
            <span className="font-normal text-vtk-muted">({skippedMembers.length})</span>
          </h3>
          <p className="px-4 pb-2 text-xs text-vtk-muted">
            {nl
              ? "Hun vakjes tellen niet, en ze staan niet in het gemiddelde, de richtlijn of de bellijst van deze lijst. In het overzicht worden ze vergeleken zonder deze lijst."
              : "Their cells do not count, and they are left out of this list's average, target and call list. In the overview they are compared without this list."}
          </p>
          <ul>
            {skippedMembers.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/5 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-vtk-muted">
                    {[m.skipReason, m.count > 0 ? (nl ? `${formatCount(m.count, locale)} shiften tellen niet` : `${formatCount(m.count, locale)} shifts not counted`) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <SkipToggle locale={locale} listId={listId} userId={m.userId} name={m.name} skipped />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
