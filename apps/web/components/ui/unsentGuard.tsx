"use client";

import type { ComponentProps } from "react";
import { unsentSaveMessage, unsentSaveReason } from "@/lib/unsentSave";

/**
 * Het vangnet voor een server action die de server nooit bereikte: een pagina
 * van vóór de laatste deploy ("Failed to find Server Action"), of geen
 * verbinding. Zie `lib/unsentSave.ts` voor het waarom.
 *
 * Zonder vangnet liep het op drie manieren mis, en alle drie komen voor:
 * - een fout in een action van een formulier of een transition belandt in de
 *   error boundary, die het hele scherm vervangt met alles wat er ingevuld was;
 * - React leegt een `<form action={...}>` zodra de action afloopt, dus enkel
 *   de fout opvangen is niet genoeg: het formulier staat dan alsnog leeg;
 * - een `await` in een klikhandler zonder `catch` faalt stil, en wie klikte,
 *   denkt dat het bewaard is.
 *
 * Daarom loopt elke aanroep van een action langs `unsentGuard` (of langs
 * `SaveForm`, `ActionForm` of `DeleteIconButton`, die het al doen):
 * - `unsentGuard.form(action)` voor `<form action>` en `formAction`;
 * - `unsentGuard.state(action)` voor `useActionState`;
 * - `unsentGuard.run(() => action(...))` voor een aanroep in code, met daarna
 *   `if (result === UNSENT) return;`;
 * - `unsentGuard.report(error)` bovenaan een `catch` die er al was.
 * Een fout die de server wél gooide, gaat ongewijzigd door naar de error
 * boundary en de monitoring, net als een `redirect()` uit de action.
 *
 * Gewone functies en geen hook, zodat ze ook passen in een formulier diep in
 * een lijst. De melding gaat als event naar de `ToastProvider`.
 */

/** Het event dat de `ToastProvider` opvangt en als rode toast toont. */
export const UNSENT_TOAST_EVENT = "vtk:unsent-save";

// ---------------------------------------------------------------------------
// Het formulier dat net verstuurd werd, om zijn reset te kunnen tegenhouden.
// ---------------------------------------------------------------------------

let lastSubmitted: HTMLFormElement | null = null;

// Eén luisteraar voor de hele pagina, gezet zodra deze module in de browser
// laadt: dus voor iemand op een knop kan drukken die er een action achter heeft.
if (typeof document !== "undefined") {
  document.addEventListener(
    "submit",
    (event) => {
      if (event.target instanceof HTMLFormElement) lastSubmitted = event.target;
    },
    true
  );
}

/**
 * Laat het formulier dat net verstuurd werd, staan zoals het is.
 *
 * React vraagt bij elke `<form action={...}>` een reset aan en voert die uit
 * met `form.reset()` zodra de action afloopt. Dat stuurt een `reset`-event dat
 * je mag annuleren, en dat doen we hier, één keer en enkel even: een reset die
 * de gebruiker later zelf vraagt, gaat gewoon door.
 */
function keepSubmittedForm() {
  const form = lastSubmitted;
  if (!form) return;
  const cancel = (event: Event) => event.preventDefault();
  form.addEventListener("reset", cancel, { once: true });
  setTimeout(() => form.removeEventListener("reset", cancel), 2000);
}

// ---------------------------------------------------------------------------
// Het vangnet.
// ---------------------------------------------------------------------------

/**
 * True wanneer de fout een niet-verstuurde opslag was: dan staat de melding er
 * al en blijft het formulier staan. False voor elke andere fout.
 */
function report(error: unknown): boolean {
  const reason = unsentSaveReason(error);
  if (!reason) return false;
  keepSubmittedForm();
  const english = document.documentElement.lang.toLowerCase().startsWith("en");
  const message = unsentSaveMessage(reason, english);
  // De provider annuleert het event wanneer ze de toast toont. Zonder provider
  // (de scanner, de linkpagina) blijft het staan, en dan toch iets zichtbaars.
  const unhandled = window.dispatchEvent(
    new CustomEvent(UNSENT_TOAST_EVENT, { detail: { message }, cancelable: true })
  );
  if (unhandled) window.alert(message);
  return true;
}

/**
 * Wat `unsentGuard.run` teruggeeft wanneer de action de server niet bereikte.
 * Een eigen teken en geen `undefined`: veel actions geven niets terug, en wie
 * na `await saveX()` een veld leegmaakt of een venster sluit, moet het verschil
 * kennen. Stop dan: `if (result === UNSENT) return;`.
 */
export const UNSENT: unique symbol = Symbol("unsent");

export const unsentGuard = {
  report,
  /** Roept een action aan; `UNSENT` wanneer ze de server niet bereikte (de melding staat er dan al). */
  run: async <T,>(call: () => Promise<T>): Promise<T | typeof UNSENT> => {
    try {
      return await call();
    } catch (error) {
      if (report(error)) return UNSENT;
      throw error;
    }
  },
  /** Voor `useActionState`: wat niet verstuurd werd, laat de vorige state staan. */
  state:
    <S, P extends unknown[]>(action: (previous: S, ...rest: P) => Promise<S>) =>
    async (previous: S, ...rest: P): Promise<S> => {
      try {
        return await action(previous, ...rest);
      } catch (error) {
        if (report(error)) return previous;
        throw error;
      }
    },
  /** Voor `<form action={...}>` en `formAction` op een knop. */
  form:
    <P extends unknown[]>(action: (...args: P) => unknown) =>
    async (...args: P): Promise<void> => {
      try {
        await action(...args);
      } catch (error) {
        if (!report(error)) throw error;
      }
    },
};

export type UnsentGuard = typeof unsentGuard;

/** Hetzelfde als `unsentGuard`, voor wie het liever als hook leest. */
export function useUnsentGuard(): UnsentGuard {
  return unsentGuard;
}

/**
 * `<form action={serverAction}>` met het vangnet, voor een servercomponent: die
 * kan zelf geen fout opvangen. Een server action mag als prop naar een
 * clientcomponent, dus `<form action={x}>` wordt `<ActionForm action={x}>`.
 */
export function ActionForm({
  action,
  ...props
}: Omit<ComponentProps<"form">, "action"> & { action: (formData: FormData) => unknown }) {
  return <form {...props} action={unsentGuard.form(action)} />;
}
