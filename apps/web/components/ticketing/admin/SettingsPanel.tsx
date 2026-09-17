"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Eén uitklapbaar venster op de instellingen van een ticketevent.
 *
 * Bestond al als losse markup voor "Beschrijving en adres" en drie andere
 * blokken; die stond vier keer met de hand uitgeschreven terwijl de helft van
 * het scherm uit vaste, altijd open secties bestond. Nu is elk blok hetzelfde
 * venster, met de titel en een statusregel in de kop, zodat je een dicht venster
 * niet hoeft te openen om te weten wat erin staat.
 *
 * **De diepe link is het hele punt van het `id`.** Het eventdashboard linkt naar
 * `/instellingen#tickettype-aanmaken`, en het formulier zelf doet dat ook wanneer
 * publiceren afketst op een ontbrekend tickettype. Landt zo'n link op een
 * gesloten venster, dan lijkt de link kapot. Vandaar: bij het laden en bij elke
 * hashwijziging het venster openzetten wanneer het doel erin ligt.
 *
 * Bewust geen `name`-attribuut (de accordeonvariant van `<details>`): die sluit
 * het vorige venster, en in een formulier waar je tussen twee blokken heen en
 * weer werkt is dat precies verkeerd.
 */
export function SettingsPanel({
  id,
  title,
  status,
  icon,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  /** Korte samenvatting in de kop, leesbaar zonder het venster te openen. */
  status?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function openForHash() {
      const hash = window.location.hash.slice(1);
      const panel = ref.current;
      if (!hash || !panel) return;
      const target = document.getElementById(hash);
      if (!target || !panel.contains(target)) return;
      panel.open = true;
      // Na het openklappen staat het doel op een andere plaats dan waar de
      // browser net naartoe sprong, dus zelf nog eens richten.
      target.scrollIntoView({ block: "start" });
    }

    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, []);

  return (
    <details ref={ref} id={id} className="ticket-admin-settings-disclosure" open={defaultOpen}>
      <summary>
        {icon}
        {title}
        {status ? <small>{status}</small> : null}
      </summary>
      <div className="ticket-admin-settings-content">{children}</div>
    </details>
  );
}
