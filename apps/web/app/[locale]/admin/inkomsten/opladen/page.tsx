import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { listIncomeImports } from "@/lib/inkomsten/server";
import { listBankStatements } from "@/lib/inkomsten/bankServer";
import { displayAccount } from "@/lib/inkomsten/labels";
import {
  deleteBankStatementAction,
  deleteIncomeImportAction,
  importIncomeAction,
  previewIncomeImportAction,
} from "@/app/actions/inkomsten";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS } from "../shared";
import { FormatGuide } from "./FormatGuide";
import { UploadForm } from "./UploadForm";

export default async function IncomeUploadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("income.manage");

  const [imports, statements] = await Promise.all([listIncomeImports(), listBankStatements()]);
  const ymd = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" });
  const errorMessages = incomeErrorMessages(locale);
  const date = (value: Date | null) => (value ? value.toLocaleDateString(nl ? "nl-BE" : "en-GB") : "");

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold">{nl ? "Online inkomsten uploaden" : "Upload online income"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Wat al eerder geüpload werd, telt niet dubbel: een maand twee keer uploaden kan geen kwaad."
            : "Anything uploaded before does not count twice: uploading a month twice does no harm."}
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <FormatGuide nl={nl} />
        <UploadForm
          locale={locale}
          previewAction={previewIncomeImportAction}
          importAction={importIncomeAction}
          errorMessages={errorMessages}
        />
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Geüploade exports" : "Uploaded exports"}</h2>
        {imports.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">{nl ? "Nog niets geüpload." : "Nothing uploaded yet."}</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                  <th className="px-3 py-2">{nl ? "Bestand" : "File"}</th>
                  <th className="px-3 py-2">{nl ? "Bron" : "Source"}</th>
                  <th className="px-3 py-2">{nl ? "Periode" : "Period"}</th>
                  <th className="px-3 py-2 text-right">{nl ? "Nieuw" : "New"}</th>
                  <th className="px-3 py-2 text-right">{nl ? "Al gekend" : "Known"}</th>
                  <th className="px-3 py-2">{nl ? "Geüpload" : "Uploaded"}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {imports.map((row) => (
                  <tr key={row.id} className="border-b border-vtk-blue/8 last:border-0">
                    <td className="min-w-[10rem] px-3 py-2 break-words">{row.fileName}</td>
                    <td className="px-3 py-2">{SOURCE_LABELS[row.source]}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {row.firstAt ? `${date(row.firstAt)} ${nl ? "tot" : "to"} ${date(row.lastAt)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.createdCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.duplicateCount}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {date(row.createdAt)}
                      {row.importedBy?.name ? <span className="text-vtk-muted"> · {row.importedBy.name}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeleteIconButton
                        action={deleteIncomeImportAction}
                        fields={{ id: row.id }}
                        label={nl ? "Verwijderen" : "Delete"}
                        srLabel={nl ? `Verwijderen: ${row.fileName}` : `Delete: ${row.fileName}`}
                        title={nl ? "Deze export verwijderen?" : "Delete this export?"}
                        description={
                          nl
                            ? `De ${row.createdCount} transacties die deze export aanmaakte, verdwijnen${row.manualCount ? `, ook de ${row.manualCount} die met de hand een code kregen` : ""}. Onthouden teksten en de instellingen van de kanalen blijven. Upload je dezelfde export later opnieuw, dan komen de transacties terug, zonder de toewijzingen met de hand.`
                            : `The ${row.createdCount} transactions this export created disappear${row.manualCount ? `, including the ${row.manualCount} that were assigned by hand` : ""}. Remembered texts and channel settings stay. Upload the same export again later and the transactions come back, without the manual assignments.`
                        }
                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Export verwijderd." : "Export deleted."}
                        errorMessages={errorMessages}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {statements.length > 0 ? (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-lg font-semibold">{nl ? "Geüploade bankafschriften" : "Uploaded bank statements"}</h2>
          <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
            {nl
              ? "Enkel de regels van SumUp, Payconiq, Mollie en Europabank staan erin; het overzicht toont ze per uitbetaling en per rekening."
              : "Only the lines from SumUp, Payconiq, Mollie and Europabank are kept; the overview shows them per payout and per account."}
          </p>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                  <th className="px-3 py-2">{nl ? "Rekening" : "Account"}</th>
                  <th className="px-3 py-2">{nl ? "Periode" : "Period"}</th>
                  <th className="px-3 py-2 text-right">{nl ? "Van providers" : "From providers"}</th>
                  <th className="px-3 py-2 text-right">{nl ? "Met uitbetaling" : "With payout"}</th>
                  <th className="px-3 py-2">{nl ? "Geüpload" : "Uploaded"}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {statements.map((row) => {
                  const account = displayAccount(row.account);
                  const period = `${ymd(row.coveredFrom)} ${nl ? "tot" : "to"} ${ymd(row.coveredTo)}`;
                  return (
                    <tr key={row.id} className="border-b border-vtk-blue/8 last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {account}
                        {!row.knownAccount ? (
                          <span className="block text-xs text-vtk-warn">{nl ? "bij geen enkel kanaal" : "on no channel"}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{period}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.providerCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.matched}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {date(row.createdAt)}
                        {row.importedBy ? <span className="text-vtk-muted"> · {row.importedBy}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DeleteIconButton
                          action={deleteBankStatementAction}
                          fields={{ id: row.id }}
                          label={nl ? "Verwijderen" : "Delete"}
                          srLabel={nl ? `Verwijderen: bankafschrift ${account}, ${period}` : `Delete: bank statement ${account}, ${period}`}
                          title={nl ? "Dit bankafschrift verwijderen?" : "Delete this bank statement?"}
                          description={
                            nl
                              ? `De ${row.providerCount} regels van providers uit dit afschrift verdwijnen, en de uitbetalingen die enkel zij bevestigden, staan weer open, tenzij iemand ze met de hand afvinkte. Wat een ander afschrift van dezelfde dagen ook heeft, blijft. Transacties, codes en afgesloten periodes blijven zoals ze zijn.`
                              : `The ${row.providerCount} provider lines from this statement disappear, and the payouts only they confirmed are open again, unless someone ticked them by hand. What another statement of the same days also holds, stays. Transactions, codes and closed periods stay as they are.`
                          }
                          confirmLabel={nl ? "Verwijderen" : "Delete"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={nl ? "Bankafschrift verwijderd." : "Bank statement deleted."}
                          errorMessages={errorMessages}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
