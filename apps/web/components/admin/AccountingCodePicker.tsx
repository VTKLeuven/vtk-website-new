"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  filterAccountingCodeGroups,
  groupAccountingCodes,
  subSuffix,
  type AccountingCodeOption,
} from "@/lib/accounting/codes";

/**
 * Scrol enkel de lijst, niet de pagina: `scrollIntoView` schuift ook elke
 * voorouder mee, en dan springt het hele formulier bij het openen. Werkt met
 * `offsetTop` en `clientHeight`, die allebei in layoutpixels staan, zodat de
 * zoom van 90% op een laptop er niets aan verschuift (zie CLAUDE.md).
 */
function scrollWithin(list: HTMLElement | null, item: HTMLElement | null, mode: "center" | "nearest") {
  if (!list || !item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (mode === "center") {
    list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2;
  } else if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

/** Eén kiesbare rij in de lijst zoals ze nu getoond wordt; "" = geen code. */
type Row = { key: string; value: string };

/**
 * De keuze van een boekhoudcode, met zoekveld.
 *
 * Een gewone keuzelijst met zeventig codes onder elkaar is niet te doorzoeken:
 * wie "internationaal" zoekt, scrolt. Hier tik je "internationaal" en zie je
 * enkel die hoofdrekening met haar subcodes; tik je "cantus", dan zie je de
 * Cantussen van Activiteiten én van Internationaal, elk onder hun eigen kop.
 *
 * De codes staan per hoofdrekening, met een lijn tussen twee hoofdrekeningen.
 * Een subcode toont enkel haar eigen vijf cijfers: de hoofdrekening staat er
 * vlak boven, en de volledige code van elf cijfers herhalen maakte de lijst
 * onleesbaar. Een hoofdrekening is zelf ook te kiezen, want niet elke verkoop
 * heeft een subcode.
 *
 * De waarde gaat als gewoon formulierveld mee (`name`), zodat de server action
 * dezelfde FormData krijgt als bij een native select.
 */
export function AccountingCodePicker({
  codes,
  name,
  id,
  defaultValue = null,
  required = false,
  noneLabel,
  locale,
}: {
  codes: AccountingCodeOption[];
  name: string;
  id?: string;
  defaultValue?: string | null;
  required?: boolean;
  /**
   * Een rij bovenaan voor "geen code" (een sjabloon dat de keuze aan de maker
   * laat, of het lidgeld dat op 730000 terugvalt). Weglaten bij een verplichte
   * keuze.
   */
  noneLabel?: string;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const searchId = `${triggerId}-search`;

  const [value, setValue] = useState<string>(
    defaultValue && codes.some((code) => code.id === defaultValue) ? defaultValue : "",
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupAccountingCodes(codes), [codes]);
  const visible = useMemo(() => filterAccountingCodeGroups(groups, query), [groups, query]);
  const selected = codes.find((code) => code.id === value) ?? null;
  const selectedParent = selected?.parentId
    ? (codes.find((code) => code.id === selected.parentId) ?? null)
    : null;

  // De kiesbare rijen in schermvolgorde: daarop lopen de pijltjestoetsen.
  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    if (noneLabel && !query.trim()) list.push({ key: "none", value: "" });
    for (const group of visible) {
      list.push({ key: group.main.id, value: group.main.id });
      for (const child of group.children) list.push({ key: child.id, value: child.id });
    }
    return list;
  }, [visible, noneLabel, query]);
  const rowIndex = new Map(rows.map((row, index) => [row.key, index]));

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  // De gemarkeerde rij in beeld houden terwijl je met de pijltjes door een
  // lange lijst loopt.
  useEffect(() => {
    if (!open) return;
    scrollWithin(
      listRef.current,
      listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`) ?? null,
      "nearest",
    );
  }, [highlighted, open]);

  function openList() {
    setQuery("");
    const current = rows.findIndex((row) => row.value === value);
    setHighlighted(current >= 0 ? current : 0);
    setOpen(true);
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      // De gekozen code in het midden, met haar hoofdrekening erboven in beeld.
      scrollWithin(
        listRef.current,
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null,
        "center",
      );
    });
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(next: string) {
    setValue(next);
    setInvalid(false);
    close(true);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) => (current + step + rows.length) % rows.length);
      return;
    }
    if (event.key === "Enter") {
      // Nooit het hele formulier versturen vanuit het zoekveld.
      event.preventDefault();
      const row = rows[highlighted];
      if (row) choose(row.value);
      return;
    }
    if (event.key === "Tab") close(false);
  }

  /** Wat elke optie draagt, buiten haar handlers: die staan inline in de JSX. */
  function optionAttributes(row: Row) {
    const index = rowIndex.get(row.key) ?? 0;
    return {
      id: `${listId}-${index}`,
      "data-index": index,
      type: "button" as const,
      role: "option",
      tabIndex: -1,
      "aria-selected": row.value === value,
      "data-highlighted": index === highlighted || undefined,
    };
  }
  const indexOf = (key: string) => rowIndex.get(key) ?? 0;
  // Focus blijft in het zoekveld, zodat de pijltjes en Enter blijven werken.
  const keepFocus = (event: ReactPointerEvent) => event.preventDefault();

  const placeholder = noneLabel ?? (nl ? "Kies een boekhoudcode" : "Choose an accounting code");

  return (
    <div
      ref={rootRef}
      className="vtk-code-picker"
      data-open={open || undefined}
      data-invalid={invalid || undefined}
    >
      {/* Het formulierveld zelf. Niet `readOnly` en niet `type="hidden"`:
          beide slaan de browservalidatie van `required` over. Het staat
          buiten beeld in een eigen, afgesneden vakje. */}
      <span className="vtk-code-picker-value">
        <input
          name={name}
          value={value}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden="true"
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            openList();
          }}
        />
      </span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="vtk-code-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openList();
          }
        }}
      >
        {selected ? (
          <span className="vtk-code-picker-current">
            <span className="vtk-code-picker-code">{selected.code}</span>
            <span className="vtk-code-picker-name">{selected.name}</span>
            {selectedParent ? (
              <span className="vtk-code-picker-parent">{selectedParent.name}</span>
            ) : null}
          </span>
        ) : (
          <span className="vtk-code-picker-placeholder">{placeholder}</span>
        )}
        <ChevronDown aria-hidden="true" size={17} />
      </button>
      {invalid && !open ? (
        <span className="vtk-code-picker-error" role="alert">
          {nl ? "Kies een boekhoudcode." : "Choose an accounting code."}
        </span>
      ) : null}

      {open ? (
        <div className="vtk-code-picker-popover">
          <div className="vtk-code-picker-search">
            <Search aria-hidden="true" size={16} />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              role="combobox"
              autoComplete="off"
              aria-label={nl ? "Zoek een boekhoudcode" : "Search an accounting code"}
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={rows.length > 0 ? `${listId}-${highlighted}` : undefined}
              placeholder={nl ? "Zoek op naam of code, bv. internationaal" : "Search by name or code, e.g. cantus"}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div ref={listRef} id={listId} className="vtk-code-picker-list" role="listbox">
            {noneLabel && !query.trim() ? (
              <button
                className="vtk-code-picker-none"
                {...optionAttributes(rows[0])}
                onPointerMove={() => setHighlighted(indexOf("none"))}
                onPointerDown={keepFocus}
                onClick={() => choose("")}
              >
                <span>{noneLabel}</span>
                {value === "" ? <Check aria-hidden="true" size={16} /> : null}
              </button>
            ) : null}
            {visible.map((group) => (
              <div
                key={group.main.id}
                className="vtk-code-picker-group"
                role="group"
                aria-label={`${group.main.code} ${group.main.name}`}
              >
                <button
                  className="vtk-code-picker-main"
                  {...optionAttributes({ key: group.main.id, value: group.main.id })}
                  onPointerMove={() => setHighlighted(indexOf(group.main.id))}
                  onPointerDown={keepFocus}
                  onClick={() => choose(group.main.id)}
                >
                  <span className="vtk-code-picker-code">{group.main.code}</span>
                  <span className="vtk-code-picker-name">{group.main.name}</span>
                  {value === group.main.id ? <Check aria-hidden="true" size={16} /> : null}
                </button>
                {group.children.map((child) => (
                  <button
                    key={child.id}
                    className="vtk-code-picker-sub"
                    aria-label={`${child.code} ${child.name}`}
                    {...optionAttributes({ key: child.id, value: child.id })}
                    onPointerMove={() => setHighlighted(indexOf(child.id))}
                    onPointerDown={keepFocus}
                    onClick={() => choose(child.id)}
                  >
                    <span className="vtk-code-picker-code">{subSuffix(child.code, group.main.code)}</span>
                    <span className="vtk-code-picker-name">{child.name}</span>
                    {value === child.id ? <Check aria-hidden="true" size={16} /> : null}
                  </button>
                ))}
              </div>
            ))}
            {visible.length === 0 ? (
              <p className="vtk-code-picker-empty">
                {nl ? `Geen boekhoudcode gevonden voor “${query.trim()}”.` : `No accounting code found for “${query.trim()}”.`}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
