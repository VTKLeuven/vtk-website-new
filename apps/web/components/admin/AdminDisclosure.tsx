"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Een beheerkaart die dichtgeklapt begint: de kop (naam, status, een korte
 * samenvatting) staat altijd in beeld, de velden pas na een klik.
 *
 * Voor een lijst van blokken die samen meer dan een schermhoogte innemen (de
 * frontpages, de slogans): open was dat een muur van formulieren waarin je het
 * blok dat je zocht niet meer terugvond. Zie CLAUDE.md, "Admin".
 *
 * De inhoud wordt pas gemount wanneer de kaart voor het eerst opengaat, en blijft
 * daarna staan: een voorbeeld-iframe laadt zo niet voor elke kaart tegelijk, en
 * wat je half ingevuld had, is er nog wanneer je de kaart dicht- en weer
 * openklapt.
 */
export function AdminDisclosure({
  summary,
  actions,
  defaultOpen = false,
  variant = "card",
  className,
  children,
}: {
  /** De kop: altijd zichtbaar, en het klikvlak dat de kaart open- en dichtklapt. */
  summary: ReactNode;
  /**
   * Knoppen die ook dichtgeklapt bruikbaar horen te zijn (aan/uit, verplaatsen,
   * verwijderen). Ze staan naast de uitklapknop en niet erin.
   */
  actions?: ReactNode;
  defaultOpen?: boolean;
  /**
   * `card` staat op zichzelf op de pagina; `row` is een item binnen een kaart
   * (een slogan in de lijst), met enkel een rand: geen kaart in een kaart.
   */
  variant?: "card" | "row";
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={[
        variant === "card"
          ? "rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated shadow-[0_10px_30px_-24px_rgba(10,15,31,0.35)]"
          : "rounded-xl border border-vtk-blue/15 bg-white",
        className ?? "",
      ].join(" ")}
    >
      <div className={`flex items-start gap-3 ${variant === "card" ? "px-5 py-4" : "px-4 py-3"}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
            setMounted(true);
          }}
          className="-m-2 flex min-w-0 flex-1 items-start gap-3 rounded-xl p-2 text-left hover:bg-vtk-blue-soft/40"
        >
          <ChevronDown
            aria-hidden="true"
            size={18}
            className={`mt-0.5 shrink-0 text-[#5c667f] transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="block min-w-0 flex-1">{summary}</span>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {mounted ? (
        <div
          id={panelId}
          hidden={!open}
          className={`border-t border-vtk-blue/10 ${variant === "card" ? "px-5 pb-5 pt-4" : "px-4 pb-4 pt-3"}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
