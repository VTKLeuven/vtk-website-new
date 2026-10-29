import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { listAccountingCodes } from "@/lib/accounting/server";
import { listIncomeChannels, listUnassignedGroups } from "@/lib/inkomsten/server";
import { REVIEW_DAY_START_HOUR } from "@/lib/inkomsten/overview";
import { assignIncomeDayAction, assignIncomeGroupAction, rematchIncomeAction } from "@/app/actions/inkomsten";
import { SaveForm } from "@/components/ui/SaveForm";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { IncomeNav } from "../IncomeNav";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS } from "../shared";
import { AssignDayForm } from "./AssignDayForm";
import { AssignGroupForm } from "./AssignGroupForm";

/**
 * Wat geen koppelregel kon plaatsen, gegroepeerd zodat één keuze veel
 * transacties dekt: een vaste tekst (Mollie, printkrediet) per tekst, een
 * sticker zonder referentie of een terminal per dag. De grootste bedragen
 * staan bovenaan.
 */
export default async function IncomeReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("income.manage");

  const [groups, codes, channels] = await Promise.all([listUnassignedGroups(), listAccountingCodes(), listIncomeChannels()]);
  const openCount = groups.reduce((sum, group) => sum + group.count, 0);
  const errorMessages = incomeErrorMessages(locale);
  const time = (value: Date) =>
    value.toLocaleTimeString(nl ? "nl-BE" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
  const day = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  // De dag van een groep, "2026-10-09": een avond tot 4 uur hoort bij de dag ervoor.
  const groupDay = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dayTip = (
    <InfoTip label={nl ? "Waarom een dag om 9:00 begint" : "Why a day starts at 9:00"}>
      <p>
        {nl
          ? `Een dag loopt hier van ${REVIEW_DAY_START_HOUR}:00 tot ${REVIEW_DAY_START_HOUR}:00 de ochtend erna, zoals in het script van de eigen poging van Beheer. Een avond die tot 4 uur loopt, blijft zo één groep, onder de dag waarop ze begon.`
          : `A day runs here from ${REVIEW_DAY_START_HOUR}:00 to ${REVIEW_DAY_START_HOUR}:00 the next morning, as in Beheer's own script. An evening that runs until 4 am stays one group, under the day it started.`}
      </p>
      <p>
        {nl
          ? "Enkel het groeperen verandert: een betaling om 2 uur op 1 oktober telt nog altijd in oktober."
          : "Only the grouping changes: a payment at 2 am on 1 October still counts in October."}
      </p>
    </InfoTip>
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Na te kijken" : "To review"}</h1>
        {/* De "i" naast de zin en niet erin: de uitleg heeft zelf alinea's, en
            een <p> mag geen <p> bevatten. */}
        <div className="mt-1 flex max-w-3xl items-start gap-1">
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Transacties die geen koppelregel kon plaatsen. Een vaste tekst kan je onthouden; wat iemand bij een sticker intypt en een kaartbetaling bij SumUp of Europabank staan per toestel per dag. Dient een toestel altijd voor dezelfde post, geef het dan een standaardcode bij Instellingen."
              : "Transactions no matching rule could place. A fixed text can be remembered; what someone types at a sticker and a card payment at SumUp or Europabank are grouped per device per day. If a device always serves the same post, give it a default code under Settings."}
          </p>
          {dayTip}
        </div>
      </header>

      <IncomeNav base={base} nl={nl} active="na-te-kijken" openCount={openCount} />

      <SaveForm
        action={rematchIncomeAction}
        submitLabel={nl ? "Opnieuw koppelen" : "Match again"}
        submitVariant="ghost"
        submitSize="sm"
        savingLabel={nl ? "Bezig met koppelen..." : "Matching..."}
        savedMessage={nl ? "Opnieuw gekoppeld." : "Matched again."}
        fallbackErrorMessage={nl ? "Koppelen mislukt." : "Matching failed."}
        resetOnSuccess={false}
        className="flex items-center gap-3"
      >
        <p className="text-sm text-vtk-muted">
          {nl
            ? "Na een nieuwe boekhoudcode in het register: de koppelregels lopen opnieuw over alles wat niet met de hand toegewezen is."
            : "After adding an accounting code: the rules run again over everything not assigned by hand."}
        </p>
      </SaveForm>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-vtk-muted">
          {nl ? "Niets meer na te kijken." : "Nothing left to review."}
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.key} className="rounded-2xl border border-vtk-blue/12 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">
                  {group.type === "day" ? (
                    <>
                      {group.channel} · {group.day ? groupDay(group.day) : day(group.firstAt)}
                      <span className="font-normal text-vtk-muted">
                        {" "}
                        {time(group.firstAt)} {nl ? "tot" : "to"} {time(group.lastAt)} · {SOURCE_LABELS[group.source]}
                      </span>
                    </>
                  ) : (
                    <>
                      {group.label ?? (nl ? "(zonder omschrijving)" : "(no description)")}
                      <span className="font-normal text-vtk-muted">
                        {" "}
                        · {SOURCE_LABELS[group.source]}
                        {group.source === "PAYCONIQ" && group.channel ? `, ${group.channel}` : ""}
                      </span>
                    </>
                  )}
                </p>
                <p className="tabular-nums">
                  <span className="font-semibold">{formatEuro(group.totalCents, locale)}</span>
                  <span className="text-vtk-muted">
                    {" "}
                    · {group.count} {group.count === 1 ? (nl ? "transactie" : "transaction") : nl ? "transacties" : "transactions"}
                  </span>
                </p>
              </div>
              {group.type === "text" && group.firstAt.getTime() !== group.lastAt.getTime() ? (
                <p className="mt-0.5 text-xs text-vtk-muted">
                  {day(group.firstAt)} {nl ? "tot" : "to"} {day(group.lastAt)}
                </p>
              ) : null}
              {group.type === "day" && group.samples.length > 0 ? (
                <p className="mt-0.5 text-xs text-vtk-muted">
                  {nl ? "Getypt: " : "Typed: "}
                  {group.samples.map((sample) => `"${sample}"`).join(", ")}
                </p>
              ) : null}
              <div className="mt-3">
                <AssignGroupForm
                  groupKey={group.key}
                  canRemember={group.type === "text" && Boolean(group.label)}
                  codes={codes}
                  locale={locale}
                  action={assignIncomeGroupAction}
                  errorMessages={errorMessages}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdminDisclosure
        summary={
          <>
            <span className="font-medium">{nl ? "Een hele dag van een kanaal anders toewijzen" : "Assign a whole day of a channel differently"}</span>
            <span className="block text-sm text-vtk-muted">
              {nl
                ? "Voor een dag die de standaardcode kreeg maar voor iets anders was, zoals een SumUp die een dag uitgeleend werd."
                : "For a day that got the default code but was for something else, like a SumUp lent out for a day."}
            </span>
          </>
        }
      >
        <div className="mb-3 flex items-start gap-1">
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Elke betaling van dat kanaal die dag krijgt de code, ook wat de standaardcode al had of wat nog na te kijken was. Een betaling van de site, een code in de tekst, een onthouden tekst of een kassa blijft zoals ze is: die weten het beter dan de dag."
              : "Every payment on that channel that day gets the code, including what already had the default code or was still to review. A payment from the site, a code in the text, a remembered text or a cash register stays as it is: those know better than the day."}
          </p>
          {dayTip}
        </div>
        <AssignDayForm
          channels={channels.map((channel) => ({
            id: channel.id,
            label: `${SOURCE_LABELS[channel.source]} · ${channel.label || channel.identifier}`,
          }))}
          codes={codes}
          locale={locale}
          action={assignIncomeDayAction}
          errorMessages={errorMessages}
        />
      </AdminDisclosure>
    </div>
  );
}
