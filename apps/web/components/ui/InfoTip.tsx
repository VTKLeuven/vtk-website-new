"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { InfoIcon } from "@/components/ui/icons";

/** Afstand tussen het icoon en de uitleg, en tussen de uitleg en de schermrand. */
const GAP = 6;
const EDGE = 8;
/**
 * Een muis die over het icoon schuift, opent nog niets; een muis op weg van
 * het icoon naar de uitleg (om een link erin te volgen) sluit ze nog niet.
 */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

/**
 * Zet de uitleg onder het icoon, of erboven wanneer er onderaan geen plaats is,
 * en schuift ze binnen het scherm. Zoals in `StatusSelect`: onder de laptopzoom
 * (0.9 op `:root`) rekent de verhouding van het icoon zichtbare pixels om naar
 * layoutpixels.
 */
function place(trigger: HTMLElement, panel: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const scale = trigger.offsetHeight > 0 ? rect.height / trigger.offsetHeight || 1 : 1;
  const size = panel.getBoundingClientRect();
  const gap = GAP * scale;
  const edge = EDGE * scale;
  const below = window.innerHeight - rect.bottom - gap - edge;
  const above = rect.top - gap - edge;
  const up = size.height > below && above > below;
  const top = up ? Math.max(edge, rect.top - gap - size.height) : rect.bottom + gap;
  const left = Math.max(edge, Math.min(rect.left + rect.width / 2 - size.width / 2, window.innerWidth - size.width - edge));
  panel.style.top = `${top / scale}px`;
  panel.style.left = `${left / scale}px`;
}

/**
 * Een "i" met uitleg erachter: wat een scherm aanneemt, welke kolommen een
 * bestand moet hebben, waarom iets zo telt. Voor wat te lang is om onder een
 * veld te zetten, maar wat je wel wil kunnen nalezen.
 *
 * Met de muis opent de uitleg bij het hoveren en sluit ze bij het weggaan; een
 * klik zet ze vast, zodat ze ook op een telefoon werkt (daar hovert niets) en je
 * een link erin kan aanklikken. Escape of een klik ernaast sluit ze. Met het
 * toetsenbord opent ze bij de focus.
 *
 * Geen `title`: die tooltip toont enkel platte tekst, pas na een seconde, en
 * nooit op een telefoon. De uitleg is een `popover` in de top layer, zodat een
 * tabel of kaart met `overflow` ze niet afknipt.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  /** Waarover de uitleg gaat, voor de screenreader: "Welke kolommen de site verwacht". */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const panelId = `${useId()}-info`;
  const [open, setOpen] = useState<"hover" | "pinned" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const later = useCallback((next: () => void, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(next, delay);
  }, []);
  const cancel = useCallback(() => window.clearTimeout(timer.current), []);
  useEffect(() => cancel, [cancel]);

  useLayoutEffect(() => {
    const trigger = buttonRef.current;
    const panel = panelRef.current;
    if (!open || !trigger || !panel) return;
    if (!panel.matches(":popover-open")) panel.showPopover();
    place(trigger, panel);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    // De uitleg hangt vast aan het scherm, het icoon scrolt mee met de pagina.
    let frame = 0;
    function follow() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (buttonRef.current && panelRef.current) place(buttonRef.current, panelRef.current);
      });
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  const hoverIn = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (open) cancel();
    else later(() => setOpen((current) => current ?? "hover"), OPEN_DELAY);
  };
  const hoverOut = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (open === "pinned") return;
    later(() => setOpen((current) => (current === "hover" ? null : current)), CLOSE_DELAY);
  };

  return (
    <span className={["inline-flex align-middle", className ?? ""].join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open !== null}
        aria-controls={panelId}
        aria-describedby={open ? panelId : undefined}
        data-row-action
        className={[
          "grid size-5 place-items-center rounded-full text-vtk-muted transition-colors hover:text-vtk-ink focus-visible:text-vtk-ink",
          open === "pinned" ? "text-vtk-ink" : "",
        ].join(" ")}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setOpen((current) => current ?? "hover");
        }}
        onBlur={(event) => {
          if (panelRef.current?.contains(event.relatedTarget as Node | null)) return;
          setOpen((current) => (current === "hover" ? null : current));
        }}
        onClick={() => {
          cancel();
          setOpen((current) => (current === "pinned" ? null : "pinned"));
        }}
      >
        <InfoIcon />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          popover="manual"
          role="tooltip"
          aria-label={label}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          className="vtk-info-tip fixed inset-auto m-0 w-max max-w-[min(26rem,calc(100%-16px))] space-y-2 rounded-xl border border-vtk-blue/15 bg-white p-3 text-left text-xs leading-relaxed font-normal text-vtk-ink normal-case tracking-normal shadow-[0_12px_28px_rgb(10_15_31/0.14)]"
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
