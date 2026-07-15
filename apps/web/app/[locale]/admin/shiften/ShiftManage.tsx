"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { Locale } from "@vtk/i18n";
import { Button, Card, ConfirmDialog, Input, Label, Select } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { ShiftEditModal } from "./ShiftEditModal";
import type { AdminShift } from "./ShiftAdmin";

type SortKey = "name" | "start" | "post" | "spots" | "reward";

export function ShiftManage({
  locale,
  shifts,
  postOptions,
  from,
  to,
}: {
  locale: Locale;
  shifts: AdminShift[];
  postOptions: string[];
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
        <div className="ml-auto">
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
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {format(s.startTime, "dd/MM/yyyy HH:mm")}–{format(s.endTime, "HH:mm")}
                </td>
                <td className="px-4 py-2 text-zinc-500">{s.post ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {s.participants.length}/{s.maxParticipants}
                </td>
                <td className="px-4 py-2 text-zinc-500">{s.reward}</td>
                <td className="px-4 py-2 text-right">
                  <RowActions>
                    <IconButton
                      label={nl ? "Bewerken" : "Edit"}
                      srLabel={`${nl ? "Bewerken" : "Edit"}: ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      label={nl ? "Verwijderen" : "Delete"}
                      srLabel={`${nl ? "Verwijderen" : "Delete"}: ${s.name}`}
                      tone="danger"
                      disabled={busyId === s.id}
                      onClick={() => setDeleting(s)}
                    >
                      <TrashIcon />
                    </IconButton>
                  </RowActions>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
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
