"use client";

import { useId, useState, type ReactNode } from "react";
import { EVENT_MOMENTS_VISIBLE } from "@/lib/calendar/moments";

/**
 * De lijst dagen in het paneel van de eventpagina, ingeklapt tot de eerste
 * `EVENT_MOMENTS_VISIBLE`. De rijen zelf (met hun ster) worden op de server
 * gerenderd; de rijen voorbij die grens dragen `is-extra` en verdwijnen via CSS
 * zolang de lijst dicht is. Zonder JavaScript blijven ze dus gewoon staan.
 */
export function EventMomentsList({
  total,
  labels,
  children,
}: {
  total: number;
  labels: { more: string; less: string };
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const hidden = total - EVENT_MOMENTS_VISIBLE;

  return (
    <>
      <ol id={id} data-collapsed={!open && hidden > 0 ? "" : undefined}>
        {children}
      </ol>
      {hidden > 0 ? (
        <button
          type="button"
          className="vtk-event-moments-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? labels.less : labels.more}
        </button>
      ) : null}
    </>
  );
}
