"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, ConfirmDialog, Input, Label } from "@vtk/ui";
import { formatEuro } from "@/lib/theokot";
import { shouldRedirectToScanner } from "@/lib/scannerFocus";
import {
  lookupPickupByCardAction,
  lookupPickupByPassAction,
  lookupPickupByRNumberAction,
  markPickedUpAction,
  redeemEmployeeVouchersAction,
  type PickupLookupResult,
  type PickupOrder,
} from "@/app/actions/theokot";

/** Waaraan een pas uit de VTK-app te herkennen is; zie `lib/app-api/tokens.ts`. */
const PASS_PREFIX = "vtkpas1.";

/** Afhaalbalie: r-nummer, studentenkaart of de pas uit de app; bestelling tonen, opgehaald markeren. */
export function PickupCounter({ nl }: { nl: boolean }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<PickupLookupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [voucherPending, startVoucherTransition] = useTransition();
  const [voucherOrderId, setVoucherOrderId] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherCovers, setVoucherCovers] = useState<number | null>(null);
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

  function run(raw: string) {
    const cleaned = raw.replace(/[\r\n]+/g, "").trim();
    if (!cleaned || busyRef.current) return;
    busyRef.current = true;
    startTransition(async () => {
      try {
        // Drie soorten invoer op één veld, en ze zijn aan hun vorm te herkennen:
        // de kaartlezer tikt "serial;cardAppId", een QR-lezer tikt de pas uit de
        // app ("vtkpas1."), en wat overblijft is een met de hand ingetikt
        // r-nummer. Eén veld en niet drie, want aan de balie is er één beweging.
        const res = cleaned.startsWith(PASS_PREFIX)
          ? await lookupPickupByPassAction(cleaned)
          : cleaned.includes(";")
            ? await lookupPickupByCardAction(cleaned)
            : await lookupPickupByRNumberAction(cleaned);
        setResult(res);
        const eligibleOrder =
          res.ok && res.outstandingBonnetjes >= 2
            ? res.orders.find(
                (order) =>
                  (order.status === "RESERVED" || order.status === "NO_SHOW") &&
                  !order.voucherRedemption,
              )
            : null;
        setVoucherOrderId(eligibleOrder?.orderId ?? null);
        setVoucherCovers(eligibleOrder?.voucherCoversCents ?? null);
        setVoucherError(null);
        setValue("");
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
    else setValue(v);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(value);
  }

  function reset() {
    setResult(null);
    setVoucherOrderId(null);
    setVoucherCovers(null);
    setVoucherError(null);
    setValue("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function redeemVouchers() {
    if (!voucherOrderId) return;
    startVoucherTransition(async () => {
      try {
        const response = await redeemEmployeeVouchersAction(voucherOrderId);
        if (!response.ok) {
          setVoucherError(response.error);
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
                ? "R-nummer, studentenkaart of de code uit de app"
                : "R-number, student card or the code from the app"}
            </Label>
            <Input
              ref={inputRef}
              value={value}
              onChange={onChange}
              autoFocus
              autoComplete="off"
              placeholder="r0123456"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Scan de kaart of tik het r-nummer en druk op Enter. Scannen werkt overal op deze pagina, ook zonder eerst in dit veld te klikken."
                : "Scan the card or type the r-number and press Enter. Scanning works anywhere on this page, without clicking this field first."}
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

      {result && result.ok && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-vtk-ink">{result.userName}</div>
              <div className="text-sm text-[#5c667f]">{result.rNumber}</div>
              <div className="mt-1 text-xs font-medium text-vtk-blue">
                {result.outstandingBonnetjes}{" "}
                {nl ? "openstaande medewerkersbonnetjes" : "outstanding staff vouchers"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {nl ? "Volgende" : "Next"}
            </Button>
          </div>
          <div className="space-y-4">
            {result.orders.map((o) => (
              <PickupOrderPanel key={o.orderId} nl={nl} order={o} />
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={voucherOrderId !== null}
        title={nl ? "Medewerkersbonnetjes gebruiken?" : "Use staff vouchers?"}
        description={
          <div className="space-y-2">
            <p>
              {nl
                ? "Wilt de student 2 medewerkersbonnetjes gebruiken in ruil voor dit broodje?"
                : "Does the student want to use 2 staff vouchers for this sandwich?"}
            </p>
            {voucherCovers !== null && (
              <p>
                {nl
                  ? `Twee bonnetjes dekken één broodje: het duurste uit deze bestelling, ${formatEuro(voucherCovers)}. Geen opleg, geen geld terug.`
                  : `Two vouchers cover one sandwich: the most expensive in this order, ${formatEuro(voucherCovers)}. No surcharge, no change.`}
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
          setVoucherError(null);
        }}
      />
    </div>
  );
}

function PickupOrderPanel({ nl, order }: { nl: boolean; order: PickupOrder }) {
  const [status, setStatus] = useState(order.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mark() {
    startTransition(async () => {
      const res = await markPickedUpAction(order.orderId);
      if (res.ok) setStatus("PICKED_UP");
      else setError(res.error);
    });
  }

  const pickedUp = status === "PICKED_UP";
  // Te laat, maar niet verloren: het broodje mag nog over de toog. Enkel de
  // shifter hoort te weten dat de afhaal van die dag al voorbij was.
  const late = status === "NO_SHOW";
  // Twee bonnetjes zijn exact één broodje: het duurste uit deze bestelling.
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
                ? `${order.voucherRedemption.amount} bonnetjes (1 broodje)`
                : `${order.voucherRedemption.amount} vouchers (1 sandwich)`}
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
        {pickedUp ? (
          <div className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
            ✓ {nl ? "Opgehaald" : "Picked up"}
          </div>
        ) : (
          <Button onClick={mark} disabled={pending} className="w-full">
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
