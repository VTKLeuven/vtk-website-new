"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import {
  createAccountingCodeAction,
  deleteAccountingCodeAction,
  updateAccountingCodeAction,
} from "@/app/actions/accountingCodes";
import {
  MAIN_CODE_DIGITS,
  MAX_ACCOUNTING_NAME,
  normalizeCodeInput,
  SUB_CODE_DIGITS,
  subSuffix,
  type AccountingCodeOption,
} from "@/lib/accounting/codes";

export type AccountingCodeUsageRow = AccountingCodeOption & {
  /** Ticketverkopen die deze code nu gekozen hebben. */
  ticketEvents: number;
  /** Gaat deze code mee met het lidgeld? */
  membership: boolean;
};

type Locale = "nl" | "en";

function copy(locale: Locale) {
  const nl = locale === "nl";
  return {
    addHeading: nl ? "Code toevoegen" : "Add a code",
    addHint: nl
      ? "Een hoofdrekening heeft zes cijfers. Een subcode hangt onder een hoofdrekening en heeft vijf cijfers, die achter de hoofdrekening komen: 700100 met 10002 wordt 70010010002."
      : "A main account has six digits. A sub code hangs under a main account and has five digits, appended to it: 700100 with 10002 becomes 70010010002.",
    parent: nl ? "Onder" : "Under",
    noParent: nl ? "Geen: nieuwe hoofdrekening" : "None: new main account",
    code: "Code",
    subCode: nl ? "Subcode" : "Sub code",
    name: nl ? "Naam" : "Name",
    fullCode: nl ? "Volledige code" : "Full code",
    add: nl ? "Toevoegen" : "Add",
    adding: nl ? "Toevoegen..." : "Adding...",
    added: nl ? "Code toegevoegd." : "Code added.",
    save: nl ? "Opslaan" : "Save",
    saving: nl ? "Opslaan..." : "Saving...",
    saved: nl ? "Code opgeslagen." : "Code saved.",
    cancel: nl ? "Annuleren" : "Cancel",
    failed: nl ? "Opslaan is mislukt." : "Saving failed.",
    listHeading: nl ? "Alle codes" : "All codes",
    usage: nl ? "Gebruikt door" : "Used by",
    actions: nl ? "Acties" : "Actions",
    edit: nl ? "Bewerken" : "Edit",
    delete: nl ? "Verwijderen" : "Delete",
    deleteConfirm: nl ? "Verwijderen" : "Delete",
    deleted: nl ? "Code verwijderd." : "Code deleted.",
    membership: nl ? "Lidgeld" : "Membership fee",
    unused: nl ? "Niet in gebruik" : "Not in use",
    sales: (count: number) =>
      nl
        ? `${count} ${count === 1 ? "ticketverkoop" : "ticketverkopen"}`
        : `${count} ticket ${count === 1 ? "sale" : "sales"}`,
    empty: nl
      ? "Er zijn nog geen codes. Voeg hierboven de eerste hoofdrekening toe."
      : "There are no codes yet. Add the first main account above.",
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
      CODE_EXISTS: nl ? "Die code bestaat al." : "That code already exists.",
      NOT_FOUND: nl
        ? "Deze code bestaat niet meer. Herlaad de pagina."
        : "This code no longer exists. Reload the page.",
    } as Record<string, string>,
  };
}

/** Wat er weg is en wat blijft, voor de bevestiging van het verwijderen. */
function deleteDescription(row: AccountingCodeUsageRow, children: AccountingCodeUsageRow[], locale: Locale): string {
  const nl = locale === "nl";
  const events = row.ticketEvents + children.reduce((sum, child) => sum + child.ticketEvents, 0);
  const membership = row.membership || children.some((child) => child.membership);
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

function AddCodeForm({ locale, mains }: { locale: Locale; mains: AccountingCodeUsageRow[] }) {
  const t = copy(locale);
  const [parentId, setParentId] = useState("");
  const [code, setCode] = useState("");
  const parent = mains.find((main) => main.id === parentId) ?? null;
  // Meteen tonen wat er in de betaalinfo komt te staan: bij een subcode is dat
  // niet wat je intikt, maar de hoofdrekening ervoor.
  const typed = normalizeCodeInput(code);
  const fullCode = parent && typed ? parent.code + subSuffix(typed, parent.code) : typed;

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-medium text-vtk-ink">{t.addHeading}</h2>
      <p className="mb-3 max-w-3xl text-sm text-[#5c667f]">{t.addHint}</p>
      <SaveForm
        action={createAccountingCodeAction}
        submitLabel={t.add}
        savingLabel={t.adding}
        savedMessage={t.added}
        errorMessages={t.errors}
        fallbackErrorMessage={t.failed}
        onSuccess={() => setCode("")}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1.4fr)]">
          <div>
            <Label htmlFor="accounting-parent">{t.parent}</Label>
            <Select
              id="accounting-parent"
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{t.noParent}</option>
              {mains.map((main) => (
                <option key={main.id} value={main.id}>
                  {main.code} {main.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="accounting-code">{parent ? t.subCode : t.code}</Label>
            <Input
              id="accounting-code"
              name="code"
              inputMode="numeric"
              autoComplete="off"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={parent ? "10001" : "700100"}
            />
          </div>
          <div>
            <Label htmlFor="accounting-name">{t.name}</Label>
            <Input id="accounting-name" name="name" required maxLength={MAX_ACCOUNTING_NAME} />
          </div>
        </div>
        {parent ? (
          <p className="text-sm text-[#5c667f]">
            {t.fullCode}:{" "}
            <span className="font-medium tabular-nums text-vtk-ink">{fullCode || `${parent.code}…`}</span>
          </p>
        ) : null}
      </SaveForm>
    </Card>
  );
}

function EditCodeRow({
  locale,
  row,
  parentCode,
  childCount,
  onDone,
}: {
  locale: Locale;
  row: AccountingCodeUsageRow;
  parentCode: string | null;
  childCount: number;
  onDone: () => void;
}) {
  const t = copy(locale);
  return (
    <tr className="border-b border-vtk-blue/10 bg-vtk-blue-soft/30 last:border-0">
      <td colSpan={4} className="px-4 py-3">
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
            <div className="flex flex-wrap items-center gap-2">
              {submitButton}
              <Button type="button" variant="ghost" onClick={onDone}>
                {t.cancel}
              </Button>
            </div>
          )}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={row.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
            <div>
              <Label htmlFor={`accounting-code-${row.id}`}>{parentCode ? t.subCode : t.code}</Label>
              <div className="flex items-center gap-1">
                {parentCode ? (
                  <span className="text-sm tabular-nums text-[#5c667f]">{parentCode}</span>
                ) : null}
                <Input
                  id={`accounting-code-${row.id}`}
                  name="code"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  defaultValue={parentCode ? subSuffix(row.code, parentCode) : row.code}
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`accounting-name-${row.id}`}>{t.name}</Label>
              <Input
                id={`accounting-name-${row.id}`}
                name="name"
                required
                maxLength={MAX_ACCOUNTING_NAME}
                defaultValue={row.name}
              />
            </div>
          </div>
          <p className="text-xs text-[#5c667f]">
            {locale === "nl"
              ? `${childCount > 0 ? `Verander je de code, dan verhuizen de ${childCount} subcodes mee. ` : ""}Verkochte tickets houden de code en de naam waaronder ze betaald zijn; ticketverkopen met deze code gebruiken de nieuwe vanaf hun volgende bestelling.`
              : `${childCount > 0 ? `If you change the code, its ${childCount} sub codes move along. ` : ""}Sold tickets keep the code and name they were paid under; ticket sales using this code use the new one from their next order.`}
          </p>
        </SaveForm>
      </td>
    </tr>
  );
}

export function AccountingCodesEditor({
  locale,
  codes,
}: {
  locale: Locale;
  codes: AccountingCodeUsageRow[];
}) {
  const t = copy(locale);
  const [editing, setEditing] = useState<string | null>(null);
  const mains = codes.filter((code) => code.depth === 0);
  const codeById = new Map(codes.map((code) => [code.id, code]));
  const childrenOf = (id: string) => codes.filter((code) => code.parentId === id);

  return (
    <div className="space-y-6">
      <AddCodeForm locale={locale} mains={mains} />

      <div className="space-y-3">
        <h2 className="font-medium text-vtk-ink">{t.listHeading}</h2>
        {codes.length === 0 ? (
          <Card className="p-5 text-sm text-[#5c667f]">{t.empty}</Card>
        ) : (
          <Card className="relative overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                  <th className="px-4 py-3 font-medium">{t.code}</th>
                  <th className="px-4 py-3 font-medium">{t.name}</th>
                  <th className="px-4 py-3 font-medium">{t.usage}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{t.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.map((row) => {
                  const parentCode = row.parentId ? (codeById.get(row.parentId)?.code ?? null) : null;
                  if (editing === row.id) {
                    return (
                      <EditCodeRow
                        key={row.id}
                        locale={locale}
                        row={row}
                        parentCode={parentCode}
                        childCount={childrenOf(row.id).length}
                        onDone={() => setEditing(null)}
                      />
                    );
                  }
                  const usage = [
                    row.ticketEvents > 0 ? t.sales(row.ticketEvents) : null,
                    row.membership ? t.membership : null,
                  ].filter(Boolean);
                  return (
                    <tr key={row.id} className="border-b border-vtk-blue/10 last:border-0">
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${
                          row.depth === 0 ? "font-semibold text-vtk-ink" : "pl-8 text-vtk-ink"
                        }`}
                      >
                        {row.code}
                      </td>
                      <td className={`px-4 py-2.5 ${row.depth === 0 ? "font-medium text-vtk-ink" : ""}`}>
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-[#5c667f]">
                        {usage.length > 0 ? usage.join(", ") : t.unused}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <IconButton
                            label={t.edit}
                            srLabel={`${t.edit}: ${row.code} ${row.name}`}
                            onClick={() => setEditing(row.id)}
                          >
                            <PencilIcon />
                          </IconButton>
                          <DeleteIconButton
                            action={deleteAccountingCodeAction}
                            fields={{ id: row.id }}
                            label={t.delete}
                            srLabel={`${t.delete}: ${row.code} ${row.name}`}
                            title={
                              locale === "nl"
                                ? `${row.code} ${row.name} verwijderen?`
                                : `Delete ${row.code} ${row.name}?`
                            }
                            description={deleteDescription(row, childrenOf(row.id), locale)}
                            confirmLabel={t.deleteConfirm}
                            cancelLabel={t.cancel}
                            successMessage={t.deleted}
                            errorMessages={t.errors}
                            errorFallback={t.failed}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
