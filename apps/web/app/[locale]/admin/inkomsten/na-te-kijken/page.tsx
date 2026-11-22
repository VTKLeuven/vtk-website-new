import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import Link from "@/components/ui/Link";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { listAccountingCodes } from "@/lib/accounting/server";
import { listIncomeChannels, listUnassignedGroups, type UnassignedGroup } from "@/lib/inkomsten/server";
import { listChannelLendings, type ChannelLendingItem } from "@/lib/inkomsten/lendingServer";
import { REVIEW_DAY_START_HOUR } from "@/lib/inkomsten/overview";
import {
  assignIncomeGroupAction,
  deleteIncomeLendingAction,
  rematchIncomeAction,
  saveIncomeLendingAction,
  takeOverIncomeLendingAction,
} from "@/app/actions/inkomsten";
import { SaveForm } from "@/components/ui/SaveForm";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS } from "../shared";
import { AssignGroupForm } from "./AssignGroupForm";
import { LendingForm } from "./LendingForm";
import { LendingList, type LendingListItem } from "./LendingList";

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

  const [groups, codes, channels, lendings] = await Promise.all([
    listUnassignedGroups(),
    listAccountingCodes(),
    listIncomeChannels(),
    listChannelLendings(),
  ]);
  const errorMessages = incomeErrorMessages(locale);
  const time = (value: Date) =>
    value.toLocaleTimeString(nl ? "nl-BE" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
  const day = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  // De rijen van een groep in Transacties, om ze te zien of er een deel van aan
  // te vinken. Een dag is daar dezelfde dag van 9:00 tot 9:00; een vaste tekst
  // zoekt op de tekst zoals ze getoond wordt.
  const transactionsHref = (group: UnassignedGroup) => {
    const params = new URLSearchParams({ status: "na-te-kijken", bron: group.source.toLowerCase() });
    if (group.channelId) params.set("kanaal", group.channelId);
    if (group.type === "day" && group.day) params.set("dag", group.day);
    else if (group.label) params.set("q", group.label.slice(0, 100));
    else return null;
    return `${base}/admin/inkomsten/transacties?${params.toString()}`;
  };
  const countLink = (group: UnassignedGroup) => {
    const count = `${group.count} ${group.count === 1 ? (nl ? "transactie" : "transaction") : nl ? "transacties" : "transactions"}`;
    const href = transactionsHref(group);
    if (!href) return count;
    return (
      <Link
        href={href}
        title={nl ? "Bekijk ze in Transacties, en vink er een deel van aan" : "See them in Transactions, and tick part of them"}
        className="underline underline-offset-2 hover:text-vtk-navy"
      >
        {count}
      </Link>
    );
  };
  // De dag van een groep, "2026-10-09": een avond tot 4 uur hoort bij de dag ervoor.
  const groupDay = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dayText = (
    <>
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
    </>
  );

  // De uitleningen: de teksten hier, op de server, zodat de lijst in de browser
  // niet met een andere maandafkorting verspringt.
  const shortDay = (ymd: string, withYear: boolean) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    });
  const daysLabel = (from: string, to: string) =>
    from === to
      ? shortDay(from, true)
      : `${shortDay(from, from.slice(0, 4) !== to.slice(0, 4))} ${nl ? "tot en met" : "to"} ${shortDay(to, true)}`;
  const setOn = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  const counted = (count: number, cents: number, one: string, many: string) =>
    // Het bedrag breekt niet tussen het euroteken en het getal.
    `${count} ${count === 1 ? one : many} (${formatEuro(cents, locale).replace(" ", "\u00a0")})`;
  const lendingItem = (lending: ChannelLendingItem): LendingListItem => {
    const manual = new URLSearchParams({
      kanaal: lending.channelId,
      status: "met-de-hand",
      "van-dag": lending.days.from,
      "tot-dag": lending.days.to,
    });
    const edited = lending.updatedAt.getTime() - lending.createdAt.getTime() > 2000;
    return {
      id: lending.id,
      channelId: lending.channelId,
      channel: `${SOURCE_LABELS[lending.source]} · ${lending.channel}`,
      from: lending.days.from,
      to: lending.days.to,
      daysLabel: daysLabel(lending.days.from, lending.days.to),
      code: lending.code ? { id: lending.code.id, label: `${lending.code.code} ${lending.code.name}` } : null,
      linkedCount: lending.linkedCount,
      linkedLabel: counted(lending.linkedCount, lending.linkedCents, nl ? "transactie" : "transaction", nl ? "transacties" : "transactions"),
      transactionsHref: `${base}/admin/inkomsten/transacties?uitlening=${encodeURIComponent(lending.id)}`,
      manualCount: lending.manualCount,
      manualHref: `${base}/admin/inkomsten/transacties?${manual.toString()}`,
      takeOverCount: lending.takeOverCount,
      takeOverLabel: counted(lending.takeOverCount, lending.takeOverCents, nl ? "betaling" : "payment", nl ? "betalingen" : "payments"),
      setBy: [
        [lending.createdBy, setOn(lending.createdAt)].filter(Boolean).join(", "),
        edited ? `${nl ? "aangepast door" : "edited by"} ${[lending.updatedBy ?? "?", setOn(lending.updatedAt)].join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; "),
      locked: lending.locked,
    };
  };
  const lendingChannels = channels.map((channel) => ({
    id: channel.id,
    label: `${SOURCE_LABELS[channel.source]} · ${channel.label || channel.identifier}`,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-lg font-semibold">{nl ? "Na te kijken" : "To review"}</h2>
          {/* De "i" naast de zin en niet erin: de uitleg heeft zelf alinea's, en
              een <p> mag geen <p> bevatten. */}
          <div className="mt-1 flex max-w-3xl items-start gap-1">
            <p className="text-sm text-vtk-muted">
              {nl
                ? "Wat geen koppelregel kon plaatsen, per vaste tekst of per toestel per dag."
                : "What no matching rule could place, per fixed text or per device per day."}
            </p>
            <InfoTip label={nl ? "Hoe Na te kijken groepeert" : "How To review groups"}>
              <p>
                {nl
                  ? "Een vaste tekst (Mollie, het printkrediet) staat per tekst, en die kan je onthouden. Wat iemand bij een sticker intypt en een kaartbetaling bij SumUp of Europabank staan per toestel per dag."
                  : "A fixed text (Mollie, print credit) is grouped per text, and can be remembered. What someone types at a sticker and a card payment at SumUp or Europabank are grouped per device per day."}
              </p>
              {dayText}
              <p>
                {nl
                  ? "Dient een toestel altijd voor dezelfde post, geef het dan een standaardcode bij Instellingen."
                  : "If a device always serves the same post, give it a default code under Settings."}
              </p>
            </InfoTip>
          </div>
        </div>
        {/* Een nieuwe code in het register koppelt al vanzelf opnieuw; dit is
            voor wanneer iets anders veranderde. */}
        <SaveForm
          action={rematchIncomeAction}
          submitLabel={nl ? "Opnieuw koppelen" : "Match again"}
          submitVariant="ghost"
          submitSize="sm"
          savingLabel={nl ? "Bezig met koppelen..." : "Matching..."}
          savedMessage={nl ? "Opnieuw gekoppeld." : "Matched again."}
          fallbackErrorMessage={nl ? "Koppelen mislukt." : "Matching failed."}
          resetOnSuccess={false}
        />
      </header>

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
                    {" · "}
                    {countLink(group)}
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
              {group.kassas.map((kassa) => (
                <p key={kassa.id} className="mt-2 rounded-lg bg-vtk-warn-soft/60 px-3 py-1.5 text-sm">
                  {nl ? "Toen bij de kassa " : "Then with the register "}
                  <span className="font-medium">
                    {kassa.activity} ({kassa.postLabel})
                  </span>
                  {nl ? ", die nog geen code heeft. " : ", which has no code yet. "}
                  <Link href={`${base}/admin/kassas/${kassa.id}#online-inkomsten`} className="underline underline-offset-2">
                    {nl ? "Kies de code van de kassa" : "Choose the register's code"}
                  </Link>
                  {nl ? ", dan koppelen deze betalingen vanzelf." : ", and these payments match by themselves."}
                </p>
              ))}
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
        defaultOpen={lendings.length === 0}
        summary={
          <>
            <span className="font-medium">
              {nl ? "Uitleningen van een toestel" : "Device lendings"}
              {lendings.length > 0 ? <span className="font-normal text-vtk-muted"> ({lendings.length})</span> : null}
            </span>
            <span className="block text-sm text-vtk-muted">
              {nl
                ? "Voor een toestel dat een of meer dagen voor iets anders diende, zoals een SumUp die een week uitgeleend werd."
                : "For a device that served something else for one or more days, like a SumUp lent out for a week."}
            </span>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-1">
            <p className="text-sm text-vtk-muted">
              {nl
                ? "Elke betaling van dat toestel op die dagen krijgt de code, ook wat je later nog oplaadt."
                : "Every payment on that device on those days gets the code, including what you upload later."}
            </p>
            <InfoTip label={nl ? "Hoe een uitlening koppelt" : "How a lending matches"}>
              <p>
                {nl
                  ? `Een dag loopt van ${REVIEW_DAY_START_HOUR}:00 tot ${REVIEW_DAY_START_HOUR}:00 de ochtend erna, zoals de groepen hierboven: een avond tot 3 uur hoort bij de dag waarop ze begon. Zonder laatste dag is het één dag.`
                  : `A day runs from ${REVIEW_DAY_START_HOUR}:00 to ${REVIEW_DAY_START_HOUR}:00 the next morning, like the groups above: an evening until 3 am belongs to the day it started. Without a last day it is one day.`}
              </p>
              <p>
                {nl
                  ? "Een betaling van de site, een code in de tekst, een kassa tijdens haar uren en een onthouden tekst blijven zoals ze zijn: die weten het beter dan de datum. Na de uren van een kassa geldt de uitlening weer."
                  : "A payment from the site, a code in the text, a cash register during its hours and a remembered text stay as they are: those know better than the date. After a register's hours the lending applies again."}
              </p>
              <p>
                {nl
                  ? "Wat met de hand een code kreeg, blijft. Kreeg het dezelfde code (met het oude formulier voor een hele dag), open dan de uitlening en neem het over."
                  : "What got a code by hand stays. If it got the same code (with the old form for a whole day), open the lending and take it over."}
              </p>
              <p>
                {nl
                  ? "Enkel de code verandert: de dagen tellen in dezelfde maand als ervoor. Verwijder je een uitlening, dan gaan haar transacties terug naar de koppelregels."
                  : "Only the code changes: the days count in the same month as before. Delete a lending, and its transactions go back to the matching rules."}
              </p>
            </InfoTip>
          </div>
          <LendingForm
            channels={lendingChannels}
            codes={codes}
            locale={locale}
            action={saveIncomeLendingAction}
            errorMessages={errorMessages}
          />
          <section aria-labelledby="uitleningen">
            <h3 id="uitleningen" className="mb-2 text-sm font-semibold">
              {nl ? "Uitleningen" : "Lendings"}
            </h3>
            <LendingList
              items={lendings.map(lendingItem)}
              channels={lendingChannels}
              codes={codes}
              locale={locale}
              saveAction={saveIncomeLendingAction}
              deleteAction={deleteIncomeLendingAction}
              takeOverAction={takeOverIncomeLendingAction}
              errorMessages={errorMessages}
            />
          </section>
        </div>
      </AdminDisclosure>
    </div>
  );
}
