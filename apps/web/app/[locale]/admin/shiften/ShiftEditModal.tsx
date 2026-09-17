"use client";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Button, Card, FormError, Input, Label, Select, Textarea } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import type { AdminParticipant, AdminShift } from "./ShiftAdmin";

type SearchUser = {
  id: string;
  name: string;
  email: string;
  rNumber: string | null;
  phone?: string | null;
};

const toLocalInput = (date: Date) => utcToLocalDateTime(date);

export function ShiftEditModal({
  locale,
  shift,
  postOptions,
  userPostCodes = [],
  isSuperAdmin = false,
  onClose,
  onSaved,
  onDelete,
}: {
  locale: Locale;
  shift: AdminShift | null;
  postOptions: string[];
  userPostCodes?: string[];
  isSuperAdmin?: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Opent de bevestiging om deze shift te verwijderen; enkel bij bewerken. */
  onDelete?: () => void;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const isEdit = shift !== null;

  const selectablePosts = useMemo(() => {
    if (isSuperAdmin) return postOptions;
    return postOptions.filter((p) =>
      userPostCodes.some((code) => code.toLowerCase() === p.toLowerCase()),
    );
  }, [isSuperAdmin, postOptions, userPostCodes]);

  const now = new Date();
  const [name, setName] = useState(shift?.name ?? "");
  const [start, setStart] = useState(toLocalInput(shift?.startTime ?? now));
  const [end, setEnd] = useState(
    toLocalInput(shift?.endTime ?? new Date(now.getTime() + 2 * 3_600_000)),
  );
  const [location, setLocation] = useState(shift?.location ?? "");
  const [description, setDescription] = useState(shift?.description ?? "");
  const [maxParticipants, setMaxParticipants] = useState(String(shift?.maxParticipants ?? 1));
  const [reward, setReward] = useState(String(shift?.reward ?? 0));
  const [post, setPost] = useState(
    shift?.post ?? (isSuperAdmin ? "" : (selectablePosts[0] ?? "")),
  );
  const [openToInternationals, setOpenToInternationals] = useState(
    shift?.openToInternationals ?? false,
  );
  const [instructions, setInstructions] = useState(shift?.instructions ?? "");
  const [participants, setParticipants] = useState<AdminParticipant[]>(shift?.participants ?? []);
  const [addSearch, setAddSearch] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const originalIds = useMemo(
    () => new Set((shift?.participants ?? []).map((p) => p.userId)),
    [shift],
  );

  // Server-side zoeken (naam/e-mail/r-nummer), gedebounced. Schaalt naar veel users.
  useEffect(() => {
    const q = addSearch.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (resp.ok) setResults((await resp.json()) as SearchUser[]);
      } catch {
        /* aborted / netwerk — negeren */
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addSearch]);

  // Al toegevoegde deelnemers niet opnieuw tonen.
  const addable = useMemo(() => {
    const current = new Set(participants.map((p) => p.userId));
    return results.filter((u) => !current.has(u.id));
  }, [results, participants]);

  function addParticipant(u: SearchUser) {
    setParticipants((cur) => [
      ...cur,
      {
        userId: u.id,
        name: u.name,
        email: u.email,
        rNumber: u.rNumber,
        phone: u.phone ?? null,
        payedOut: false,
      },
    ]);
    setAddSearch("");
    setResults([]);
  }
  function removeParticipant(userId: string) {
    setParticipants((cur) => cur.filter((p) => p.userId !== userId));
  }

  async function save() {
    setError(null);
    setBusy(true);

    const fields = {
      name,
      startTime: start,
      endTime: end,
      location,
      description,
      maxParticipants: Number(maxParticipants),
      reward: Number(reward),
      post: post === "" ? null : post,
      openToInternationals,
      instructions: instructions.trim() === "" ? null : instructions,
    };

    try {
      let resp: Response;
      if (!shift) {
        resp = await fetch("/api/shift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
      } else {
        const current = new Set(participants.map((p) => p.userId));
        const addParticipants = [...current].filter((id) => !originalIds.has(id));
        const removeParticipants = [...originalIds].filter((id) => !current.has(id));
        resp = await fetch("/api/shift?id=" + shift.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, addParticipants, removeParticipants }),
        });
      }

      setBusy(false);
      if (resp.ok) {
        showToast({ variant: "success", message: nl ? "Shift opgeslagen." : "Shift saved." });
        onSaved();
      } else {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string; details?: string[] }
          | null;
        setError(
          data?.details?.length
            ? data.details.join("; ")
            : (data?.error ?? (nl ? "Opslaan mislukt." : "Save failed.")),
        );
      }
    } catch {
      setBusy(false);
      setError(nl ? "Opslaan mislukt." : "Save failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card className="my-8 w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? (nl ? "Shift bewerken" : "Edit shift") : nl ? "Nieuwe shift" : "New shift"}
          </h2>
          <button className="text-zinc-400 hover:text-zinc-700" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{nl ? "Naam" : "Name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{nl ? "Start" : "Start"}</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>{nl ? "Einde" : "End"}</Label>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label>{nl ? "Locatie" : "Location"}</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <Label>Post</Label>
            <Select value={post} onChange={(e) => setPost(e.target.value)}>
              {isSuperAdmin && <option value="">{nl ? "Geen" : "None"}</option>}
              {selectablePosts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {shift?.post && !selectablePosts.includes(shift.post) && (
                <option key={shift.post} value={shift.post}>
                  {shift.post}
                </option>
              )}
            </Select>
          </div>
          <div>
            <Label>{nl ? "Max. deelnemers" : "Max participants"}</Label>
            <Input
              type="number"
              min={1}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </div>
          <div>
            <Label>{nl ? "Beloning" : "Reward"}</Label>
            <Input type="number" min={0} value={reward} onChange={(e) => setReward(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{nl ? "Beschrijving" : "Description"}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-400">
              {nl
                ? "Eén korte regel; staat bovenaan het detailvenster op de shiftpagina."
                : "One short line; shown at the top of the detail dialog on the shift page."}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={openToInternationals}
                onChange={(e) => setOpenToInternationals(e.target.checked)}
              />
              <span>
                <span className="text-sm font-medium">
                  {nl ? "Ook voor internationals" : "Open to internationals"}
                </span>
                <span className="block text-xs text-zinc-400">
                  {nl
                    ? "Aanvinken wanneer je deze shift kan doen zonder Nederlands. De shift krijgt dan die markering op de shiftpagina."
                    : "Tick when this shift can be done without speaking Dutch. The shift then carries that marker on the shift page."}
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Label>{nl ? "Uitleg: wat houdt de shift in?" : "Explanation: what does the shift involve?"}</Label>
            <MarkdownEditor
              locale={locale}
              value={instructions}
              onChange={setInstructions}
              rows={8}
              allowImages={false}
            />
            <p className="mt-1 text-xs text-zinc-400">
              {nl
                ? "Optioneel: wat moet je doen, waar meld je je, wat mag je verwachten. Leeg laten verbergt dit blok op de shiftpagina."
                : "Optional: what to do, where to report, what to expect. Leaving it empty hides this block on the shift page."}
            </p>
          </div>
        </div>

        {isEdit ? (
          <div className="mt-5">
            <Label>
              {nl ? "Ingeschreven shifters" : "Registered shifters"} ({participants.length}/
              {maxParticipants})
            </Label>
            {/* Een tabel en geen rij pillen: wie een shift bemant, wil je kunnen
                bereiken, en dan moeten het r-nummer, de mail en het gsm-nummer
                naast elkaar staan in plaats van in een tooltip. */}
            {participants.length === 0 ? (
              <p className="mb-2 text-sm text-zinc-400">
                {nl ? "Nog niemand ingeschreven." : "Nobody registered yet."}
              </p>
            ) : (
              <div className="mb-3 overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-vtk-blue-soft text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">{nl ? "Naam" : "Name"}</th>
                      <th className="px-3 py-2 font-medium">{nl ? "R-nummer" : "R-number"}</th>
                      <th className="px-3 py-2 font-medium">{nl ? "E-mail" : "Email"}</th>
                      <th className="px-3 py-2 font-medium">{nl ? "Gsm" : "Phone"}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.userId} className="border-t border-zinc-200">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-500">{p.rNumber ?? "—"}</td>
                        <td className="px-3 py-2 text-zinc-500">
                          <a className="hover:underline" href={`mailto:${p.email}`}>
                            {p.email}
                          </a>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-zinc-500">
                          {/* Leeg zolang het lid geen nummer invulde: het veld is
                              optioneel, dus een streepje is hier de waarheid. */}
                          {p.phone ? (
                            <a className="hover:underline" href={`tel:${p.phone}`}>
                              {p.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-red-600"
                            onClick={() => removeParticipant(p.userId)}
                            title={nl ? "Uitschrijven" : "Remove"}
                            aria-label={`${nl ? "Uitschrijven" : "Remove"}: ${p.name}`}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder={nl ? "Zoek op naam, e-mail of r-nummer..." : "Search by name, email or r-number..."}
            />
            {addSearch.trim().length >= 2 && (
              <div className="mt-1 overflow-hidden rounded-xl border border-zinc-200">
                {addable.map((u) => (
                  <button
                    key={u.id}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-vtk-blue-soft"
                    onClick={() => addParticipant(u)}
                  >
                    {u.name}{" "}
                    <span className="text-zinc-400">
                      {u.rNumber ? `${u.rNumber} · ` : ""}
                      {u.email}
                    </span>
                  </button>
                ))}
                {addable.length === 0 && (
                  <div className="px-3 py-1.5 text-sm text-zinc-400">
                    {nl ? "Geen gebruikers gevonden." : "No users found."}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-zinc-400">
              {nl
                ? "Als admin kan je deelnemers toevoegen/verwijderen zonder de gewone regels (overlap, vol, verleden)."
                : "As an admin you can add/remove participants regardless of the usual rules (overlap, full, past)."}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-400">
            {nl
              ? "Shifters kan je inschrijven na het aanmaken, door de shift in de lijst te openen."
              : "You can register shifters after creating, by opening the shift in the list."}
          </p>
        )}

        <FormError>{error}</FormError>

        <div className="mt-5 flex items-center justify-end gap-2">
          {/* Verwijderen staat in het venster en niet meer per rij in de tabel:
              het is de enige onomkeerbare actie. Zie CLAUDE.md > Admin. */}
          {isEdit && onDelete ? (
            <button
              type="button"
              className="mr-auto text-sm font-medium text-red-600 hover:underline"
              onClick={onDelete}
            >
              {nl ? "Shift verwijderen" : "Delete shift"}
            </button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {nl ? "Annuleren" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? (nl ? "Bezig..." : "Saving...") : nl ? "Opslaan" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
