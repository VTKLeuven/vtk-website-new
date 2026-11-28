"use client";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Button, Card, FormError, Input, Label, Select, Textarea } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { RewardCoins } from "@/components/shift/RewardCoins";
import { LangTabs, type Lang } from "../kalender/LangTabs";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import type { AdminParticipant, AdminShift } from "./ShiftAdmin";
import type { ShiftTripOption } from "@/lib/shift/tripOptions";

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
  manageAllPosts = false,
  onClose,
  onSaved,
  onDelete,
}: {
  locale: Locale;
  shift: AdminShift | null;
  postOptions: string[];
  userPostCodes?: string[];
  manageAllPosts?: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Opent de bevestiging om deze shift te verwijderen; enkel bij bewerken. */
  onDelete?: () => void;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const isEdit = shift !== null;

  const selectablePosts = useMemo(() => {
    if (manageAllPosts) return postOptions;
    return postOptions.filter((p) =>
      userPostCodes.some((code) => code.toLowerCase() === p.toLowerCase()),
    );
  }, [manageAllPosts, postOptions, userPostCodes]);

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
    shift?.post ?? (manageAllPosts ? "" : (selectablePosts[0] ?? "")),
  );
  const [openToInternationals, setOpenToInternationals] = useState(
    shift?.openToInternationals ?? false,
  );
  const [instructions, setInstructions] = useState(shift?.instructions ?? "");
  // Engels is optioneel: leeg = de Nederlandse tekst op /en/shift. Eén
  // schakelaar voor de drie velden, zoals in het evenementformulier.
  const [lang, setLang] = useState<Lang>("nl");
  const [nameEn, setNameEn] = useState(shift?.nameEn ?? "");
  const [descriptionEn, setDescriptionEn] = useState(shift?.descriptionEn ?? "");
  const [instructionsEn, setInstructionsEn] = useState(shift?.instructionsEn ?? "");
  // Een bijrijdshift hangt aan een rit van de uitleendienst; wie ingeschreven
  // is, ziet dan de chauffeur en zijn nummer (lib/shift/driver.ts).
  const [transportBookingId, setTransportBookingId] = useState<string | null>(
    shift?.transportBooking?.id ?? null,
  );
  const shiftDay = start.slice(0, 10);
  // Het antwoord met zijn dag erbij: zolang de dag niet die van de shift is,
  // laadt de lijst nog (`trips === null`), zonder state te wissen in het effect.
  const [loadedTrips, setLoadedTrips] = useState<{
    day: string;
    trips: ShiftTripOption[];
    failed: boolean;
  } | null>(null);
  const trips = loadedTrips?.day === shiftDay ? loadedTrips.trips : null;
  const tripsFailed = loadedTrips?.day === shiftDay && loadedTrips.failed;
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

  // De ritten van de dag van de shift. Opnieuw bij een andere dag: een C&G-reeks
  // rijdt elke week, en de rit van vorige week is niet die van deze shift.
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDay)) return;
    const controller = new AbortController();
    fetch(`/api/shift/trips?date=${shiftDay}`, { signal: controller.signal })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(String(resp.status));
        const list = (await resp.json()) as ShiftTripOption[];
        setLoadedTrips({ day: shiftDay, trips: list, failed: false });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[shift] ritten laden mislukt", err);
        setLoadedTrips({ day: shiftDay, trips: [], failed: true });
      });
    return () => controller.abort();
  }, [shiftDay]);

  // De gekoppelde rit blijft te zien, ook wanneer ze niet op de gekozen dag
  // valt: anders verdwijnt ze stil uit de lijst en weet je niet meer dat de
  // shift eraan hangt.
  const tripChoices = useMemo(() => {
    const linked = shift?.transportBooking ?? null;
    const list = (trips ?? []).map((trip) => ({ trip, otherDay: false }));
    return linked && !list.some(({ trip }) => trip.id === linked.id)
      ? [{ trip: linked, otherDay: true }, ...list]
      : list;
  }, [shift, trips]);

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
      nameEn: nameEn.trim() === "" ? null : nameEn,
      descriptionEn: descriptionEn.trim() === "" ? null : descriptionEn,
      instructionsEn: instructionsEn.trim() === "" ? null : instructionsEn,
      transportBookingId,
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
          <button className="text-vtk-muted hover:text-vtk-body" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="vtk-ef-field-head">
              <Label htmlFor={`shift-name-${lang}`}>
                {nl ? "Naam" : "Name"} ({lang.toUpperCase()})
              </Label>
              <LangTabs value={lang} onChange={setLang} nl={nl} />
            </div>
            {lang === "nl" ? (
              <Input id="shift-name-nl" value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <Input
                id="shift-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={name || undefined}
              />
            )}
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
              {manageAllPosts && <option value="">{nl ? "Geen" : "None"}</option>}
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
            <Label htmlFor="shift-reward">{nl ? "Beloning" : "Reward"}</Label>
            {/* Dezelfde muntjes als op /shift: zo is het meteen duidelijk dat dit getal bonnetjes zijn. */}
            <div className="flex items-center gap-2">
              <Input
                id="shift-reward"
                type="number"
                min={0}
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
              <RewardCoins
                amount={Number(reward) || 0}
                label={nl ? "bonnetjes" : "vouchers"}
                display=""
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="vtk-ef-field-head">
              <Label htmlFor={`shift-description-${lang}`}>
                {nl ? "Beschrijving" : "Description"} ({lang.toUpperCase()})
              </Label>
              <LangTabs value={lang} onChange={setLang} nl={nl} />
            </div>
            {lang === "nl" ? (
              <Textarea id="shift-description-nl" value={description} onChange={(e) => setDescription(e.target.value)} />
            ) : (
              <Textarea
                id="shift-description-en"
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder={description || undefined}
              />
            )}
            <p className="mt-1 text-xs text-vtk-muted">
              {lang === "en"
                ? nl
                  ? "Optioneel. Leeg laten toont op de Engelse shiftpagina de Nederlandse tekst."
                  : "Optional. Leaving it empty shows the Dutch text on the English shift page."
                : nl
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
                <span className="block text-xs text-vtk-muted">
                  {nl
                    ? "Aanvinken wanneer je deze shift kan doen zonder Nederlands. De shift krijgt dan die markering op de shiftpagina."
                    : "Tick when this shift can be done without speaking Dutch. The shift then carries that marker on the shift page."}
                </span>
              </span>
            </label>
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">
              {nl ? "Rit van de uitleendienst" : "Logistics trip"}
            </legend>
            <p className="mb-2 mt-1 text-xs text-vtk-muted">
              {nl
                ? "Voor een bijrijdshift, zoals C&G. Wie ingeschreven is, ziet dan wie er rijdt en op welk nummer, op de shiftpagina en in de herinneringsmail. Anderen zien het niet. De ritten van de dag van de shift:"
                : "For a ride-along shift, such as C&G. Whoever signs up then sees who drives and their number, on the shift page and in the reminder mail. Nobody else does. The trips on the day of the shift:"}
            </p>
            {/* Keuzerondjes en geen keuzelijst: een rit is een uur, een doel, een
                voertuig en een chauffeur, en die horen in kolommen en niet met
                puntjes op één regel. Een dag telt er zelden meer dan vijf. */}
            <div className="grid gap-1.5">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-vtk-navy/10 px-3 py-2 text-sm has-[:checked]:border-vtk-navy has-[:checked]:bg-vtk-blue-soft">
                <input
                  type="radio"
                  name="shift-trip"
                  checked={transportBookingId === null}
                  onChange={() => setTransportBookingId(null)}
                />
                <span>{nl ? "Geen rit: geen bijrijdshift" : "No trip: not a ride-along shift"}</span>
              </label>
              {tripChoices.map(({ trip, otherDay }) => (
                <label
                  key={trip.id}
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-xl border border-vtk-navy/10 px-3 py-2 text-sm has-[:checked]:border-vtk-navy has-[:checked]:bg-vtk-blue-soft sm:grid-cols-[auto_6rem_minmax(0,1fr)_6rem_8rem]"
                >
                  <input
                    type="radio"
                    name="shift-trip"
                    className="mt-1"
                    checked={transportBookingId === trip.id}
                    onChange={() => setTransportBookingId(trip.id)}
                  />
                  <span className="font-medium tabular-nums">
                    {otherDay ? <span className="block text-xs font-normal text-vtk-muted">{trip.day}</span> : null}
                    {trip.start}–{trip.end}
                  </span>
                  <span className="col-start-2 min-w-0 sm:col-start-auto">
                    {trip.purpose}
                    {trip.requester || trip.requested ? (
                      <span className="block text-xs text-vtk-muted">
                        {trip.requester}
                        {trip.requester && trip.requested ? ", " : ""}
                        {trip.requested ? (nl ? "nog niet goedgekeurd" : "not approved yet") : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="col-start-2 sm:col-start-auto">
                    <span className="block text-xs text-vtk-muted">{nl ? "Voertuig" : "Vehicle"}</span>
                    {trip.vehicle}
                  </span>
                  <span className="col-start-2 sm:col-start-auto">
                    <span className="block text-xs text-vtk-muted">{nl ? "Chauffeur" : "Driver"}</span>
                    {trip.driver ?? (nl ? "nog niemand" : "nobody yet")}
                  </span>
                </label>
              ))}
              {trips === null ? (
                <p className="text-sm text-vtk-muted">{nl ? "Ritten laden..." : "Loading trips..."}</p>
              ) : tripsFailed ? (
                <p className="text-sm text-vtk-danger" role="alert">
                  {nl
                    ? "De ritten van deze dag konden niet geladen worden. Probeer het venster opnieuw te openen."
                    : "The trips for this day could not be loaded. Try opening the dialog again."}
                </p>
              ) : trips.length === 0 ? (
                <p className="text-sm text-vtk-muted">
                  {nl
                    ? "Op deze dag staat er geen rit bij de uitleendienst. Kies eerst de juiste dag hierboven, of vraag Logistiek de rit in te plannen."
                    : "There is no logistics trip on this day. Pick the right day above first, or ask Logistiek to plan the trip."}
                </p>
              ) : null}
            </div>
          </fieldset>

          <div className="sm:col-span-2">
            <div className="vtk-ef-field-head">
              <Label>
                {nl ? "Uitleg: wat houdt de shift in?" : "Explanation: what does the shift involve?"} (
                {lang.toUpperCase()})
              </Label>
              <LangTabs value={lang} onChange={setLang} nl={nl} />
            </div>
            {/* Beide editors blijven gemonteerd; enkel de zichtbare telt. */}
            <div className={lang === "nl" ? undefined : "hidden"}>
              <MarkdownEditor
                locale={locale}
                value={instructions}
                onChange={setInstructions}
                rows={8}
                allowImages={false}
              />
            </div>
            <div className={lang === "en" ? undefined : "hidden"}>
              <MarkdownEditor
                locale={locale}
                value={instructionsEn}
                onChange={setInstructionsEn}
                rows={8}
                allowImages={false}
              />
            </div>
            <p className="mt-1 text-xs text-vtk-muted">
              {lang === "en"
                ? nl
                  ? "Optioneel. Leeg laten toont op de Engelse shiftpagina de Nederlandse uitleg."
                  : "Optional. Leaving it empty shows the Dutch explanation on the English shift page."
                : nl
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
              <p className="mb-2 text-sm text-vtk-muted">
                {nl ? "Nog niemand ingeschreven." : "Nobody registered yet."}
              </p>
            ) : (
              <div className="mb-3 overflow-x-auto rounded-xl border border-vtk-navy/10">
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
                      <tr key={p.userId} className="border-t border-vtk-navy/10">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 tabular-nums text-vtk-muted">{p.rNumber ?? "—"}</td>
                        <td className="px-3 py-2 text-vtk-muted">
                          <a className="hover:underline" href={`mailto:${p.email}`}>
                            {p.email}
                          </a>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-vtk-muted">
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
                          {/* Geen bevestiging: uitschrijven gebeurt pas bij
                              Opslaan, en Annuleren draait het terug. */}
                          <IconButton
                            label={nl ? "Uitschrijven" : "Remove"}
                            srLabel={`${nl ? "Uitschrijven" : "Remove"}: ${p.name}`}
                            tone="danger"
                            className="ml-auto"
                            onClick={() => removeParticipant(p.userId)}
                          >
                            <TrashIcon />
                          </IconButton>
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
              <div className="mt-1 overflow-hidden rounded-xl border border-vtk-navy/10">
                {addable.map((u) => (
                  <button
                    key={u.id}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-vtk-blue-soft"
                    onClick={() => addParticipant(u)}
                  >
                    {u.name}{" "}
                    <span className="text-vtk-muted">
                      {u.rNumber ? `${u.rNumber} · ` : ""}
                      {u.email}
                    </span>
                  </button>
                ))}
                {addable.length === 0 && (
                  <div className="px-3 py-1.5 text-sm text-vtk-muted">
                    {nl ? "Geen gebruikers gevonden." : "No users found."}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-vtk-muted">
              {nl
                ? "Als admin kan je deelnemers toevoegen/verwijderen zonder de gewone regels (overlap, vol, verleden)."
                : "As an admin you can add/remove participants regardless of the usual rules (overlap, full, past)."}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-vtk-muted">
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
              className="mr-auto text-sm font-medium text-vtk-danger hover:underline"
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
