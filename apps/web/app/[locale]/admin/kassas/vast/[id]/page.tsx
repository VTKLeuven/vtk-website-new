import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { amountInputValue, countsLines, denominationLabel, normaliseCounts } from "@/lib/kassas/kassa";
import { formatEuro, formatSpentOn, formatSubmittedOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import {
  brusselsToday,
  canEditPermanentEntry,
  cashRegisterAccess,
} from "@/lib/kassas/server";
import { entryValueCents, POST_COUNT_WINDOW_DAYS, postSlug } from "@/lib/kassas/permanent";
import { deletePermanentEntryAction, savePermanentEntryAction } from "@/app/actions/kassas";
import { kassaErrorMessages } from "../../messages";
import { EntryForm } from "../EntryForm";

/**
 * Eén regel uit het kasboek van een vaste kassa, om aan te passen of te
 * verwijderen. De rij in het kasboek linkt hier enkel naartoe wanneer je dat
 * mag (`canEditPermanentEntry`); wie de regel enkel mag zien, leest hier
 * hetzelfde als in de rij.
 */
export default async function VasteKassaRegel({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/vast/${id}`);
  const entry = await prisma.permanentCashEntry.findUnique({
    where: { id },
    include: {
      group: { select: { id: true, code: true, nameNl: true, nameEn: true } },
      createdBy: { select: { name: true } },
    },
  });
  // Een regel van een post waar je niet in zit, bestaat voor jou niet.
  if (!entry || !access.canRequest || (!access.canManage && !access.postIds.includes(entry.groupId))) notFound();

  const today = brusselsToday();
  const editable = canEditPermanentEntry(access, entry, today);
  const postName = pick(entry.group.nameNl, entry.group.nameEn, locale);
  const euro = (cents: number) => formatEuro(cents, locale);
  const date = formatSpentOn(entry.date, locale);
  const listHref = `${base}/admin/kassas/vast?post=${postSlug(entry.group.code)}`;
  const title = {
    HANDED_OUT: nl ? `Meegegeven op ${date}` : `Handed out on ${date}`,
    RETURNED: nl ? `Teruggegeven op ${date}` : `Returned on ${date}`,
    COUNT: nl ? `Telling van ${date}` : `Count of ${date}`,
  }[entry.kind];
  const counts = entry.kind === "COUNT" ? normaliseCounts(entry.counts) : null;

  const facts: Array<{ label: string; value: string }> = [
    { label: "Post", value: postName },
    { label: nl ? "Bedrag" : "Amount", value: euro(entryValueCents(entry)) },
    ...(counts
      ? [
          {
            label: nl ? "Coupures" : "Denominations",
            value:
              countsLines(counts)
                .map((line) => `${line.pieces} × ${denominationLabel(line.denomination)}`)
                .join(", ") || (nl ? "leeg" : "empty"),
          },
        ]
      : []),
    ...(entry.shiftVouchers || entry.elixirVouchers
      ? [
          {
            label: nl ? "Bonnen" : "Vouchers",
            value: [
              entry.shiftVouchers
                ? `${entry.shiftVouchers} ${nl ? "shiftersbonnen" : "shift vouchers"} × ${euro(entry.shiftVoucherValueCents)}`
                : "",
              entry.elixirVouchers
                ? `${entry.elixirVouchers} ${nl ? "elixirbonnen" : "elixir vouchers"} × ${euro(entry.elixirVoucherValueCents)}`
                : "",
            ]
              .filter(Boolean)
              .join(", "),
          },
        ]
      : []),
    ...(entry.closesRegister
      ? [{ label: nl ? "Kassa" : "Register", value: nl ? "De volledige kassa kwam terug" : "The whole register came back" }]
      : []),
    ...(entry.note ? [{ label: nl ? "Opmerking" : "Note", value: entry.note }] : []),
    {
      label: nl ? "Ingegeven" : "Entered",
      value: `${formatSubmittedOn(entry.createdAt, locale)}${
        entry.createdBy ? ` ${nl ? "door" : "by"} ${entry.createdBy.name}` : ""
      }`,
    },
  ];

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link href={listHref} className="text-sm text-vtk-muted underline underline-offset-4">
          {nl ? `Kasboek van ${postName}` : `${postName} ledger`}
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-vtk-muted">{fact.label}</dt>
              <dd className="text-vtk-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {editable ? (
        <>
          <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-vtk-ink">{nl ? "Aanpassen" : "Edit"}</h2>
            <EntryForm
              locale={locale}
              action={savePermanentEntryAction}
              postName={postName}
              minDate={
                access.canManage
                  ? undefined
                  : toDateInputValue(new Date(today.getTime() - POST_COUNT_WINDOW_DAYS * 86_400_000))
              }
              maxDate={toDateInputValue(today)}
              shiftVoucherValueCents={entry.shiftVoucherValueCents}
              elixirVoucherValueCents={entry.elixirVoucherValueCents}
              errorMessages={kassaErrorMessages(locale)}
              values={{
                id: entry.id,
                groupId: entry.groupId,
                kind: entry.kind,
                date: toDateInputValue(entry.date),
                cash: entry.kind === "COUNT" ? "" : amountInputValue(entry.cashCents),
                counts,
                shiftVouchers: entry.shiftVouchers ? String(entry.shiftVouchers) : "",
                elixirVouchers: entry.elixirVouchers ? String(entry.elixirVouchers) : "",
                closesRegister: entry.closesRegister,
                note: entry.note ?? "",
              }}
            />
          </section>
          <div className="flex justify-end">
            <DeleteButton
              action={deletePermanentEntryAction}
              fields={{ id: entry.id, locale }}
              title={nl ? "Regel verwijderen?" : "Delete this line?"}
              description={
                nl
                  ? `${title} (${euro(entryValueCents(entry))}) verdwijnt uit het kasboek van ${postName}. De winst van het kwartaal en die van de telling erna worden opnieuw gerekend zonder deze regel. De andere regels blijven staan, net als het adminlogboek.`
                  : `${title} (${euro(entryValueCents(entry))}) disappears from the ${postName} ledger. The quarter's profit and that of the next count are worked out again without this line. The other lines stay, as does the admin log.`
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
              errorMessages={kassaErrorMessages(locale)}
              errorFallback={nl ? "Verwijderen mislukt." : "Could not delete."}
            >
              {nl ? "Regel verwijderen" : "Delete line"}
            </DeleteButton>
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-vtk-body">
          {nl
            ? `Deze regel pas je niet meer aan: een telling kan de post ${POST_COUNT_WINDOW_DAYS} dagen rechtzetten, en meegeven en teruggeven geeft Beheer in. Klopt er iets niet, laat het Beheer weten.`
            : `You can no longer change this line: the post can correct a count for ${POST_COUNT_WINDOW_DAYS} days, and Administration enters what it hands out and gets back. If something is wrong, tell Administration.`}
        </p>
      )}
    </div>
  );
}
