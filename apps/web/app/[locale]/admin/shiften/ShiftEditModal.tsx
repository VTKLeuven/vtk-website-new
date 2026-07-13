"use client";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { Locale } from "@vtk/i18n";
import { Button, Card, FormError, Input, Label, Select, Textarea } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import type { AdminParticipant, AdminShift } from "./ShiftAdmin";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export function ShiftEditModal({
  locale,
  shift,
  postOptions,
  onClose,
  onSaved,
}: {
  locale: Locale;
  shift: AdminShift | null;
  postOptions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const isEdit = shift !== null;

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
  const [post, setPost] = useState(shift?.post ?? "");
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
    setParticipants((cur) => [...cur, { userId: u.id, name: u.name, email: u.email, payedOut: false }]);
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
      <Card className="my-8 w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
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
              <option value="">{nl ? "Geen" : "None"}</option>
              {postOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
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
          </div>
        </div>

        {isEdit ? (
          <div className="mt-5">
            <Label>
              {nl ? "Deelnemers" : "Participants"} ({participants.length}/{maxParticipants})
            </Label>
            <div className="mb-2 flex flex-wrap gap-2">
              {participants.length === 0 && (
                <span className="text-sm text-zinc-400">{nl ? "Nog geen deelnemers." : "No participants yet."}</span>
              )}
              {participants.map((p) => (
                <span
                  key={p.userId}
                  className="inline-flex items-center gap-1 rounded-full border border-vtk-blue/15 bg-vtk-blue-soft px-2 py-1 text-xs"
                  title={p.email}
                >
                  {p.name}
                  <button
                    className="text-zinc-500 hover:text-red-600"
                    onClick={() => removeParticipant(p.userId)}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
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
              ? "Deelnemers kan je toevoegen na het aanmaken, via Bewerken."
              : "You can add participants after creating, via Edit."}
          </p>
        )}

        <FormError>{error}</FormError>

        <div className="mt-5 flex justify-end gap-2">
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
