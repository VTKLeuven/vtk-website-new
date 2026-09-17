"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { Locale } from "@vtk/i18n";
import { Button, Card, ConfirmDialog, Input, Label, Select } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { ShiftEditModal } from "./ShiftEditModal";
import type { AdminShift } from "./ShiftAdmin";

type SortKey = "name" | "start" | "post" | "spots" | "reward";

export function ShiftManage({
  locale,
  shifts,
  postOptions,
  userPostCodes = [],
  isSuperAdmin = false,
  from,
  to,
}: {
  locale: Locale;
  shifts: AdminShift[];
  postOptions: string[];
  userPostCodes?: string[];
  isSuperAdmin?: boolean;
  from: string;
  to: string;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showToast = useToast();

  // Het datumbereik zit in de URL zodat de server precies die shiften ophaalt.
  function setRange(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const [postFilter, setPostFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "start", dir: "asc" });
  const [editing, setEditing] = useState<AdminShift | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminShift | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = shifts.filter((s) => {
      if (postFilter !== "ALL" && (s.post ?? "") !== postFilter) return false;
      if (q && !`${s.name} ${s.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "post":
          cmp = (a.post ?? "").localeCompare(b.post ?? "");
          break;
        case "spots":
          cmp = a.participants.length - b.participants.length;
          break;
        case "reward":
          cmp = a.reward - b.reward;
          break;
        default:
          cmp = a.startTime.getTime() - b.startTime.getTime();
      }
      return cmp * dir;
    });
  }, [shifts, postFilter, search, sort]);

  /**
   * Mag deze gebruiker deze shift beheren? Een shift van een andere post open je
   * niet: het venster is een bewerkvenster, niet een leesvenster.
   */
  const canManage = (s: AdminShift) =>
    isSuperAdmin ||
    (s.post !== null && userPostCodes.some((code) => code.toLowerCase() === s.post?.toLowerCase()));

  const toggleSort = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  async function deleteShift(id: string) {
    setBusyId(id);
    const resp = await fetch("/api/shift?id=" + id, { method: "DELETE" });
    setBusyId(null);
    setDeleting(null);
    if (resp.ok) {
      showToast({ variant: "success", message: nl ? "Shift verwijderd." : "Shift deleted." });
      // Het venster van de zonet verwijderde shift moet mee dicht; anders blijft
      // een formulier openstaan dat naar niets meer verwijst.
      setEditing(null);
      router.refresh();
    } else {
      showToast({ variant: "error", message: nl ? "Verwijderen mislukt." : "Delete failed.", duration: 0 });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>{nl ? "Van" : "From"}</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setRange("from", e.target.value)} />
        </div>
        <div>
          <Label>{nl ? "Tot" : "To"}</Label>
          <Input type="date" value={to} min={from} onChange={(e) => setRange("to", e.target.value)} />
        </div>
        <div>
          <Label>Post</Label>
          <Select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} className="w-44">
            <option value="ALL">{nl ? "Alle posten" : "All groups"}</option>
            {postOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{nl ? "Zoeken" : "Search"}</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={nl ? "Naam of locatie..." : "Name or location..."}
            className="w-56"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Een terugkerend evenement (cantus, TD, fakbaravond) heeft telkens
              dezelfde reeks shiften; die zet je sneller neer via een sjabloon
              dan één voor één in het formulier hiernaast. */}
          <Link
            href={`${nl ? "" : "/en"}/admin/shiften/sjablonen`}
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-vtk-blue/15 px-4 text-sm font-medium text-vtk-ink transition-colors hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Uit sjabloon" : "From template"}
          </Link>
          <Button onClick={() => setCreating(true)}>{nl ? "Nieuwe shift" : "New shift"}</Button>
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
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("start")}>
                {nl ? "Datum" : "Date"}
                {arrow("start")}
              </th>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("post")}>
                Post{arrow("post")}
              </th>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("spots")}>
                {nl ? "Plaatsen" : "Spots"}
                {arrow("spots")}
              </th>
              <th className="cursor-pointer px-4 py-2" onClick={() => toggleSort("reward")}>
                {nl ? "Beloning" : "Reward"}
                {arrow("reward")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              // De hele rij opent het venster; de titel blijft een echte knop,
              // want een toetsenbord en een screenreader hebben iets nodig om op
              // te landen. Zie CLAUDE.md > Admin.
              <tr
                key={s.id}
                className={`border-t border-zinc-200 ${
                  canManage(s) ? "cursor-pointer hover:bg-vtk-blue-soft/60" : ""
                }`}
                onClick={canManage(s) ? () => setEditing(s) : undefined}
              >
                <td className="px-4 py-2 font-medium">
                  {canManage(s) ? (
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(s);
                      }}
                    >
                      {s.name}
                    </button>
                  ) : (
                    s.name
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {format(s.startTime, "dd/MM/yyyy HH:mm")}–{format(s.endTime, "HH:mm")}
                </td>
                <td className="px-4 py-2 text-zinc-500">{s.post ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {s.participants.length}/{s.maxParticipants}
                </td>
                <td className="px-4 py-2 text-zinc-500">{s.reward}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {nl ? "Geen shiften." : "No shifts."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {(creating || editing) && (
        <ShiftEditModal
          locale={locale}
          shift={editing}
          postOptions={postOptions}
          userPostCodes={userPostCodes}
          isSuperAdmin={isSuperAdmin}
          onDelete={editing ? () => setDeleting(editing) : undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={nl ? "Shift verwijderen?" : "Delete shift?"}
        description={
          nl
            ? `"${deleting?.name}" wordt permanent verwijderd. ${deleting?.participants.length ?? 0} ingeschreven lid/leden verliezen hun inschrijving. Dit kan niet ongedaan gemaakt worden.`
            : `"${deleting?.name}" will be permanently deleted. ${deleting?.participants.length ?? 0} registered member(s) will lose their registration. This cannot be undone.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={busyId !== null}
        onConfirm={() => deleting && deleteShift(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
