"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Mail, Search, Check, Copy, UserCheck, Users, UserX } from "lucide-react";
import { Card } from "@vtk/ui";
import type { AdminAttendeeRow } from "@/lib/calendar/interest";

export function EventInterestsPanel({
  eventId,
  rows,
  locale,
  base,
}: {
  eventId: string;
  rows: AdminAttendeeRow[];
  locale: "nl" | "en";
  base: string;
}) {
  const nl = locale === "nl";
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const memberCount = useMemo(() => rows.filter((r) => r.kind === "member").length, [rows]);
  const guestCount = useMemo(() => rows.filter((r) => r.kind === "guest").length, [rows]);

  const memberEmails = useMemo(() => {
    const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
    return Array.from(new Set(emails));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchEmail = r.email ? r.email.toLowerCase().includes(q) : false;
      const matchRNumber = r.rNumber ? r.rNumber.toLowerCase().includes(q) : false;
      const matchDisplay = r.displayName ? r.displayName.toLowerCase().includes(q) : false;
      return matchName || matchEmail || matchRNumber || matchDisplay;
    });
  }, [rows, search]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
        timeZone: "Europe/Brussels",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [nl],
  );

  async function copyAllEmails() {
    if (memberEmails.length === 0) return;
    try {
      await navigator.clipboard.writeText(memberEmails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <Card id="geinteresseerden" className="space-y-4 p-5 scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{nl ? "Geïnteresseerden" : "Interested attendees"}</h2>
            <span className="rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-semibold text-vtk-blue-muted">
              {rows.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-vtk-blue-muted">
            {nl
              ? "Leden en bezoekers die aangaven naar dit evenement te komen."
              : "Members and visitors who indicated they are coming to this event."}
          </p>
        </div>

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {memberEmails.length > 0 && (
              <button
                type="button"
                onClick={copyAllEmails}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-vtk-blue/20 bg-white px-3.5 text-xs font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft active:translate-y-px"
                title={
                  nl
                    ? `Kopieer alle ${memberEmails.length} e-mailadressen`
                    : `Copy all ${memberEmails.length} email addresses`
                }
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied
                  ? nl
                    ? "Gekopieerd!"
                    : "Copied!"
                  : nl
                    ? "Kopieer e-mails"
                    : "Copy emails"}
              </button>
            )}
            <a
              href={`/api/admin/calendar/events/${eventId}/interests/export${locale === "en" ? "?lang=en" : ""}`}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-vtk-blue/20 bg-white px-3.5 text-xs font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft active:translate-y-px"
            >
              <Download size={14} />
              {nl ? "CSV downloaden" : "Download CSV"}
            </a>
          </div>
        ) : null}
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-vtk-blue/15 bg-vtk-blue-soft/50 px-2.5 py-1 text-vtk-ink">
              <Users size={13} className="text-vtk-blue-muted" />
              <span>
                {nl ? "Totaal" : "Total"}: <b>{rows.length}</b>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-vtk-blue/15 bg-vtk-blue-soft/50 px-2.5 py-1 text-vtk-ink">
              <UserCheck size={13} className="text-vtk-blue-muted" />
              <span>
                {nl ? "Accounts" : "Accounts"}: <b>{memberCount}</b>
              </span>
            </span>
            {guestCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                <UserX size={13} className="text-amber-700" />
                <span>
                  {nl ? "Gasten zonder account" : "Guests without account"}: <b>{guestCount}</b>
                </span>
              </span>
            )}
          </div>

          {rows.length > 4 && (
            <div className="relative w-full max-w-xs">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-vtk-blue-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  nl ? "Zoek op naam, e-mail of r-nummer…" : "Search name, email, student number…"
                }
                className="h-9 w-full rounded-full border border-vtk-blue/20 bg-white pl-8 pr-3 text-xs text-vtk-ink placeholder:text-zinc-400 focus:border-vtk-blue focus:outline-none focus:ring-1 focus:ring-vtk-blue"
              />
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
          {nl
            ? "Nog niemand heeft interesse aangeduid voor dit evenement."
            : "No one has marked interest for this event yet."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
          {nl ? "Geen resultaten gevonden voor je zoekopdracht." : "No results found for your search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-vtk-blue-soft/70 text-zinc-600">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">{nl ? "Persoon" : "Person"}</th>
                <th className="px-3.5 py-2.5 font-semibold">{nl ? "Contact & KU Leuven" : "Contact & student ID"}</th>
                <th className="px-3.5 py-2.5 font-semibold">{nl ? "Alumni-gegevens" : "Alumni info"}</th>
                <th className="px-3.5 py-2.5 font-semibold">{nl ? "Publieke zichtbaarheid" : "Public visibility"}</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">{nl ? "Aangeduid op" : "Marked at"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filtered.map((row) => {
                const isGuest = row.kind === "guest";
                const visibleLabels: string[] = [];
                if (row.showName) visibleLabels.push(nl ? "naam" : "name");
                if (row.showGraduationYear) visibleLabels.push(nl ? "afstudeerjaar" : "year");
                if (row.showWasInVtk) visibleLabels.push(nl ? "VTK-verleden" : "in VTK");

                return (
                  <tr key={row.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="px-3.5 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.userId ? (
                          <Link
                            href={`${base}/admin/gebruikers/${row.userId}`}
                            className="font-medium text-vtk-ink hover:text-vtk-blue underline underline-offset-2"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-800">{row.name}</span>
                        )}
                        <RoleBadge row={row} locale={locale} />
                      </div>
                      {row.displayName && row.displayName !== row.name && (
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {nl ? "Weergavenaam:" : "Display name:"}{" "}
                          <span className="italic">{row.displayName}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top text-zinc-600">
                      {row.email ? (
                        <div className="flex items-center gap-1">
                          <Mail size={12} className="text-zinc-400 shrink-0" />
                          <a
                            href={`mailto:${row.email}`}
                            className="hover:text-vtk-blue hover:underline"
                          >
                            {row.email}
                          </a>
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic">
                          {nl ? "Geen account / e-mail" : "No account / email"}
                        </span>
                      )}
                      {row.rNumber && (
                        <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                          {row.rNumber}
                        </div>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top text-zinc-600">
                      {row.effectiveGraduationYear || row.effectiveWasInVtk || row.isAlumni ? (
                        <div className="space-y-0.5">
                          {row.effectiveGraduationYear && (
                            <div>
                              <span className="text-zinc-400">{nl ? "Lichting:" : "Year:"}</span>{" "}
                              <span className="font-medium text-zinc-800">{row.effectiveGraduationYear}</span>
                            </div>
                          )}
                          {row.effectiveWasInVtk && (
                            <span className="inline-block rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                              {nl ? "VTK Praesidium" : "VTK Praesidium"}
                            </span>
                          )}
                          {row.kind === "member" && row.alumniMailOptIn && (
                            <div className="text-[10px] text-emerald-700">
                              {nl ? "✓ Ingeschreven op alumni-mails" : "✓ Subscribed to alumni mails"}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top">
                      {visibleLabels.length > 0 ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                            {nl ? "Zichtbaar op pagina" : "Visible on page"}
                          </span>
                          <div className="text-[11px] text-zinc-500">
                            {visibleLabels.join(", ")}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                          {nl ? "Privé / anoniem" : "Private / anonymous"}
                        </span>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 align-top text-right tabular-nums text-zinc-500">
                      {dateFmt.format(new Date(row.createdAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RoleBadge({ row, locale }: { row: AdminAttendeeRow; locale: "nl" | "en" }) {
  const nl = locale === "nl";
  if (row.kind === "guest") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
        {nl ? "Gast" : "Guest"}
      </span>
    );
  }
  if (row.isAlumni) {
    return (
      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800">
        {nl ? "Alumnus" : "Alumnus"}
      </span>
    );
  }
  if (row.firwStudent) {
    return (
      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
        {nl ? "Student (FIRW)" : "Student (FIRW)"}
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
      {nl ? "Account" : "Account"}
    </span>
  );
}
