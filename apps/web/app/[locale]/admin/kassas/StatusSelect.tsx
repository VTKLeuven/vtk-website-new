"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { SaveState } from "@/lib/saveState";
import { SETTABLE_STATUSES, STATUS_SLUGS, statusLabel, type CashRegisterStatus } from "@/lib/kassas/kassa";

type SettableStatus = Exclude<CashRegisterStatus, "REQUESTED">;

/** Afstand tussen de chip en de lijst, en tussen de lijst en de schermrand. */
const GAP = 6;
const EDGE = 8;

/**
 * Zet de lijst onder de chip, of erboven wanneer er onderaan geen plaats is
 * (de laatste rijen van de tabel).
 *
 * `getBoundingClientRect` en `innerHeight` geven zichtbare pixels, `top` en
 * `offsetWidth` layoutpixels; onder de laptopzoom (0.9 op `:root`) schelen die
 * 10%. De verhouding van de chip rekent om; zonder zoom is ze 1.
 */
function place(trigger: HTMLElement, list: HTMLElement) {
  list.style.minWidth = `${trigger.offsetWidth}px`;
  const rect = trigger.getBoundingClientRect();
  const scale = trigger.offsetHeight > 0 ? rect.height / trigger.offsetHeight || 1 : 1;
  const size = list.getBoundingClientRect();
  const gap = GAP * scale;
  const edge = EDGE * scale;
  const below = window.innerHeight - rect.bottom - gap - edge;
  const above = rect.top - gap - edge;
  const up = size.height > below && above > below;
  const top = up ? Math.max(edge, rect.top - gap - size.height) : rect.bottom + gap;
  const left = Math.max(edge, Math.min(rect.left, window.innerWidth - size.width - edge));
  list.style.top = `${top / scale}px`;
  list.style.left = `${left / scale}px`;
}

/**
 * De status als keuzelijst, zoals de kolom in het rekenblad: een kassa gaat
 * vaak in één ronde van "teruggebracht" naar "geteld", en dan is een klik per
 * rij sneller dan elke kassa openen. Kiezen is opslaan; de toast zegt of het
 * lukte, en bij een fout springt de lijst terug.
 *
 * Enkel na de aanvaarding: van "aangevraagd" naar verder gaat via aanvaarden,
 * want dan vertrekt de mail. De kleur per status is die van het rekenblad
 * (`.vtk-kassa-status`), zodat Beheer de kolom nog op kleur leest.
 *
 * Bewust geen native `<select>`: daarin tekent het besturingssysteem de opties,
 * dus de kleur stond enkel op de gekozen waarde en niet in de lijst. Hier staat
 * elke optie als haar eigen chip, zoals in het rekenblad. De lijst is een
 * `popover`: die hangt in de top layer, zodat de tabel (`overflow-x: auto`, in
 * een kaart met `overflow: hidden`) haar niet afknipt, terwijl ze in de DOM
 * onder de rij blijft en `data-row-action` de klik dus nog van de rij houdt.
 */
export function StatusSelect({
  id,
  status,
  action,
  locale,
  label,
  errorMessages,
}: {
  id: string;
  status: SettableStatus;
  action: (formData: FormData) => Promise<SaveState>;
  locale: "nl" | "en";
  /** Voor de screenreader: "Status: Croque bar". */
  label: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const listId = `${useId()}-status`;
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, SETTABLE_STATUSES.indexOf(value));
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const trigger = buttonRef.current;
    const list = listRef.current;
    if (!open || !trigger || !list) return;
    list.showPopover();
    place(trigger, list);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    // De lijst hangt vast aan het scherm, de chip scrolt mee met de pagina.
    let frame = 0;
    function follow() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (buttonRef.current && listRef.current) place(buttonRef.current, listRef.current);
      });
    }
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  function save(next: SettableStatus) {
    const previous = value;
    setValue(next);
    const form = new FormData();
    form.append("id", id);
    form.append("status", next);
    startTransition(async () => {
      const result = await action(form);
      if (result.status === "error") {
        setValue(previous);
        showToast({
          message: errorMessages[result.code] ?? result.detail ?? (nl ? "Status niet gewijzigd." : "Status not changed."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? `Status: ${statusLabel(next, true).toLowerCase()}.` : `Status: ${statusLabel(next, false).toLowerCase()}.`,
        variant: "success",
      });
      router.refresh();
    });
  }

  function choose(next: SettableStatus) {
    setOpen(false);
    buttonRef.current?.focus();
    if (next !== value) save(next);
  }

  function openAt(index: number) {
    setHighlighted(index);
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const count = SETTABLE_STATUSES.length;
    if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openAt(selectedIndex);
      setHighlighted((highlighted + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openAt(event.key === "Home" ? 0 : count - 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(SETTABLE_STATUSES[highlighted]);
      return;
    }
    // Een letter springt naar de volgende status die ermee begint, zoals in een
    // native lijst. Hij kiest niet meteen: kiezen is hier opslaan.
    if (event.key.length === 1 && event.key !== " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const letter = event.key.toLocaleLowerCase(locale);
      const start = open ? highlighted : selectedIndex;
      for (let step = 1; step <= count; step++) {
        const index = (start + step) % count;
        if (statusLabel(SETTABLE_STATUSES[index], nl).toLocaleLowerCase(locale).startsWith(letter)) {
          openAt(index);
          return;
        }
      }
    }
  }

  return (
    <span data-row-action className="vtk-kassa-status-select" data-open={open || undefined}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
        disabled={pending}
        data-status={STATUS_SLUGS[value]}
        className="vtk-kassa-status vtk-kassa-status-trigger"
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleKeyDown}
      >
        {/* Alle labels op elkaar, enkel het gekozen zichtbaar: zo is de chip zo
            breed als het langste label, net als een native lijst, en verspringt
            de kolom niet wanneer de status wijzigt. */}
        <span className="vtk-kassa-status-value">
          {SETTABLE_STATUSES.map((option) => (
            <span key={option} data-current={option === value || undefined}>
              {statusLabel(option, nl)}
            </span>
          ))}
        </span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          popover="manual"
          role="listbox"
          aria-label={label}
          className="vtk-kassa-status-menu"
          // De focus blijft op de chip (aria-activedescendant); anders sluit een
          // klik op een optie de lijst al voor die klik aankomt.
          onMouseDown={(event) => event.preventDefault()}
        >
          {SETTABLE_STATUSES.map((option, index) => (
            <button
              key={option}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={option === value}
              data-highlighted={index === highlighted || undefined}
              onPointerMove={() => setHighlighted(index)}
              onClick={() => choose(option)}
            >
              <span className="vtk-kassa-status vtk-kassa-status-chip" data-status={STATUS_SLUGS[option]}>
                {statusLabel(option, nl)}
              </span>
              {option === value ? <Check aria-hidden="true" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
