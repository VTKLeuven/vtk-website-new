"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, Card, ConfirmDialog, Input, Label } from "@vtk/ui";
import { formatEuro } from "@/lib/theokot";
import {
  formatVoucherCount,
  formatVouchers,
  PRAESIDIUM_VOUCHERS_MESSAGE,
} from "@/lib/shift/rewards";
import { shouldRedirectToScanner } from "@/lib/scannerFocus";
import {
  lookupPickupByCardAction,
  lookupPickupByPassAction,
  lookupPickupByQueryAction,
  lookupPickupByUserAction,
  markPickedUpAction,
  redeemEmployeeVouchersAction,
  suggestPickupAction,
  undoPickupAction,
  type PickupCandidate,
  type PickupOrder,
  type PickupSearchResult,
} from "@/app/actions/theokot";

/** Waaraan een pas uit de VTK-app te herkennen is; zie `lib/app-api/tokens.ts`. */
const PASS_PREFIX = "vtkpas1.";

/** Zo lang wacht de balie na de laatste toets voor ze suggesties vraagt. */
const SUGGEST_DELAY_MS = 180;

/** Wat een suggestie over de bestelling van vandaag zegt, naast de naam. */
function praesidiumVouchersNote(nl: boolean): string {
  return PRAESIDIUM_VOUCHERS_MESSAGE[nl ? "nl" : "en"];
}

function candidateStatus(candidate: PickupCandidate, nl: boolean): string | null {
  if (candidate.status === "PICKED_UP") return nl ? "al opgehaald" : "already picked up";
  if (candidate.status === "NO_SHOW") return nl ? "niet opgehaald" : "not picked up";
  return null;
}

/**
 * Afhaalbalie: naam, r-nummer, studentenkaart of de pas uit de app; bestelling
 * tonen, opgehaald markeren.
 *
 * Met `autoPickup` (Theokot-instellingen) staat een gewone reservatie meteen op
 * opgehaald zodra de student gevonden is; gebruikt hij bonnetjes, dan pas na die
 * vraag. "Ongedaan maken" staat er dan vlak onder, voor een foute match.
 */
export function PickupCounter({ nl, autoPickup = false }: { nl: boolean; autoPickup?: boolean }) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<PickupCandidate[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const listId = useId();
  const suggestTimer = useRef<number | null>(null);
  // Elke vraag krijgt een nummer; een antwoord op een oudere vraag telt niet meer.
  const suggestRequest = useRef(0);
  const [result, setResult] = useState<PickupSearchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [voucherPending, startVoucherTransition] = useTransition();
  const [voucherOrderId, setVoucherOrderId] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherCovers, setVoucherCovers] = useState<number | null>(null);
  // Wat de balie de student zegt dat het broodje kost; de server boekt enkel af
  // wanneer dat nog klopt.
  const [voucherCost, setVoucherCost] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Voorkomt dubbel zoeken wanneer de scanner én een newline-char én een Enter stuurt.
  const busyRef = useRef(false);

  // De kaartlezer is een toetsenbord: wat hij tikt, moet in het scanveld landen,
  // ook als de focus net op een knop staat. Zie `shouldRedirectToScanner`.
  // In de capture-fase en zonder `preventDefault`: de focus verschuift vóór de
  // browser het teken verwerkt, dus het teken zelf komt gewoon in het veld.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const input = inputRef.current;
      if (!input || document.activeElement === input) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const dialogOpen = document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
      if (!shouldRedirectToScanner(event, active, dialogOpen)) return;
      input.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function clearSuggestions() {
    suggestRequest.current += 1;
    if (suggestTimer.current !== null) window.clearTimeout(suggestTimer.current);
    suggestTimer.current = null;
    setSuggestions([]);
    setActiveSuggestion(-1);
  }

  function requestSuggestions(text: string) {
    if (suggestTimer.current !== null) window.clearTimeout(suggestTimer.current);
    const query = text.trim();
    // Wat de kaartlezer of een QR-lezer tikt, zoekt zelf bij de Enter.
    if (query.length < 2 || query.includes(";") || query.startsWith(PASS_PREFIX.slice(0, 6))) {
      suggestRequest.current += 1;
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }
    const request = ++suggestRequest.current;
    suggestTimer.current = window.setTimeout(async () => {
      try {
        const found = await suggestPickupAction(query);
        if (request !== suggestRequest.current) return;
        setSuggestions(found);
        setActiveSuggestion(-1);
      } catch {
        // Suggesties zijn een gemak; zonder werkt Enter gewoon zoals voordien.
      }
    }, SUGGEST_DELAY_MS);
  }

  function run(raw: string) {
    const cleaned = raw.replace(/[\r\n]+/g, "").trim();
    if (!cleaned || busyRef.current) return;
    clearSuggestions();
    // Drie soorten invoer op één veld, en ze zijn aan hun vorm te herkennen:
    // de kaartlezer tikt "serial;cardAppId", een QR-lezer tikt de pas uit de
    // app ("vtkpas1."), en wat overblijft is met de hand ingetikt: een
    // r-nummer of een naam, dat beslist de server. Eén veld en niet drie, want
    // aan de balie is er één beweging.
    lookup(cleaned, () =>
      cleaned.startsWith(PASS_PREFIX)
        ? lookupPickupByPassAction(cleaned)
        : cleaned.includes(";")
          ? lookupPickupByCardAction(cleaned)
          : lookupPickupByQueryAction(cleaned),
    );
  }

  /** Iemand uit de keuzelijst na een naamzoekopdracht, of uit de suggesties. */
  function choose(candidate: PickupCandidate) {
    clearSuggestions();
    const typed = value;
    lookup(typed, () => lookupPickupByUserAction(candidate.userId));
  }

  function lookup(submitted: string, fetchResult: () => Promise<PickupSearchResult>) {
    if (busyRef.current) return;
    busyRef.current = true;
    startTransition(async () => {
      try {
        const res = await fetchResult();
        setResult(res);
        const eligibleOrder =
          res.ok && !res.vouchersBlocked
            ? res.orders.find(
                (order) =>
                  (order.status === "RESERVED" || order.status === "NO_SHOW") &&
                  !order.grocomeet &&
                  !order.voucherRedemption &&
                  order.voucherCost > 0 &&
                  res.outstandingBonnetjes >= order.voucherCost,
              )
            : null;
        setVoucherOrderId(eligibleOrder?.orderId ?? null);
        setVoucherCovers(eligibleOrder?.voucherCoversCents ?? null);
        setVoucherCost(eligibleOrder?.voucherCost ?? null);
        setVoucherError(null);
        // Enkel wissen wat er gezocht werd. Hangt een kaartcontrole even, dan
        // tikt de shifter intussen de naam al in; die mag niet verdwijnen.
        setValue((current) => (current.trim() === submitted ? "" : current));
      } finally {
        busyRef.current = false;
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // Sommige scanners injecteren een newline i.p.v. een Enter-toets → meteen zoeken.
    if (v.includes("\n") || v.includes("\r")) run(v);
    else {
      setValue(v);
      requestSuggestions(v);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearSuggestions();
    } else if (e.key === "Enter" && activeSuggestion >= 0) {
      e.preventDefault();
      choose(suggestions[activeSuggestion]!);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(value);
  }

  function reset() {
    clearSuggestions();
    setResult(null);
    setVoucherOrderId(null);
    setVoucherCovers(null);
    setVoucherCost(null);
    setVoucherError(null);
    setValue("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function redeemVouchers() {
    if (!voucherOrderId || voucherCost === null) return;
    startVoucherTransition(async () => {
      try {
        const response = await redeemEmployeeVouchersAction(voucherOrderId, voucherCost);
        if (!response.ok) {
          setVoucherError(
            response.code === "PRAESIDIUM"
              ? praesidiumVouchersNote(nl)
              : response.error,
          );
          return;
        }

        setResult((current) => {
          if (!current?.ok) return current;
          return {
            ...current,
            outstandingBonnetjes: response.remainingBonnetjes,
            orders: current.orders.map((order) =>
              order.orderId === voucherOrderId
                ? {
                    ...order,
                    voucherRedemption: { amount: response.amount },
                  }
                : order,
            ),
          };
        });
        setVoucherOrderId(null);
        setVoucherError(null);
      } catch {
        setVoucherError(
          nl
            ? "De bonnetjes konden niet worden verwerkt. Probeer opnieuw."
            : "The vouchers could not be processed. Please try again.",
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label>
              {nl
                ? "Naam, r-nummer, studentenkaart of de code uit de app"
                : "Name, r-number, student card or the code from the app"}
            </Label>
            <div className="relative">
              <Input
                ref={inputRef}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onBlur={() => window.setTimeout(clearSuggestions, 120)}
                autoFocus
                autoComplete="off"
                placeholder={nl ? "r0123456 of Jan Peeters" : "r0123456 or Jan Peeters"}
                spellCheck={false}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls={listId}
                aria-activedescendant={
                  activeSuggestion >= 0 ? `${listId}-${activeSuggestion}` : undefined
                }
              />
              {suggestions.length > 0 ? (
                <ul
                  id={listId}
                  role="listbox"
                  aria-label={nl ? "Suggesties" : "Suggestions"}
                  className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-vtk-blue/15 bg-vtk-surface p-1 shadow-lg"
                >
                  {suggestions.map((candidate, index) => {
                    const note = candidateStatus(candidate, nl);
                    return (
                      <li
                        key={candidate.userId}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === activeSuggestion}
                        // mousedown en niet click: een click komt pas na de blur
                        // van het veld, en die sluit de lijst.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(candidate);
                        }}
                        onMouseEnter={() => setActiveSuggestion(index)}
                        className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                          index === activeSuggestion ? "bg-vtk-blue-soft" : ""
                        }`}
                      >
                        <span className="font-medium text-vtk-ink">{candidate.name}</span>
                        <span className="flex items-baseline gap-2 tabular-nums text-[#5c667f]">
                          {note ? <span className="text-xs">{note}</span> : null}
                          {candidate.rNumber ?? (nl ? "geen r-nummer" : "no r-number")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Scan de kaart, of tik een r-nummer of naam: kies uit de suggesties of druk op Enter. Op naam vind je enkel wie vandaag iets besteld heeft. Scannen werkt overal op deze pagina, ook zonder eerst in dit veld te klikken."
                : "Scan the card, or type an r-number or name: pick a suggestion or press Enter. A name only finds people who ordered today. Scanning works anywhere on this page, without clicking this field first."}
              {autoPickup
                ? nl
                  ? " Automatisch op afgehaald staat aan."
                  : " Automatic pickup is on."
                : null}
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (nl ? "Zoeken..." : "Searching...") : nl ? "Zoeken" : "Look up"}
          </Button>
        </form>
      </Card>

      {result && !result.ok && (
        <div className="vtk-basic-alert vtk-basic-alert-warning">
          <div className="vtk-basic-alert-text">{result.error}</div>
        </div>
      )}

      {result && !result.ok && "candidates" in result && (
        <Card className="p-2">
          <ul aria-label={nl ? "Kies de juiste persoon" : "Choose the right person"}>
            {result.candidates.map((candidate) => (
              <li key={candidate.userId}>
                <button
                  type="button"
                  onClick={() => choose(candidate)}
                  disabled={pending}
                  className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-vtk-blue-soft/60 focus-visible:bg-vtk-blue-soft/60 disabled:opacity-50"
                >
                  <span className="font-medium text-vtk-ink">{candidate.name}</span>
                  <span className="text-sm tabular-nums text-[#5c667f]">
                    {candidate.rNumber ?? (nl ? "geen r-nummer" : "no r-number")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result && result.ok && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-vtk-ink">{result.userName}</div>
              <div className="text-sm text-[#5c667f]">{result.rNumber}</div>
              <div className="mt-1 text-xs font-medium text-vtk-blue">
                {formatVouchers(result.outstandingBonnetjes, nl ? "nl" : "en")}{" "}
                {nl ? "openstaande medewerkersbonnetjes" : "outstanding staff vouchers"}
              </div>
              {result.vouchersBlocked && (
                <div className="mt-1 text-xs font-medium text-[#5c667f]">
                  {praesidiumVouchersNote(nl)}
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {nl ? "Volgende" : "Next"}
            </Button>
          </div>
          <div className="space-y-4">
            {result.orders.map((o) => (
              <PickupOrderPanel
                key={o.orderId}
                nl={nl}
                order={o}
                // Pas na de bonnetjesvraag: eerst weten of er nog iets te
                // betalen valt, dan pas uitdelen.
                autoMark={autoPickup && voucherOrderId === null}
              />
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={voucherOrderId !== null}
        title={nl ? "Medewerkersbonnetjes gebruiken?" : "Use staff vouchers?"}
        description={
          <div className="space-y-2">
            {voucherCost !== null && (
              <p>
                {nl
                  ? `Wilt de student ${formatVoucherCount(voucherCost)} gebruiken in ruil voor dit broodje?`
                  : `Does the student want to use ${formatVoucherCount(voucherCost, "en")} for this sandwich?`}
              </p>
            )}
            {voucherCovers !== null && (
              <p>
                {nl
                  ? `Bonnetjes betalen één broodje: het duurste uit deze bestelling, ${formatEuro(voucherCovers)}. Geen opleg, geen geld terug.`
                  : `Vouchers pay for one sandwich: the most expensive in this order, ${formatEuro(voucherCovers)}. No surcharge, no change.`}
              </p>
            )}
            <p>
              {nl
                ? "Kies Nee wanneer de student ter plaatse betaalt of fysieke bonnetjes gebruikt."
                : "Choose No when the student pays on site or uses physical vouchers."}
            </p>
            {voucherError ? <p className="font-medium text-red-600">{voucherError}</p> : null}
          </div>
        }
        confirmLabel={nl ? "Ja" : "Yes"}
        cancelLabel={nl ? "Nee" : "No"}
        destructive={false}
        pending={voucherPending}
        onConfirm={redeemVouchers}
        onCancel={() => {
          if (voucherPending) return;
          setVoucherOrderId(null);
          setVoucherCost(null);
          setVoucherError(null);
        }}
      />
    </div>
  );
}

function PickupOrderPanel({
  nl,
  order,
  autoMark,
}: {
  nl: boolean;
  order: PickupOrder;
  /** Meteen op opgehaald zetten, zonder klik; enkel voor een gewone reservatie. */
  autoMark: boolean;
}) {
  const [status, setStatus] = useState(order.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Wat deze shifter hier net zelf registreerde, kan hij meteen terugdraaien.
  const [markedHere, setMarkedHere] = useState<"auto" | "manual" | null>(null);
  // Eén keer per bestelling: na "Ongedaan maken" niet opnieuw automatisch.
  const autoTried = useRef(false);

  function mark(how: "auto" | "manual" = "manual") {
    startTransition(async () => {
      const res = await markPickedUpAction(order.orderId);
      if (res.ok) {
        setStatus("PICKED_UP");
        setMarkedHere(how);
        setError(null);
      } else setError(res.error);
    });
  }

  function undo() {
    startTransition(async () => {
      const res = await undoPickupAction(order.orderId);
      if (res.ok) {
        setStatus("RESERVED");
        setMarkedHere(null);
        setError(null);
      } else setError(res.error);
    });
  }

  useEffect(() => {
    if (!autoMark || autoTried.current || order.status !== "RESERVED" || order.grocomeet) return;
    autoTried.current = true;
    mark("auto");
    // `mark` is elke render nieuw; dit hoort enkel te lopen wanneer autoMark aangaat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMark, order.status]);

  const pickedUp = status === "PICKED_UP";
  // Te laat, maar niet verloren: het broodje mag nog over de toog. Enkel de
  // shifter hoort te weten dat de afhaal van die dag al voorbij was.
  const late = status === "NO_SHOW";
  // Bonnetjes betalen exact één broodje: het duurste uit deze bestelling.
  const stillToPay = order.voucherRedemption
    ? Math.max(0, order.totalCents - order.voucherCoversCents)
    : null;

  return (
    <div className="rounded-xl border border-vtk-blue/12 p-4">
      <div className="mb-2 text-sm text-[#5c667f]">
        {nl ? "Afhalen" : "Pickup"}: {order.pickupStart} – {order.pickupEnd}
      </div>
      {late && (
        <div className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
          {nl
            ? "Deze bestelling stond als niet opgehaald geboekt. Je kan ze nog altijd uitdelen."
            : "This order was booked as not picked up. You can still hand it over."}
        </div>
      )}
      <ul className="text-sm text-[#34405e]">
        {order.lines.map((l, i) => (
          <li key={i} className="flex justify-between py-0.5">
            <span>
              {l.quantity}× {nl ? l.nameNl : l.nameEn ?? l.nameNl}
            </span>
            <span className="tabular-nums">{formatEuro(l.quantity * l.unitPriceCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-vtk-blue/10 pt-2">
        <span className={stillToPay === null ? "text-lg font-semibold" : "text-sm text-[#5c667f]"}>
          {nl ? "Bestelwaarde" : "Order value"}
        </span>
        <span
          className={
            stillToPay === null
              ? "text-lg font-semibold tabular-nums"
              : "text-sm tabular-nums text-[#5c667f]"
          }
        >
          {formatEuro(order.totalCents)}
        </span>
      </div>
      {order.voucherRedemption ? (
        <>
          <div className="flex items-center justify-between text-sm text-[#5c667f]">
            <span>
              {nl
                ? `${formatVoucherCount(order.voucherRedemption.amount)} (1 broodje)`
                : `${formatVoucherCount(order.voucherRedemption.amount, "en")} (1 sandwich)`}
            </span>
            <span className="tabular-nums">- {formatEuro(order.voucherCoversCents)}</span>
          </div>
          {/* Het bedrag dat de shifter moet vragen, en niets anders in die
              tekengrootte: hij staat met een rij voor zich. */}
          <div className="mt-2 flex items-center justify-between border-t border-vtk-blue/10 pt-2">
            <span className="text-lg font-semibold">{nl ? "Nog te betalen" : "Still to pay"}</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatEuro(stillToPay ?? 0)}
            </span>
          </div>
        </>
      ) : null}
      <div className="mt-3">
        {order.grocomeet ? (
          // Geen knop: dit broodje ligt niet hier, en betaald wordt het bij de
          // grocomeet. Meegeven en afrekenen zou het twee keer doen.
          <div className="rounded-lg bg-vtk-blue-soft px-3 py-2 text-sm font-medium text-vtk-ink">
            {pickedUp
              ? nl
                ? "✓ Meegegeven in de doos van de grocomeet."
                : "✓ Handed over in the grocomeet box."
              : nl
                ? "Zit in de doos van de grocomeet. Niet meegeven en niet afrekenen: dat gebeurt bij de grocomeet."
                : "This is in the grocomeet box. Do not hand it over or charge for it: that happens at the grocomeet."}
          </div>
        ) : pickedUp ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
            <span>
              ✓ {nl ? "Opgehaald" : "Picked up"}
              {markedHere === "auto" ? (nl ? " (automatisch)" : " (automatically)") : null}
            </span>
            {markedHere ? (
              <button
                type="button"
                onClick={undo}
                disabled={pending}
                className="rounded-full border border-emerald-800/30 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
              >
                {nl ? "Ongedaan maken" : "Undo"}
              </button>
            ) : null}
          </div>
        ) : (
          <Button onClick={() => mark()} disabled={pending} className="w-full">
            {pending
              ? nl
                ? "Bezig..."
                : "..."
              : late
                ? nl
                  ? "Toch nog uitgedeeld"
                  : "Handed over anyway"
                : nl
                  ? "Markeer als opgehaald"
                  : "Mark as picked up"}
          </Button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
