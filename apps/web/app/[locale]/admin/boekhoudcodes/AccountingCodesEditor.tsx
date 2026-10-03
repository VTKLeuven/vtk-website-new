"use client";

import { useId, useMemo, useRef, useState, useTransition, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { GripIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import {
  createAccountingCodeAction,
  deleteAccountingCodeAction,
  reorderAccountingCodesAction,
  updateAccountingCodeAction,
} from "@/app/actions/accountingCodes";
import {
  filterAccountingCodeGroups,
  groupAccountingCodes,
  MAIN_CODE_DIGITS,
  MAX_ACCOUNTING_NAME,
  normalizeCodeInput,
  SUB_CODE_DIGITS,
  subCode,
  subSuffix,
  type AccountingCodeGroup,
  type AccountingCodeRow,
} from "@/lib/accounting/codes";

export type AccountingCodeUsageRow = AccountingCodeRow & {
  /** Ticketverkopen die deze code nu gekozen hebben. */
  ticketEvents: number;
  /** Ticketsjablonen die deze code voorstellen. */
  templates: number;
  /** Gaat deze code mee met het lidgeld? */
  membership: boolean;
};

type Locale = "nl" | "en";
type Group = AccountingCodeGroup<AccountingCodeUsageRow>;

/** Waar een gesleepte rij terechtkomt. */
type DropTarget =
  /** Een hoofdrekening, met heel haar groep, vóór of na een andere groep. */
  | { kind: "main"; groupId: string; place: "before" | "after" }
  /** Een subcode in de groep `parentId`, vóór `beforeId` of achteraan (null). */
  | { kind: "sub"; parentId: string; beforeId: string | null };

/** Een nieuwe volgorde die nog naar de server moet. */
type Move = {
  parentId: string | null;
  ids: string[];
  /** Gezet wanneer een subcode van hoofdrekening wisselt: dan verandert haar code. */
  moved?: { id: string; from: string; to: string; name: string; usage: number };
};

function copy(locale: Locale) {
  const nl = locale === "nl";
  return {
    search: nl ? "Zoeken" : "Search",
    searchPlaceholder: nl
      ? "Zoek op naam of code, bv. internationaal of 12002"
      : "Search by name or code, e.g. international or 12002",
    count: (shown: number, total: number) =>
      shown === total
        ? nl
          ? `${total} codes`
          : `${total} codes`
        : nl
          ? `${shown} van ${total} codes`
          : `${shown} of ${total} codes`,
    dragDisabled: nl
      ? "Slepen kan weer zodra de zoekterm leeg is."
      : "Dragging works again once the search is empty.",
    noResults: (query: string) =>
      nl ? `Geen code gevonden voor "${query}".` : `No code found for "${query}".`,
    addMain: nl ? "Hoofdrekening toevoegen" : "Add main account",
    addSub: nl ? "Subcode toevoegen" : "Add sub code",
    under: nl ? "Onder" : "Under",
    code: "Code",
    subCode: nl ? "Subcode" : "Sub code",
    name: nl ? "Naam" : "Name",
    usage: nl ? "Gebruikt door" : "Used by",
    actions: nl ? "Acties" : "Actions",
    move: nl ? "Verplaatsen" : "Move",
    moveHint: nl
      ? "Sleep om te verplaatsen, of gebruik de pijltjes omhoog en omlaag"
      : "Drag to move, or use the up and down arrows",
    edit: nl ? "Bewerken" : "Edit",
    add: nl ? "Toevoegen" : "Add",
    adding: nl ? "Toevoegen..." : "Adding...",
    added: nl ? "Code toegevoegd." : "Code added.",
    save: nl ? "Opslaan" : "Save",
    saving: nl ? "Opslaan..." : "Saving...",
    saved: nl ? "Code opgeslagen." : "Code saved.",
    cancel: nl ? "Annuleren" : "Cancel",
    failed: nl ? "Opslaan is mislukt." : "Saving failed.",
    delete: nl ? "Verwijderen" : "Delete",
    deleted: nl ? "Code verwijderd." : "Code deleted.",
    orderSaved: nl ? "Volgorde opgeslagen." : "Order saved.",
    orderFailed: nl
      ? "De volgorde is niet opgeslagen; de lijst staat terug zoals ze was."
      : "The order was not saved; the list is back as it was.",
    movedTo: (code: string) =>
      nl ? `Verplaatst. De code is nu ${code}.` : `Moved. The code is now ${code}.`,
    membership: nl ? "Lidgeld" : "Membership fee",
    templates: (count: number) =>
      nl
        ? `${count} ${count === 1 ? "sjabloon" : "sjablonen"}`
        : `${count} ${count === 1 ? "template" : "templates"}`,
    sales: (count: number) =>
      nl
        ? `${count} ${count === 1 ? "ticketverkoop" : "ticketverkopen"}`
        : `${count} ticket ${count === 1 ? "sale" : "sales"}`,
    fullCode: nl ? "In de betaalinfo" : "In the payment details",
    empty: nl
      ? "Er zijn nog geen codes. Voeg de eerste hoofdrekening toe."
      : "There are no codes yet. Add the first main account.",
    errors: {
      NAME_REQUIRED: nl ? "Vul een naam in." : "Enter a name.",
      INVALID_CODE: nl
        ? `Een hoofdrekening is precies ${MAIN_CODE_DIGITS} cijfers, bv. 700100.`
        : `A main account is exactly ${MAIN_CODE_DIGITS} digits, e.g. 700100.`,
      INVALID_SUBCODE: nl
        ? `Een subcode is precies ${SUB_CODE_DIGITS} cijfers, bv. 10002.`
        : `A sub code is exactly ${SUB_CODE_DIGITS} digits, e.g. 10002.`,
      INVALID_PARENT: nl
        ? "Kies een hoofdrekening: een subcode kan niet onder een andere subcode."
        : "Choose a main account: a sub code cannot hang under another sub code.",
      CODE_EXISTS: nl
        ? "Die code bestaat al onder deze hoofdrekening."
        : "That code already exists under this main account.",
      NOT_FOUND: nl
        ? "Deze code bestaat niet meer. Herlaad de pagina."
        : "This code no longer exists. Reload the page.",
      STALE_LIST: nl
        ? "De lijst is intussen elders gewijzigd. Herlaad de pagina en sleep opnieuw."
        : "The list was changed elsewhere in the meantime. Reload the page and drag again.",
    } as Record<string, string>,
  };
}

function usageLabel(row: AccountingCodeUsageRow, locale: Locale): string {
  const t = copy(locale);
  return [
    row.ticketEvents > 0 ? t.sales(row.ticketEvents) : null,
    row.templates > 0 ? t.templates(row.templates) : null,
    row.membership ? t.membership : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Wat er weg is en wat blijft, voor de bevestiging van het verwijderen. */
function deleteDescription(
  row: AccountingCodeUsageRow,
  children: AccountingCodeUsageRow[],
  locale: Locale,
): string {
  const nl = locale === "nl";
  const events = row.ticketEvents + children.reduce((sum, child) => sum + child.ticketEvents, 0);
  const membership = row.membership || children.some((child) => child.membership);
  const templates = row.templates + children.reduce((sum, child) => sum + child.templates, 0);
  const parts = [
    nl
      ? `${row.code} ${row.name} verdwijnt uit de keuzelijst.`
      : `${row.code} ${row.name} disappears from the list.`,
    children.length > 0
      ? nl
        ? `De ${children.length} ${children.length === 1 ? "subcode eronder gaat" : "subcodes eronder gaan"} mee.`
        : `The ${children.length} sub ${children.length === 1 ? "code" : "codes"} under it go too.`
      : null,
    events > 0
      ? nl
        ? `${events} ${events === 1 ? "ticketverkoop staat" : "ticketverkopen staan"} op ${children.length > 0 ? "deze codes" : "deze code"}: nieuwe bestellingen daarvan gaan zonder code naar Mollie en Bancontact tot iemand een andere kiest, en opnieuw publiceren vraagt er een.`
        : `${events} ticket ${events === 1 ? "sale uses" : "sales use"} ${children.length > 0 ? "these codes" : "this code"}: their new orders go to Mollie and Bancontact without a code until someone picks another, and publishing again asks for one.`
      : null,
    templates > 0
      ? nl
        ? `${templates} ${templates === 1 ? "sjabloon stelt" : "sjablonen stellen"} ze voor; die staan daarna zonder code.`
        : `${templates} ${templates === 1 ? "template suggests" : "templates suggest"} it; they are left without a code.`
      : null,
    membership
      ? nl
        ? "Het lidgeld valt terug op 730000 Lidgelden, of op geen code als je die net verwijdert."
        : "The membership fee falls back to 730000, or to no code if that is the one you delete."
      : null,
    nl
      ? "Wat al verkocht is, houdt de code waaronder het betaald werd, ook in de statistieken."
      : "What has been sold keeps the code it was paid under, in the statistics too.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Een klik op een knop of veld in de rij is geen klik op de rij. */
function fromControl(event: MouseEvent): boolean {
  return Boolean((event.target as HTMLElement).closest("button, a, input, select, textarea, label"));
}

/**
 * De velden van een code, voor toevoegen en bewerken. Een subcode toont de
 * hoofdrekening vóór haar eigen vijf cijfers, en daaronder de volledige code
 * zoals ze in de betaalinfo komt: dat is wat de penning moet controleren.
 */
function CodeFields({
  locale,
  mains,
  row,
  parentId: initialParentId,
}: {
  locale: Locale;
  mains: AccountingCodeUsageRow[];
  /** Leeg bij een nieuwe code. */
  row?: AccountingCodeUsageRow;
  /** Null voor een hoofdrekening. */
  parentId: string | null;
}) {
  const t = copy(locale);
  const id = useId();
  const [parentId, setParentId] = useState(initialParentId);
  const [code, setCode] = useState(row ? (initialParentId ? subSuffix(row.code) : row.code) : "");
  const parent = parentId ? (mains.find((main) => main.id === parentId) ?? null) : null;
  const typed = normalizeCodeInput(code);
  const suffix = parent && typed.length > SUB_CODE_DIGITS && typed.startsWith(parent.code)
    ? typed.slice(parent.code.length)
    : typed;

  return (
    <div className="vtk-codes-fields" data-sub={parent ? "true" : undefined}>
      {parent ? (
        <div className="vtk-codes-field">
          <label htmlFor={`${id}-parent`}>{t.under}</label>
          <select
            id={`${id}-parent`}
            name="parentId"
            value={parentId ?? ""}
            onChange={(event) => setParentId(event.target.value)}
          >
            {mains.map((main) => (
              <option key={main.id} value={main.id}>
                {main.code} {main.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="vtk-codes-field" data-narrow="true">
        <label htmlFor={`${id}-code`}>{parent ? t.subCode : t.code}</label>
        <input
          id={`${id}-code`}
          name="code"
          inputMode="numeric"
          autoComplete="off"
          required
          autoFocus={!row}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={parent ? "10001" : "700100"}
        />
      </div>
      <div className="vtk-codes-field" data-grow="true">
        <label htmlFor={`${id}-name`}>{t.name}</label>
        <input
          id={`${id}-name`}
          name="name"
          required
          autoFocus={Boolean(row)}
          maxLength={MAX_ACCOUNTING_NAME}
          defaultValue={row?.name ?? ""}
        />
      </div>
      {parent ? (
        <p className="vtk-codes-full">
          {t.fullCode}:{" "}
          <strong>{subCode(parent.code, suffix || "·····")}</strong>
        </p>
      ) : null}
    </div>
  );
}

function EditRow({
  locale,
  row,
  mains,
  childRows,
  onDone,
}: {
  locale: Locale;
  row: AccountingCodeUsageRow;
  mains: AccountingCodeUsageRow[];
  childRows: AccountingCodeUsageRow[];
  onDone: () => void;
}) {
  const t = copy(locale);
  const nl = locale === "nl";
  return (
    <tr className="vtk-codes-form-row" data-sub={row.parentId ? "true" : undefined}>
      <td colSpan={5}>
        <div className="vtk-codes-form">
          <SaveForm
            action={updateAccountingCodeAction}
            submitLabel={t.save}
            savingLabel={t.saving}
            savedMessage={t.saved}
            errorMessages={t.errors}
            fallbackErrorMessage={t.failed}
            resetOnSuccess={false}
            onSuccess={onDone}
            footer={({ submitButton }) => (
              <div className="vtk-codes-form-actions">
                {submitButton}
                <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                  {t.cancel}
                </Button>
              </div>
            )}
          >
            <input type="hidden" name="id" value={row.id} />
            <CodeFields locale={locale} mains={mains} row={row} parentId={row.parentId} />
            <p className="vtk-codes-form-hint">
              {nl
                ? `${childRows.length > 0 ? `Verander je de code, dan verhuizen de ${childRows.length} subcodes mee. ` : ""}Verkochte tickets houden de code en de naam waaronder ze betaald zijn; ticketverkopen met deze code gebruiken de nieuwe vanaf hun volgende bestelling.`
                : `${childRows.length > 0 ? `If you change the code, its ${childRows.length} sub codes move along. ` : ""}Sold tickets keep the code and name they were paid under; ticket sales using this code use the new one from their next order.`}
            </p>
          </SaveForm>
          <div className="vtk-codes-form-delete">
            <DeleteButton
              action={deleteAccountingCodeAction}
              fields={{ id: row.id }}
              title={nl ? `${row.code} ${row.name} verwijderen?` : `Delete ${row.code} ${row.name}?`}
              description={deleteDescription(row, childRows, locale)}
              confirmLabel={t.delete}
              cancelLabel={t.cancel}
              successMessage={t.deleted}
              errorMessages={t.errors}
              errorFallback={t.failed}
            >
              {t.delete}
            </DeleteButton>
          </div>
        </div>
      </td>
    </tr>
  );
}

function NewRow({
  locale,
  mains,
  parentId,
  onDone,
}: {
  locale: Locale;
  mains: AccountingCodeUsageRow[];
  parentId: string | null;
  onDone: () => void;
}) {
  const t = copy(locale);
  return (
    <tr className="vtk-codes-form-row" data-sub={parentId ? "true" : undefined} data-new="true">
      <td colSpan={5}>
        <div className="vtk-codes-form">
          <SaveForm
            action={createAccountingCodeAction}
            submitLabel={t.add}
            savingLabel={t.adding}
            savedMessage={t.added}
            errorMessages={t.errors}
            fallbackErrorMessage={t.failed}
            onSuccess={onDone}
            footer={({ submitButton }) => (
              <div className="vtk-codes-form-actions">
                {submitButton}
                <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                  {t.cancel}
                </Button>
              </div>
            )}
          >
            <CodeFields locale={locale} mains={mains} parentId={parentId} />
          </SaveForm>
        </div>
      </td>
    </tr>
  );
}

/**
 * Het rekeningstelsel als register, zoals het rekenblad van de penning: elke
 * hoofdrekening als kop met haar subcodes ingesprongen eronder, één regel per
 * code. Slepen ordent de lijst (en die volgorde volgt de keuzelijst bij een
 * ticketverkoop); een klik op een rij bewerkt ze ter plaatse.
 *
 * Een subcode in een andere groep neerzetten verandert haar code, en dus wat er
 * in de betaalinfo komt. Dat gebeurt pas na een bevestiging die de nieuwe code
 * noemt. Een hoofdrekening wordt door slepen nooit een subcode: dan zou haar
 * code van lengte veranderen.
 */
export function AccountingCodesEditor({
  locale,
  codes,
}: {
  locale: Locale;
  codes: AccountingCodeUsageRow[];
}) {
  const t = copy(locale);
  const nl = locale === "nl";
  const showToast = useToast();
  const [, startTransition] = useTransition();

  // Lokaal, zodat een gesleepte rij meteen op haar nieuwe plaats staat. Komt er
  // een nieuwe lijst van de server (na opslaan), dan wint die.
  const [prevCodes, setPrevCodes] = useState(codes);
  const [rows, setRows] = useState(codes);
  if (codes !== prevCodes) {
    setPrevCodes(codes);
    setRows(codes);
  }

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; parentId: string | null } | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [confirmMove, setConfirmMove] = useState<Move | null>(null);
  const gripRefs = useRef(new Map<string, HTMLButtonElement>());

  const groups = useMemo(() => groupAccountingCodes(rows), [rows]);
  const visible = useMemo(() => filterAccountingCodeGroups(groups, query), [groups, query]);
  const mains = groups.map((group) => group.main);
  const shown = visible.reduce((sum, group) => sum + 1 + group.children.length, 0);
  const searching = query.trim() !== "";
  const canDrag = !searching && editing === null && adding === null;

  /** Toon de nieuwe volgorde meteen en bewaar ze; mislukt dat, dan terug. */
  function commit(move: Move) {
    const before = rows;
    const position = new Map(move.ids.map((id, index) => [id, index]));
    const parent = move.parentId ? rows.find((row) => row.id === move.parentId) : null;
    setRows((current) =>
      current.map((row) => {
        const index = position.get(row.id);
        if (index === undefined) return row;
        if (move.moved?.id === row.id && parent) {
          return { ...row, sortOrder: index, parentId: parent.id, code: move.moved.to };
        }
        return { ...row, sortOrder: index };
      }),
    );
    startTransition(async () => {
      const result = await reorderAccountingCodesAction({ parentId: move.parentId, ids: move.ids });
      if (result.status === "error") {
        setRows(before);
        showToast({
          message: t.errors[result.code] ?? t.orderFailed,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: move.moved ? t.movedTo(move.moved.to) : t.orderSaved,
        variant: "success",
      });
    });
  }

  /** Een subcode naar een andere groep: eerst zeggen welke code ze wordt. */
  function propose(move: Move) {
    if (move.moved) setConfirmMove(move);
    else commit(move);
  }

  function mainOrder(movingId: string, targetId: string, place: "before" | "after"): string[] {
    const ids = groups.map((group) => group.main.id).filter((id) => id !== movingId);
    const at = ids.indexOf(targetId);
    ids.splice(place === "before" ? at : at + 1, 0, movingId);
    return ids;
  }

  function subOrder(movingId: string, group: Group, beforeId: string | null): string[] {
    const ids = group.children.map((child) => child.id).filter((id) => id !== movingId);
    const at = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(at === -1 ? ids.length : at, 0, movingId);
    return ids;
  }

  function sameOrder(ids: string[], current: string[]): boolean {
    return ids.length === current.length && ids.every((id, index) => id === current[index]);
  }

  function onDragOver(event: DragEvent<HTMLTableRowElement>, group: Group, rowId: string | null) {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    let next: DropTarget;
    if (dragging.parentId === null) {
      const body = event.currentTarget.closest("tbody");
      if (!body) return;
      const rect = body.getBoundingClientRect();
      next = {
        kind: "main",
        groupId: group.main.id,
        place: event.clientY < rect.top + rect.height / 2 ? "before" : "after",
      };
    } else if (rowId === null) {
      // Op de kop van een groep: bovenaan in die groep.
      next = { kind: "sub", parentId: group.main.id, beforeId: group.children[0]?.id ?? null };
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const index = group.children.findIndex((child) => child.id === rowId);
      next = {
        kind: "sub",
        parentId: group.main.id,
        beforeId:
          event.clientY < rect.top + rect.height / 2
            ? rowId
            : (group.children[index + 1]?.id ?? null),
      };
    }
    if (JSON.stringify(next) !== JSON.stringify(drop)) setDrop(next);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const item = dragging;
    const target = drop;
    setDragging(null);
    setDrop(null);
    if (!item || !target) return;

    if (target.kind === "main" && item.parentId === null) {
      const ids = mainOrder(item.id, target.groupId, target.place);
      if (!sameOrder(ids, groups.map((group) => group.main.id))) commit({ parentId: null, ids });
      return;
    }
    if (target.kind !== "sub" || item.parentId === null) return;
    const group = groups.find((candidate) => candidate.main.id === target.parentId);
    const row = rows.find((candidate) => candidate.id === item.id);
    if (!group || !row) return;
    const ids = subOrder(item.id, group, target.beforeId);
    if (item.parentId === group.main.id) {
      if (!sameOrder(ids, group.children.map((child) => child.id))) {
        commit({ parentId: group.main.id, ids });
      }
      return;
    }
    propose({
      parentId: group.main.id,
      ids,
      moved: {
        id: row.id,
        from: row.code,
        to: subCode(group.main.code, subSuffix(row.code)),
        name: row.name,
        usage: row.ticketEvents + row.templates + (row.membership ? 1 : 0),
      },
    });
  }

  /** Met het toetsenbord: pijltje omhoog of omlaag, binnen de eigen groep. */
  function onGripKey(event: KeyboardEvent<HTMLButtonElement>, row: AccountingCodeUsageRow, group: Group) {
    if (!canDrag || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const step = event.key === "ArrowUp" ? -1 : 1;
    const siblings = row.parentId === null
      ? groups.map((candidate) => candidate.main.id)
      : group.children.map((child) => child.id);
    const index = siblings.indexOf(row.id);
    const to = index + step;
    if (index === -1 || to < 0 || to >= siblings.length) return;
    const ids = [...siblings];
    [ids[index], ids[to]] = [ids[to], ids[index]];
    commit({ parentId: row.parentId, ids });
    // De focus blijft op de greep van de rij die verhuisde.
    requestAnimationFrame(() => gripRefs.current.get(row.id)?.focus());
  }

  function dragProps(row: AccountingCodeUsageRow) {
    if (!canDrag) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLTableRowElement>) => {
        // Firefox start geen sleepbeweging zonder gegevens.
        event.dataTransfer.setData("text/plain", row.code);
        event.dataTransfer.effectAllowed = "move";
        setDragging({ id: row.id, parentId: row.parentId });
      },
      onDragEnd: () => {
        setDragging(null);
        setDrop(null);
      },
    };
  }

  function dropMark(group: Group, rowId: string | null): "before" | "after" | undefined {
    if (drop?.kind !== "sub" || drop.parentId !== group.main.id) return undefined;
    if (rowId !== null && drop.beforeId === rowId) return "before";
    const last = group.children.at(-1)?.id ?? null;
    if (drop.beforeId === null && rowId === last) return "after";
    // Een lege groep: de lijn onder de kop.
    if (drop.beforeId === null && rowId === null && group.children.length === 0) return "after";
    return undefined;
  }

  function grip(row: AccountingCodeUsageRow, group: Group) {
    return (
      <td className="vtk-codes-grip">
        {canDrag ? (
          <button
            type="button"
            ref={(element) => {
              if (element) gripRefs.current.set(row.id, element);
              else gripRefs.current.delete(row.id);
            }}
            title={t.moveHint}
            aria-label={`${t.move}: ${row.code} ${row.name}`}
            onKeyDown={(event) => onGripKey(event, row, group)}
          >
            <GripIcon />
          </button>
        ) : null}
      </td>
    );
  }

  return (
    <div className="vtk-codes">
      <div className="vtk-codes-toolbar">
        <div className="vtk-codes-search">
          <label className="sr-only" htmlFor="accounting-search">
            {t.search}
          </label>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="accounting-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </div>
        <span className="vtk-codes-count" role="status">
          {t.count(shown, rows.length)}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setAdding({ parentId: null });
          }}
        >
          {t.addMain}
        </Button>
      </div>
      {searching ? <p className="vtk-codes-hint">{t.dragDisabled}</p> : null}

      <div className="vtk-codes-table-wrap">
        <table className="vtk-codes-table" data-dragging={dragging ? "true" : undefined}>
          <thead>
            <tr>
              <th className="vtk-codes-col-grip">
                <span className="sr-only">{t.move}</span>
              </th>
              <th className="vtk-codes-col-code">{t.code}</th>
              <th>{t.name}</th>
              <th className="vtk-codes-col-usage vtk-codes-usage">{t.usage}</th>
              <th className="vtk-codes-col-actions">
                <span className="sr-only">{t.actions}</span>
              </th>
            </tr>
          </thead>
          {adding?.parentId === null ? (
            <tbody>
              <NewRow locale={locale} mains={mains} parentId={null} onDone={() => setAdding(null)} />
            </tbody>
          ) : null}
          {rows.length === 0 ? (
            <tbody>
              <tr className="vtk-codes-empty">
                <td colSpan={5}>{t.empty}</td>
              </tr>
            </tbody>
          ) : visible.length === 0 ? (
            <tbody>
              <tr className="vtk-codes-empty">
                <td colSpan={5}>{t.noResults(query.trim())}</td>
              </tr>
            </tbody>
          ) : null}
          {visible.map((group) => {
            const main = group.main;
            const mainDrop =
              drop?.kind === "main" && drop.groupId === main.id ? drop.place : undefined;
            const allChildren = rows.filter((row) => row.parentId === main.id);
            const mainUsage = usageLabel(main, locale);
            return (
              <tbody
                key={main.id}
                className="vtk-codes-group"
                data-drop={mainDrop}
                data-dragging={dragging?.id === main.id ? "true" : undefined}
              >
                {editing === main.id ? (
                  <EditRow
                    locale={locale}
                    row={main}
                    mains={mains}
                    childRows={allChildren}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <tr
                    className="vtk-codes-main"
                    data-drop={dropMark(group, null)}
                    onClick={(event) => {
                      if (!fromControl(event)) setEditing(main.id);
                    }}
                    onDragOver={(event) => onDragOver(event, group, null)}
                    {...dragProps(main)}
                    onDrop={onDrop}
                  >
                    {grip(main, group)}
                    <td className="vtk-codes-code">{main.code}</td>
                    <td className="vtk-codes-name">
                      <button
                        type="button"
                        className="vtk-codes-name-button"
                        aria-label={`${t.edit}: ${main.code} ${main.name}`}
                        onClick={() => setEditing(main.id)}
                      >
                        {main.name}
                      </button>
                      {mainUsage ? <span className="vtk-codes-usage-inline">{mainUsage}</span> : null}
                    </td>
                    <td className="vtk-codes-usage">{mainUsage}</td>
                    <td className="vtk-codes-actions">
                      <IconButton
                        label={t.addSub}
                        srLabel={`${t.addSub}: ${main.code} ${main.name}`}
                        onClick={() => {
                          setEditing(null);
                          setAdding({ parentId: main.id });
                        }}
                      >
                        <PlusIcon />
                      </IconButton>
                    </td>
                  </tr>
                )}
                {group.children.map((child) => {
                  if (editing === child.id) {
                    return (
                      <EditRow
                        key={child.id}
                        locale={locale}
                        row={child}
                        mains={mains}
                        childRows={[]}
                        onDone={() => setEditing(null)}
                      />
                    );
                  }
                  const childUsage = usageLabel(child, locale);
                  return (
                    <tr
                      key={child.id}
                      className="vtk-codes-sub"
                      data-drop={dropMark(group, child.id)}
                      data-dragging={dragging?.id === child.id ? "true" : undefined}
                      onClick={(event) => {
                        if (!fromControl(event)) setEditing(child.id);
                      }}
                      onDragOver={(event) => onDragOver(event, group, child.id)}
                      {...dragProps(child)}
                      onDrop={onDrop}
                    >
                      {grip(child, group)}
                      <td className="vtk-codes-code">{subSuffix(child.code)}</td>
                      <td className="vtk-codes-name">
                        <button
                          type="button"
                          className="vtk-codes-name-button"
                          aria-label={`${t.edit}: ${child.code} ${child.name}`}
                          onClick={() => setEditing(child.id)}
                        >
                          {child.name}
                        </button>
                        {childUsage ? (
                          <span className="vtk-codes-usage-inline">{childUsage}</span>
                        ) : null}
                      </td>
                      <td className="vtk-codes-usage">{childUsage}</td>
                      <td className="vtk-codes-actions" />
                    </tr>
                  );
                })}
                {adding?.parentId === main.id ? (
                  <NewRow
                    locale={locale}
                    mains={mains}
                    parentId={main.id}
                    onDone={() => setAdding(null)}
                  />
                ) : null}
              </tbody>
            );
          })}
        </table>
      </div>

      <ConfirmDialog
        open={confirmMove !== null}
        destructive={false}
        title={
          confirmMove?.moved
            ? nl
              ? `${confirmMove.moved.name} verplaatsen?`
              : `Move ${confirmMove.moved.name}?`
            : ""
        }
        description={
          confirmMove?.moved
            ? nl
              ? `De code wordt ${confirmMove.moved.to} in plaats van ${confirmMove.moved.from}. ${
                  confirmMove.moved.usage > 0
                    ? "Ticketverkopen, sjablonen en het lidgeld die deze code gebruiken, krijgen de nieuwe vanaf hun volgende bestelling. "
                    : ""
                }Wat al verkocht is, houdt de code waaronder het betaald werd.`
              : `The code becomes ${confirmMove.moved.to} instead of ${confirmMove.moved.from}. ${
                  confirmMove.moved.usage > 0
                    ? "Ticket sales, templates and the membership fee using this code get the new one from their next order. "
                    : ""
                }What has been sold keeps the code it was paid under.`
            : ""
        }
        confirmLabel={nl ? "Verplaatsen" : "Move"}
        cancelLabel={t.cancel}
        onConfirm={() => {
          const move = confirmMove;
          setConfirmMove(null);
          if (move) commit(move);
        }}
        onCancel={() => setConfirmMove(null)}
      />
    </div>
  );
}
