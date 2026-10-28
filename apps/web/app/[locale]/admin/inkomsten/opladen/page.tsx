import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { countUnassigned, listIncomeImports } from "@/lib/inkomsten/server";
import { deleteIncomeImportAction, importIncomeAction, previewIncomeImportAction } from "@/app/actions/inkomsten";
import { IncomeNav } from "../IncomeNav";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS } from "../shared";
import { UploadForm } from "./UploadForm";

export default async function IncomeUploadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("income.manage");

  const [imports, openCount] = await Promise.all([listIncomeImports(), countUnassigned()]);
  const errorMessages = incomeErrorMessages(locale);
  const date = (value: Date | null) => (value ? value.toLocaleDateString(nl ? "nl-BE" : "en-GB") : "");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Online inkomsten opladen" : "Upload online income"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Laad een export van Payconiq of Mollie op. Wat al eerder opgeladen werd, telt niet dubbel, dus een maand twee keer opladen kan geen kwaad. Namen en rekeningnummers van wie betaalde, worden niet bewaard."
            : "Upload a Payconiq or Mollie export. Anything uploaded before does not count twice, so uploading a month twice does no harm. Names and account numbers of payers are not stored."}
        </p>
      </header>

      <IncomeNav base={base} nl={nl} active="opladen" openCount={openCount} />

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <UploadForm
          locale={locale}
          previewAction={previewIncomeImportAction}
          importAction={importIncomeAction}
          errorMessages={errorMessages}
        />
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Opgeladen exports" : "Uploaded exports"}</h2>
        {imports.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">{nl ? "Nog niets opgeladen." : "Nothing uploaded yet."}</p>
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
                  <th className="px-3 py-2">{nl ? "Opgeladen" : "Uploaded"}</th>
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
                            ? `De ${row.createdCount} transacties die deze export aanmaakte, verdwijnen${row.manualCount ? `, ook de ${row.manualCount} die met de hand een code kregen` : ""}. Onthouden teksten en de instellingen van de kanalen blijven. Laad je dezelfde export later opnieuw op, dan komen de transacties terug, zonder de toewijzingen met de hand.`
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
    </div>
  );
}
