"use client";

import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { formatCount } from "@/lib/praesidiumShifts/stats";

export type WeeklyMember = {
  userId: string;
  name: string;
  posts: string[];
  phone: string | null;
  past: number;
  upcoming: number;
  /** Volgende praesidiumshift: datum en taak. */
  next: { date: string; role: string | null } | null;
  /** Per taak hoeveel keer, voor de tooltip. */
  perTask: Record<string, number>;
};

type Filter = "all" | "none" | "below";

function day(iso: string, locale: "nl" | "en"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Per praesidiumlid de wekelijkse praesidiumshiften: al gedaan (de datum is
 * voorbij), nog ingepland, en wanneer de volgende is. "Nog niets ingepland"
 * is de lijst die de vice belt wanneer er gaten in het rooster zitten.
 */
export function WeeklyTable({ locale, members, average }: { locale: "nl" | "en"; members: WeeklyMember[]; average: number }) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => {
    const filtered = members.filter((m) => {
      const total = m.past + m.upcoming;
      if (filter === "none") return total === 0;
      if (filter === "below") return total < average;
      return true;
    });
    return filtered.sort((a, b) => a.past + a.upcoming - (b.past + b.upcoming) || a.name.localeCompare(b.name, "nl"));
  }, [members, filter, average]);
  const withPhone = rows.filter((m) => m.phone);
  const none = members.filter((m) => m.past + m.upcoming === 0).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(withPhone.map((m) => `${m.name}: ${m.phone}`).join("\n"));
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

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: nl ? "Iedereen" : "Everyone" },
    { value: "none", label: nl ? `Nog niets ingepland (${none})` : `Nothing planned (${none})` },
    { value: "below", label: nl ? "Onder gemiddeld" : "Below average" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5" role="group" aria-label={nl ? "Toon" : "Show"}>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.value ? "bg-vtk-ink text-white" : "text-vtk-ink hover:bg-vtk-blue-soft/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <IconButton
          label={
            withPhone.length
              ? nl
                ? `Kopieer de nummers van wie je nu ziet (${withPhone.length})`
                : `Copy the numbers of who you see (${withPhone.length})`
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
      <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
            <tr>
              <th className="px-4 py-2.5">{nl ? "Naam" : "Name"}</th>
              <th className="px-2 py-2.5">{nl ? "Telefoon" : "Phone"}</th>
              <th className="px-2 py-2.5 text-right!">{nl ? "Gedaan" : "Done"}</th>
              <th className="px-2 py-2.5 text-right!">{nl ? "Ingepland" : "Planned"}</th>
              <th className="px-2 py-2.5 text-right!">{nl ? "Totaal" : "Total"}</th>
              <th className="px-4 py-2.5">{nl ? "Volgende" : "Next"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const total = m.past + m.upcoming;
              const tasks = Object.entries(m.perTask)
                .map(([task, n]) => `${task}: ${n}`)
                .join("\n");
              return (
                <tr key={m.userId} className="border-b border-vtk-blue/5 last:border-0">
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
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(m.past, locale)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(m.upcoming, locale)}</td>
                  <td
                    className={`px-2 py-2 text-right font-semibold tabular-nums ${total === 0 ? "text-vtk-danger" : ""}`}
                    title={tasks || undefined}
                  >
                    {formatCount(total, locale)}
                  </td>
                  <td className="px-4 py-2 text-xs text-vtk-body">
                    {m.next ? `${day(m.next.date, locale)} · ${m.next.role ?? ""}` : <span className="text-vtk-muted">{nl ? "niets meer ingepland" : "nothing planned"}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-vtk-muted">
                  {nl ? "Niemand past bij deze filter." : "Nobody matches this filter."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-vtk-blue/10 text-xs text-vtk-muted">
            <tr>
              <th scope="row" className="px-4 py-2 text-left font-semibold">
                {nl ? "Gemiddelde" : "Average"}
              </th>
              <td />
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(members.reduce((s, m) => s + m.past, 0) / Math.max(1, members.length), locale)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(members.reduce((s, m) => s + m.upcoming, 0) / Math.max(1, members.length), locale)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCount(average, locale)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
