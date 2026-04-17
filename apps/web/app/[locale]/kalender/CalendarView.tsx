"use client";

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";

const GROUP_COLORS: Record<string, string> = {
  ACTIVITEITEN: "#2563eb",
  BEDRIJVENRELATIES: "#0ea5e9",
  COMMUNICATIE: "#a855f7",
  CULTUUR: "#d946ef",
  CURSUSDIENST: "#f59e0b",
  DEVELOPMENT: "#22c55e",
  FAKBAR: "#e11d48",
  GROEP5: "#64748b",
  INTERNATIONAAL: "#14b8a6",
  IT: "#0f172a",
  LOGISTIEK: "#f97316",
  ONDERWIJS: "#8b5cf6",
  ONTHAAL: "#ec4899",
  SPORT: "#16a34a",
  THEOKOT: "#c2410c",
  ALGEMEEN: "#475569",
};

export function CalendarView({
  locale,
  groups,
  labels,
}: {
  locale: "nl" | "en";
  groups: Array<{ code: string; nameNl: string; nameEn: string }>;
  labels: { filters: string; selectAll: string; deselectAll: string };
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(groups.map((g) => g.code)));

  const eventsSource = useMemo(
    () =>
      async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
        const url = new URL("/api/calendar/events", window.location.origin);
        url.searchParams.set("start", info.startStr);
        url.searchParams.set("end", info.endStr);
        for (const code of selected) url.searchParams.append("group", code);
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        type E = EventInput & { extendedProps: { groupCode: string } };
        const data = (await res.json()) as E[];
        return data.map((e) => ({
          ...e,
          backgroundColor: GROUP_COLORS[e.extendedProps.groupCode] ?? "#1a1f4a",
          borderColor: GROUP_COLORS[e.extendedProps.groupCode] ?? "#1a1f4a",
        }));
      },
    [selected]
  );

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <aside>
        <h2 className="text-sm font-semibold uppercase text-zinc-500 mb-3">{labels.filters}</h2>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setSelected(new Set(groups.map((g) => g.code)))}
          >
            {labels.selectAll}
          </button>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setSelected(new Set())}
          >
            {labels.deselectAll}
          </button>
        </div>
        <ul className="space-y-1 max-h-[60vh] overflow-auto pr-1">
          {groups.map((g) => (
            <li key={g.code}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(g.code)}
                  onChange={() => toggle(g.code)}
                />
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: GROUP_COLORS[g.code] ?? "#64748b" }}
                  aria-hidden
                />
                <span>{locale === "nl" ? g.nameNl : g.nameEn}</span>
              </label>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={locale === "nl" ? "nl" : "en"}
          firstDay={1}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={
            locale === "nl"
              ? { today: "Vandaag", month: "Maand", week: "Week", day: "Dag" }
              : { today: "Today", month: "Month", week: "Week", day: "Day" }
          }
          initialView="dayGridMonth"
          events={eventsSource}
          height="auto"
          eventDisplay="block"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
        />
      </div>
    </div>
  );
}
