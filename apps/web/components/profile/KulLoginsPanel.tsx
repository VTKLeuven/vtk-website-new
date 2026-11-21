"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@vtk/ui";
import { linkKul } from "@vtk/auth/client";
import { useToast } from "@/components/ui/toast";

/** Wat er gebeurde bij de vorige koppelpoging; de pagina leidt het af uit de URL. */
export type KulLinkOutcome =
  | { kind: "linked" }
  | { kind: "same" }
  | { kind: "taken" }
  | { kind: "failed"; code: string | null };

export type KulLoginRow = {
  id: string;
  /** Het r- of u-nummer, wanneer de login er een is. */
  accountName: string | null;
  linkedOn: string;
};

/**
 * De KU Leuven-logins van dit account, en een tweede erbij koppelen.
 *
 * Een doctoraatsstudent heeft een r-nummer (student.kuleuven.be) én een
 * u-nummer (kuleuven.be). Voor de site waren dat twee personen: wie met het
 * andere nummer inlogde, kwam op een tweede, leeg account terecht, zonder zijn
 * lidmaatschap, tickets of erelid. Na de koppeling landen beide op dit account.
 */
export function KulLoginsPanel({
  locale,
  logins,
  returnPath,
  outcome,
}: {
  locale: "nl" | "en";
  logins: KulLoginRow[];
  /** /account of /en/account: waar KU Leuven het lid na de koppeling terugzet. */
  returnPath: string;
  outcome: KulLinkOutcome | null;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  // De uitkomst één keer melden en dan uit de URL halen, zodat herladen ze niet
  // opnieuw toont.
  useEffect(() => {
    if (!outcome || shown.current) return;
    shown.current = true;
    const message = outcomeMessage(outcome, nl);
    showToast({
      message,
      variant: outcome.kind === "linked" ? "success" : outcome.kind === "same" ? "warning" : "error",
      ...(outcome.kind === "linked" ? {} : { duration: 0 }),
    });
    const url = new URL(window.location.href);
    for (const key of ["kul", "voor", "error", "error_description"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [outcome, nl, showToast]);

  async function startLink() {
    setBusy(true);
    try {
      await linkKul(returnPath, logins.length);
    } catch {
      setBusy(false);
      showToast({
        message: nl
          ? "KU Leuven kon niet geopend worden. Controleer je verbinding en probeer opnieuw."
          : "KU Leuven could not be opened. Check your connection and try again.",
        variant: "error",
        duration: 0,
      });
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-vtk-ink">
        {nl ? "KU Leuven-logins" : "KU Leuven logins"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5c667f]">
        {nl
          ? "Heb je naast je r-nummer ook een u-nummer, bijvoorbeeld als doctoraatsstudent of omdat je aan de KU Leuven werkt? Koppel het hier. Dan kom je met beide op dit account terecht, met je lidmaatschap, tickets en erelidmaatschap."
          : "Do you have a u-number besides your r-number, for instance as a PhD student or because you work at KU Leuven? Link it here. Both then sign you in to this account, with your membership, tickets and honorary membership."}
      </p>

      {logins.length > 0 ? (
        <ul className="mt-4 divide-y divide-vtk-blue/12 text-sm text-[#34405e]">
          {logins.map((login) => (
            <li key={login.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="font-medium">
                {login.accountName ?? (nl ? "KU Leuven-login" : "KU Leuven login")}
              </span>
              <span className="text-[#5c667f]">
                {nl ? `Gekoppeld op ${login.linkedOn}` : `Linked on ${login.linkedOn}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#34405e]">
          {nl ? "Nog geen KU Leuven-login gekoppeld." : "No KU Leuven login linked yet."}
        </p>
      )}

      <p className="mt-3 text-xs leading-5 text-[#5c667f]">
        {nl
          ? "KU Leuven vraagt je opnieuw in te loggen. Kies daar het andere account dan waarmee je nu ingelogd bent."
          : "KU Leuven asks you to sign in again. Choose the other account there, not the one you are signed in with now."}
      </p>

      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={startLink}
        className="mt-4 min-h-10 cursor-pointer rounded-full border border-vtk-ink bg-vtk-ink px-4 py-2 text-sm font-medium text-vtk-surface transition-colors hover:bg-vtk-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink disabled:cursor-wait disabled:opacity-70"
      >
        {busy
          ? nl
            ? "KU Leuven openen..."
            : "Opening KU Leuven..."
          : logins.length > 0
            ? nl
              ? "Nog een KU Leuven-login koppelen"
              : "Link another KU Leuven login"
            : nl
              ? "KU Leuven-login koppelen"
              : "Link a KU Leuven login"}
      </button>
    </Card>
  );
}

function outcomeMessage(outcome: KulLinkOutcome, nl: boolean): string {
  switch (outcome.kind) {
    case "linked":
      return nl
        ? "Gekoppeld. Met die KU Leuven-login kom je voortaan op dit account."
        : "Linked. That KU Leuven login now signs you in to this account.";
    case "same":
      return nl
        ? "Er kwam geen login bij: je logde bij KU Leuven in met een account dat al gekoppeld is. Probeer opnieuw en kies je andere nummer."
        : "No login was added: you signed in at KU Leuven with an account that is already linked. Try again and choose your other number.";
    case "taken":
      return nl
        ? "Niet gekoppeld: die KU Leuven-login hangt al aan een ander VTK-account. Mail it@vtk.be met je twee nummers, dan zetten we ze samen."
        : "Not linked: that KU Leuven login already belongs to another VTK account. Email it@vtk.be with both numbers and we will merge them.";
    case "failed":
      return nl
        ? `Niet gekoppeld. Probeer opnieuw; lukt het niet, mail it@vtk.be${outcome.code ? ` met de foutcode ${outcome.code}` : ""}.`
        : `Not linked. Try again; if it keeps failing, email it@vtk.be${outcome.code ? ` with the error code ${outcome.code}` : ""}.`;
  }
}
