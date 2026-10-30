import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { ConfirmIconButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { UndoIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { listAccountingCodes } from "@/lib/accounting/server";
import { getCashRegisterConfig } from "@/lib/kassas/server";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { channelCodeOn } from "@/lib/inkomsten/match";
import { accountOn, CHANNEL_FROM_START } from "@/lib/inkomsten/overview";
import {
  countUnassigned,
  getIncomeConfig,
  listClosedPeriods,
  listIncomeChannels,
  listIncomeNameRules,
} from "@/lib/inkomsten/server";
import {
  addIncomeChannelAccountAction,
  addIncomeChannelCodeAction,
  deleteIncomeChannelAccountAction,
  deleteIncomeChannelCodeAction,
  deleteIncomeNameRuleAction,
  reopenIncomePeriodAction,
  saveIncomeChannelAction,
  saveIncomeSettingsAction,
} from "@/app/actions/inkomsten";
import { IncomeNav } from "../IncomeNav";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS, periodLabel } from "../shared";
import { ChannelAccountForm, ChannelBasicsForm, ChannelCodeForm, FeeCodeForm } from "./SettingsForms";

/**
 * Alles over VTK zelf, ingevuld door Beheer: de kostencode, op welke rekening
 * elk kanaal stort en onder welke code het standaard valt, de onthouden teksten
 * en de afgesloten periodes. Niets hiervan staat in de code; een kanaal
 * verschijnt hier vanzelf zodra een export het noemt.
 */
export default async function IncomeSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("income.manage");

  const [config, codes, channels, rules, periods, openCount, cashConfig] = await Promise.all([
    getIncomeConfig(),
    listAccountingCodes(),
    listIncomeChannels(),
    listIncomeNameRules(),
    listClosedPeriods(),
    countUnassigned(),
    getCashRegisterConfig(),
  ]);
  const errorMessages = incomeErrorMessages(locale);
  const common = { locale, errorMessages } as const;
  const date = (value: Date) => value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" });
  const day = (value: Date) => value.toISOString().slice(0, 10);
  const today = ymdKey(brusselsYMD(new Date()));
  // "vanaf 1/10/2026", of "vanaf het begin" voor de eerste regel zonder datum.
  const since = (value: Date) =>
    day(value) === CHANNEL_FROM_START ? (nl ? "vanaf het begin" : "from the start") : `${nl ? "vanaf" : "from"} ${date(value)}`;
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  // Een Payconiq-kanaal is een Payconiq-rekening, een SumUp-account of
  // Europabank-terminal een Bancontact-bakje. Een toestel dat intussen hernoemd
  // werd, blijft kiesbaar op het kanaal waar het al stond.
  const deviceOptions = (channel: (typeof channels)[number]) => {
    const method = channel.source === "PAYCONIQ" ? "PAYCONIQ" : "BANCONTACT";
    const names = method === "PAYCONIQ" ? cashConfig.payconiqAccounts : cashConfig.bancontactTerminals;
    const kept = channel.cashMethod === method && channel.cashTerminal && !names.includes(channel.cashTerminal) ? [channel.cashTerminal] : [];
    return [...kept, ...names].map((name) => ({
      value: `${method}|${name}`,
      label: `${method === "PAYCONIQ" ? "Payconiq" : "Bancontact"}: ${name}`,
    }));
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Instellingen online inkomsten" : "Online income settings"}</h1>
      </header>

      <IncomeNav base={base} nl={nl} active="instellingen" openCount={openCount} />

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Kostencode" : "Fee code"}</h2>
        <p className="mt-1 mb-3 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "De boekhoudcode voor de kosten: wat Mollie inhoudt (\"Withheld fees\"), de transactiekosten van SumUp en de commissie van Europabank. Samen vormen ze de regel met de kosten in het kwartaalblad. Staat de code nog niet in de lijst, voeg ze dan eerst toe bij Boekhoudcodes."
            : "The accounting code for the fees: what Mollie withholds (\"Withheld fees\"), the SumUp transaction fees and the Europabank commission. Together they are the line with the fees in the quarter sheet. If the code is not in the list yet, add it under Accounting codes first."}
        </p>
        <FeeCodeForm {...common} action={saveIncomeSettingsAction} codes={codes} value={config.feeAccountingCodeId} />
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Kanalen" : "Channels"}</h2>
        {/* De "i" naast de zin en niet erin: de uitleg heeft zelf alinea's. */}
        <div className="mt-1 flex max-w-3xl items-start gap-1">
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Stel per kanaal de bankrekening in, en eventueel een standaardcode of het toestel van de kassa's."
              : "Set the bank account per channel, and a default code or the cash register device if needed."}
          </p>
          <InfoTip label={nl ? "Hoe rekeningen en standaardcodes werken" : "How accounts and default codes work"}>
            <p>
              {nl
                ? "Elke Payconiq-QR-code, elk SumUp-account, elke Europabank-terminal en elk Mollie-profiel dat in een export voorkwam, staat hier vanzelf."
                : "Every Payconiq QR code, SumUp account, Europabank terminal and Mollie profile that appeared in an export shows up here by itself."}
            </p>
            <p>
              {nl
                ? "De eerste rekening en de eerste standaardcode gelden vanaf het begin, ook voor wat al geüpload werd. Wisselt een toestel later van rekening of van post, voeg dan een regel toe vanaf die dag: wat ervoor binnenkwam, houdt de oude."
                : "The first account and the first default code apply from the start, also to what was uploaded already. If a device later changes account or post, add a row from that day: what came in before keeps the old one."}
            </p>
            <p>
              {nl
                ? "Met een standaardcode krijgt wat erop binnenkomt en geen andere regel koppelt die code, in plaats van bij Na te kijken te staan. Gebruikt een andere post het toestel een tijd, voeg dan vanaf die dag een regel zonder code toe, en vanaf de dag erna weer de code. Voor één dag kan het ook bij Na te kijken."
                : "With a default code, what comes in on it and no other rule matches gets that code instead of waiting under To review. If another post uses the device for a while, add a row without a code from that day, and the code again from the day after. For a single day, use To review."}
            </p>
          </InfoTip>
        </div>
        {channels.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">
            {nl ? "Nog geen kanalen: die verschijnen bij de eerste export." : "No channels yet: they appear with the first export."}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {channels.map((channel) => {
              const account = accountOn(
                channel.accounts.map((entry) => ({ from: day(entry.from), bankAccount: entry.bankAccount })),
                today,
              );
              const code = channelCodeOn(
                channel.codes.map((entry) => ({ from: day(entry.from), code: entry.accountingCode })),
                today,
              );
              const device = channel.cashMethod && channel.cashTerminal ? `${channel.cashMethod === "PAYCONIQ" ? "Payconiq" : "Bancontact"}: ${channel.cashTerminal}` : null;
              return (
                <li key={channel.id}>
                  {/* Dicht tot je er iets aan wil doen; open zolang de rekening nog ontbreekt. */}
                  <AdminDisclosure
                    variant="row"
                    defaultOpen={channel.accounts.length === 0}
                    summary={
                      <>
                        <span className="font-medium">{channel.label || channel.identifier}</span>
                        <span className="text-sm text-vtk-muted">
                          {channel.label ? ` (${channel.identifier})` : ""} · {SOURCE_LABELS[channel.source]} · {channel._count.transactions}{" "}
                          {nl ? "transacties" : "transactions"}
                        </span>
                        <span className="block text-sm text-vtk-muted">
                          {account ? (
                            <span className="tabular-nums">{account}</span>
                          ) : (
                            <span className="text-vtk-warn">{nl ? "Nog geen rekening" : "No account yet"}</span>
                          )}
                          {channel.source !== "MOLLIE"
                            ? code
                              ? ` · ${nl ? "standaard" : "default"} ${code.code} ${code.name}`
                              : ` · ${nl ? "geen standaardcode" : "no default code"}`
                            : ""}
                          {device ? ` · ${device}` : ""}
                        </span>
                      </>
                    }
                  >
                    <div className="space-y-4">
                      <ChannelBasicsForm
                        {...common}
                        action={saveIncomeChannelAction}
                        channelId={channel.id}
                        isMollie={channel.source === "MOLLIE"}
                        label={channel.label}
                        identifier={channel.identifier}
                        bankAccount={channel.accounts[0]?.bankAccount ?? null}
                        accountingCodeId={channel.codes[0]?.accountingCode?.id ?? null}
                        codes={codes}
                        device={channel.cashMethod && channel.cashTerminal ? `${channel.cashMethod}|${channel.cashTerminal}` : ""}
                        deviceOptions={deviceOptions(channel)}
                      />

                      <details
                        open={
                          channel.accounts.length > 1 ||
                          channel.codes.length > 1 ||
                          channel.accounts.some((entry) => day(entry.from) !== CHANNEL_FROM_START) ||
                          channel.codes.some((entry) => day(entry.from) !== CHANNEL_FROM_START)
                        }
                        className="border-t border-vtk-blue/10 pt-3 text-sm"
                      >
                        <summary className="cursor-pointer text-xs font-medium text-vtk-muted hover:text-vtk-ink">
                          {nl
                            ? "Wisselde dit kanaal vanaf een bepaalde datum van rekening of post?"
                            : "Did this channel change account or post from a specific date?"}
                        </summary>
                        <div className="mt-3 space-y-3">
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium uppercase tracking-wide text-vtk-muted">
                              {nl ? "Rekening per startdatum" : "Account by start date"}
                            </p>
                            {channel.accounts.length > 0 ? (
                              <ul className="text-sm">
                                {channel.accounts.map((entry) => {
                                  const from = day(entry.from);
                                  return (
                                    <li key={from} className="flex items-center gap-3">
                                      <span className="w-32 tabular-nums text-vtk-muted">{since(entry.from)}</span>
                                      <span className="tabular-nums">{entry.bankAccount}</span>
                                      <DeleteIconButton
                                        action={deleteIncomeChannelAccountAction}
                                        fields={{ channelId: channel.id, from }}
                                        label={nl ? "Verwijderen" : "Delete"}
                                        srLabel={nl ? `Rekening ${since(entry.from)} verwijderen` : `Delete account ${since(entry.from)}`}
                                        title={nl ? "Deze rekening verwijderen?" : "Delete this account?"}
                                        description={
                                          nl
                                            ? `${capitalize(since(entry.from))} geldt dan weer de rekening ervoor, of geen. De transacties zelf blijven; enkel het totaal per rekening in het overzicht verandert.`
                                            : `${capitalize(since(entry.from))} the account before it applies again, or none. The transactions stay; only the total per account in the overview changes.`
                                        }
                                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                                        successMessage={nl ? "Rekening verwijderd." : "Account deleted."}
                                        errorMessages={errorMessages}
                                      />
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                            <ChannelAccountForm
                              {...common}
                              action={addIncomeChannelAccountAction}
                              channelId={channel.id}
                              first={false}
                            />
                          </div>

                          {channel.source !== "MOLLIE" ? (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium uppercase tracking-wide text-vtk-muted">
                                {nl ? "Standaardcode per startdatum" : "Default code by start date"}
                              </p>
                              {channel.codes.length > 0 ? (
                                <ul className="text-sm">
                                  {channel.codes.map((entry) => {
                                    const from = day(entry.from);
                                    return (
                                      <li key={from} className="flex items-center gap-3">
                                        <span className="w-32 shrink-0 tabular-nums text-vtk-muted">{since(entry.from)}</span>
                                        {entry.accountingCode ? (
                                          <span>
                                            <span className="tabular-nums">{entry.accountingCode.code}</span> {entry.accountingCode.name}
                                          </span>
                                        ) : (
                                          <span className="text-vtk-muted">{nl ? "geen: naar Na te kijken" : "none: to To review"}</span>
                                        )}
                                        <DeleteIconButton
                                          action={deleteIncomeChannelCodeAction}
                                          fields={{ channelId: channel.id, from }}
                                          label={nl ? "Verwijderen" : "Delete"}
                                          srLabel={nl ? `Standaardcode ${since(entry.from)} verwijderen` : `Delete default code ${since(entry.from)}`}
                                          title={nl ? "Deze standaardcode verwijderen?" : "Delete this default code?"}
                                          description={
                                            nl
                                              ? `${capitalize(since(entry.from))} geldt dan weer de standaardcode ervoor, of geen. Transacties die hun code van deze regel kregen, worden opnieuw gekoppeld; wat met de hand toegewezen werd en wat in een afgesloten periode valt, blijft.`
                                              : `${capitalize(since(entry.from))} the default code before it applies again, or none. Transactions that got their code from this row are matched again; manual assignments and closed periods stay.`
                                          }
                                          confirmLabel={nl ? "Verwijderen" : "Delete"}
                                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                                          successMessage={nl ? "Standaardcode verwijderd." : "Default code deleted."}
                                          errorMessages={errorMessages}
                                        />
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                              <ChannelCodeForm
                                {...common}
                                action={addIncomeChannelCodeAction}
                                channelId={channel.id}
                                codes={codes}
                                first={false}
                              />
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </AdminDisclosure>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Onthouden teksten" : "Remembered texts"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Een tekst die bij Na te kijken onthouden werd, krijgt bij elke volgende export dezelfde code."
            : "A text remembered under To review gets the same code with every later export."}
        </p>
        {rules.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">{nl ? "Nog niets onthouden." : "Nothing remembered yet."}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-vtk-blue/8 last:border-0">
                  <td className="py-2 pr-4">
                    {rule.text}
                    <span className="block text-xs text-vtk-muted">{SOURCE_LABELS[rule.source]}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="tabular-nums">{rule.accountingCode.code}</span> {rule.accountingCode.name}
                  </td>
                  <td className="py-2 text-right">
                    <DeleteIconButton
                      action={deleteIncomeNameRuleAction}
                      fields={{ id: rule.id }}
                      label={nl ? "Vergeten" : "Forget"}
                      srLabel={nl ? `Vergeten: ${rule.text}` : `Forget: ${rule.text}`}
                      title={nl ? "Deze tekst vergeten?" : "Forget this text?"}
                      description={
                        nl
                          ? `Transacties met "${rule.text}" die hun code van deze regel kregen, staan daarna weer bij Na te kijken, behalve in een afgesloten periode. Wat met de hand toegewezen werd, blijft.`
                          : `Transactions with "${rule.text}" that got their code from this rule go back to To review, except in a closed period. Manual assignments stay.`
                      }
                      confirmLabel={nl ? "Vergeten" : "Forget"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Tekst vergeten." : "Text forgotten."}
                      errorMessages={errorMessages}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "Afgesloten periodes" : "Closed periods"}</h2>
        {periods.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">
            {nl ? "Nog geen. Een periode sluit je af in het overzicht." : "None yet. You close a period in the overview."}
          </p>
        ) : (
          <ul className="mt-3 text-sm">
            {periods.map((period) => (
              <li key={period.id} className="flex items-center justify-between gap-3 border-b border-vtk-blue/8 py-2 last:border-0">
                <span>
                  {periodLabel(period.from, period.to, nl)}
                  <span className="text-vtk-muted">
                    {" "}
                    · {period.closedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB")}
                    {period.closedByName ? ` · ${period.closedByName}` : ""}
                  </span>
                </span>
                <ConfirmIconButton
                  icon={<UndoIcon />}
                  action={reopenIncomePeriodAction}
                  fields={{ id: period.id }}
                  label={nl ? "Heropenen" : "Reopen"}
                  srLabel={nl ? `Heropenen: ${periodLabel(period.from, period.to, nl)}` : `Reopen: ${periodLabel(period.from, period.to, nl)}`}
                  title={nl ? "Periode heropenen?" : "Reopen this period?"}
                  description={
                    nl
                      ? "Daarna kan een export er weer iets aan toevoegen en kan je opnieuw toewijzen. Wat al bij de boekhouder ligt, verandert niet vanzelf mee: stuur een nieuwe versie."
                      : "After that, an export can add to it again and you can assign again. What the accountant already has does not change by itself: send a new version."
                  }
                  confirmLabel={nl ? "Heropenen" : "Reopen"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Periode heropend." : "Period reopened."}
                  errorMessages={errorMessages}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
