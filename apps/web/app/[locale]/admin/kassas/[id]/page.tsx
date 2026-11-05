import type { ReactNode } from "react";
import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Prisma } from "@prisma/client";
import { pick, type Locale } from "@vtk/i18n";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { formatEuro, formatSpentOn, formatSubmittedOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import {
  canEditRequest,
  canSeeResult,
  canView,
  cashRegisterAccess,
  cashRegisterMailTo,
  getCashRegisterConfig,
  resultFor,
  sameTerminal,
  terminalsInUse,
  ticketIncomeByEvent,
} from "@/lib/kassas/server";
import {
  countsLines,
  countsTotalCents,
  denominationLabel,
  isYearlyEvent,
  normaliseCounts,
  registerInterval,
  resultSharedWithPost,
  sameCounts,
  STATUS_SLUGS,
  statusLabel,
  timeInputValue,
  timeRangeLabel,
  timeRangeShort,
  YEARLY_EVENT_CHOICE,
  type Counts,
  type PaymentMethod,
} from "@/lib/kassas/kassa";
import { SaveForm } from "@/components/ui/SaveForm";
import { kassaImportAmounts } from "@/lib/inkomsten/server";
import { listAccountingCodes } from "@/lib/accounting/server";
import {
  acceptCashRegisterAction,
  carryOverCashRegisterAction,
  deleteCashRegisterAction,
  saveCashRegisterCountAction,
  sendCashRegisterCountedMailAction,
  setCashRegisterCodeAction,
  setCashRegisterStatusAction,
  updateCashRegisterRequestAction,
} from "@/app/actions/kassas";
import { AcceptForm, type CodeSuggestion, type DeviceOption } from "../AcceptForm";
import { CarryOverForm, type CarryOverCandidate } from "../CarryOverForm";
import { CodeForm } from "../CodeForm";
import { CountForm, type TicketOption } from "../CountForm";
import { RequestForm } from "../RequestForm";
import { ResultSummary } from "../ResultSummary";
import { StatusSelect } from "../StatusSelect";
import { kassaErrorMessages } from "../messages";
import { postChoices } from "../posts";

export default async function KassaDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/${id}`);
  const register = await prisma.cashRegister.findUnique({
    where: { id },
    include: {
      group: { select: { code: true, type: true } },
      requestedBy: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          personalEmail: true,
          emailPreference: true,
          googleEmail: true,
        },
      },
      acceptedBy: { select: { name: true } },
      startFrom: { select: { id: true, activity: true, date: true } },
      carriedTo: { select: { id: true, activity: true, date: true, startCounts: true } },
      payments: { orderBy: { sortOrder: "asc" } },
      ticketEvents: { select: { ticketEventId: true } },
    },
  });
  // Een id die je niet mag zien, bestaat voor jou niet.
  if (!register || !access.canRequest || !canView(access, register)) notFound();

  const manage = access.canManage;
  const editable = canEditRequest(access, register);
  const requested = register.status === "REQUESTED";
  // Beheer ziet het resultaat in de telling; de post enkel hier, en pas vanaf
  // "doorgegeven".
  const sharedResult =
    !manage && canSeeResult(access, register)
      ? resultFor(register, await ticketIncomeByEvent(register.ticketEvents.map((link) => link.ticketEventId)))
      : null;
  const config = await getCashRegisterConfig();
  // De kassacontrole: wat de online inkomsten per toestel zagen. Enkel bij het
  // tellen, en enkel voor wie de online inkomsten mag zien.
  const seesIncome = access.canCheckIncome;
  const importAmounts = !requested && seesIncome ? await kassaImportAmounts(register) : [];
  // De code voor de online inkomsten kiest Beheer, enkel voor een kassa met toestellen.
  const hasDevices = register.wantsBancontact || register.wantsPayconiq || register.payments.length > 0;
  const codes = manage && hasDevices ? await listAccountingCodes() : [];
  const suggestion =
    manage && hasDevices && !register.accountingCodeId
      ? await codeSuggestion(register.ticketEvents.map((link) => link.ticketEventId), locale)
      : null;
  const linkedIncome =
    !requested && seesIncome && hasDevices
      ? await prisma.incomeTransaction.aggregate({
          where: { cashRegisterId: register.id },
          _count: true,
          _sum: { amountCents: true },
        })
      : null;
  const carryOver =
    manage && !requested
      ? await carryOverCandidates(
          register,
          register.carriedTo?.id ?? null,
          register.endCounts === null ? null : normaliseCounts(register.endCounts),
          locale,
        )
      : [];
  const errorMessages = kassaErrorMessages(locale);
  const startCounts = normaliseCounts(register.startCounts);
  const startCents = countsTotalCents(startCounts);
  const longDate = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(register.date);
  const listHref = `${base}/admin/kassas${manage ? "" : "/mijn"}`;
  const requesterEmail = register.requestedBy ? cashRegisterMailTo(register.requestedBy, register.group) : null;
  const counted = register.endCounts !== null;
  const endCounts = counted ? normaliseCounts(register.endCounts) : null;
  const passesOn = !resultSharedWithPost(register.status);
  const hours = timeRangeLabel(register.startsAt, register.endsAt, nl);
  // "Bancontact (Evenementen)": het toestel dat Beheer koos, zodra het gekozen is.
  const deviceLabel = (method: PaymentMethod, label: string) => {
    const names = register.payments.filter((payment) => payment.method === method).map((payment) => payment.terminal);
    return names.length ? `${label} (${names.join(", ")})` : label;
  };

  const startLabel =
    startCents > 0
      ? `${formatEuro(startCents, locale)}: ${countsLines(startCounts)
          .map((line) => `${line.pieces} × ${denominationLabel(line.denomination)}`)
          .join(", ")}`
      : nl
        ? "geen wisselgeld"
        : "no change";

  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: nl ? "Datum" : "Date", value: longDate },
    // Een kassa van voor er naar de uren gevraagd werd, heeft er geen; dan
    // valt de regel weg in plaats van "niet ingevuld" te tonen.
    ...(hours ? [{ label: nl ? "Uur" : "Time", value: hours }] : []),
    { label: nl ? "Post" : "Post", value: register.postLabel },
    { label: nl ? "Verantwoordelijke" : "Person responsible", value: register.responsibleName },
    {
      label: nl ? "Aangevraagd door" : "Requested by",
      value: `${register.requestedBy?.name ?? (nl ? "onbekend" : "unknown")}, ${formatSubmittedOn(register.createdAt, locale)}`,
    },
    {
      label: nl ? "Kaartbetalingen" : "Card payments",
      value:
        [
          register.wantsBancontact ? deviceLabel("BANCONTACT", "Bancontact") : "",
          register.wantsPayconiq ? deviceLabel("PAYCONIQ", "Payconiq") : "",
        ]
          .filter(Boolean)
          .join(nl ? " en " : " and ") || (nl ? "geen" : "none"),
    },
    {
      label: nl ? "Startkassa" : "Starting float",
      // Waar een doorgeschoven startkassa vandaan komt, ziet enkel Beheer: de
      // kassa ervoor is vaak van een andere post.
      value:
        manage && register.startFrom ? (
          <>
            {startLabel}
            <span className="block text-vtk-muted">
              {nl ? "De eindkassa van " : "The closing count of "}
              <Link href={`${base}/admin/kassas/${register.startFrom.id}`} className="underline underline-offset-4">
                {register.startFrom.activity}
              </Link>{" "}
              ({formatSpentOn(register.startFrom.date, locale)}){nl ? ", doorgeschoven." : ", carried over."}
            </span>
          </>
        ) : (
          startLabel
        ),
    },
    ...(register.comment ? [{ label: nl ? "Opmerking" : "Note", value: register.comment }] : []),
    ...(register.acceptedAt
      ? [
          {
            label: nl ? "Aanvaard" : "Accepted",
            value: `${formatSubmittedOn(register.acceptedAt, locale)}${
              register.acceptedBy ? ` ${nl ? "door" : "by"} ${register.acceptedBy.name}` : ""
            }${
              manage
                ? register.acceptedMailSentAt
                  ? nl
                    ? ", mail vertrokken"
                    : ", email sent"
                  : nl
                    ? ", zonder mail"
                    : ", without email"
                : ""
            }`,
          },
        ]
      : []),
  ];

  const requestForm = editable ? (
    <RequestForm
      locale={locale}
      action={updateCashRegisterRequestAction}
      posts={(await postChoices(access, locale, register.groupId)).map((post) => ({ id: post.id, name: post.name }))}
      // Bij Beheer staat de startkassa voor het aanvaarden in het aanvaardformulier.
      floatMode={manage ? (requested ? "keep" : "count") : "pick"}
      values={{
        id: register.id,
        date: toDateInputValue(register.date),
        startTime: timeInputValue(register.startsAt),
        endTime: timeInputValue(register.endsAt),
        activity: register.activity,
        groupId: register.groupId ?? (isYearlyEvent(register) ? YEARLY_EVENT_CHOICE : ""),
        responsibleName: register.responsibleName,
        wantsBancontact: register.wantsBancontact,
        wantsPayconiq: register.wantsPayconiq,
        comment: register.comment ?? "",
        startCounts,
      }}
      labels={{
        submitLabel: nl ? "Aanvraag opslaan" : "Save request",
        savingLabel: nl ? "Bezig met opslaan..." : "Saving...",
        savedMessage: nl ? "Aanvraag opgeslagen." : "Request saved.",
        fallbackErrorMessage: nl ? "Opslaan mislukt." : "Could not save.",
        errorMessages,
      }}
    />
  ) : null;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link href={listHref} className="text-sm text-vtk-muted underline underline-offset-4">
          {manage ? (nl ? "Alle kassa's" : "All cash registers") : nl ? "Mijn aanvragen" : "My requests"}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{register.activity}</h1>
          <span
            data-status={STATUS_SLUGS[register.status]}
            className="vtk-kassa-status inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
          >
            {statusLabel(register.status, nl)}
          </span>
        </div>
        <p className="text-sm text-vtk-muted">
          {longDate}
          {hours ? `, ${hours}` : ""} · {register.postLabel}
        </p>
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-vtk-muted">{fact.label}</dt>
              <dd className="whitespace-pre-line text-vtk-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {manage && requested && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5 shadow-[inset_3px_0_0_var(--yellow)]">
          <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Aanvraag aanvaarden" : "Accept the request"}</h2>
          <p className="mt-1 text-sm text-vtk-body">
            {nl
              ? `De kassa gaat naar "te maken", en ${register.requestedBy?.name ?? "de aanvrager"} krijgt een mail om een ophaalmoment af te spreken met de financieel beheerders of via ${config.contactEmail}.`
              : `The register moves to "to make", and ${register.requestedBy?.name ?? "the requester"} gets an email to arrange a pick-up time with the financial managers or via ${config.contactEmail}.`}
          </p>
          <AcceptForm
            locale={locale}
            base={base}
            action={acceptCashRegisterAction}
            id={register.id}
            startCounts={startCounts}
            {...(await deviceOptionsFor(register, config, nl))}
            codes={codes}
            suggestion={suggestion}
            confirmDescription={
              requesterEmail
                ? nl
                  ? `Er vertrekt meteen een mail naar ${requesterEmail}, met de startkassa en de toestellen zoals ze hier staan.`
                  : `An email goes to ${requesterEmail} right away, with the starting float and the devices as they are here.`
                : nl
                  ? "De aanvrager heeft geen account meer, dus er vertrekt geen mail. Laat het de post zelf weten."
                  : "The requester no longer has an account, so no email goes out. Let the post know yourself."
            }
            errorMessages={errorMessages}
          />
        </section>
      )}

      {manage && register.status !== "REQUESTED" && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-vtk-blue/12 bg-white px-5 py-4">
          <span className="text-sm font-semibold text-vtk-ink">Status</span>
          <StatusSelect
            id={register.id}
            status={register.status}
            action={setCashRegisterStatusAction}
            locale={locale}
            label={`Status: ${register.activity}`}
            errorMessages={errorMessages}
          />
          <span className="text-xs text-vtk-muted">
            {nl ? "Kiezen is opslaan." : "Choosing saves it."}
          </span>
        </section>
      )}

      {manage && !requested && hasDevices && (
        // Na te kijken linkt hierheen voor een kassa die nog geen code heeft.
        <section id="online-inkomsten" className="scroll-mt-24 rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Online inkomsten" : "Online income"}</h2>
          <p className="mt-1 mb-3 max-w-2xl text-sm text-vtk-muted">
            {nl
              ? "Wat er tijdens deze kassa op haar bakjes en rekeningen binnenkwam, krijgt deze code in de online inkomsten. Op een gedeeld toestel loopt de kassa tot de volgende kassa met dat toestel; op een toestel van een post enkel tijdens haar uren."
              : "What came in on its terminals and accounts during this register gets this code in the online income. On a shared device the register runs until the next register with that device; on a post's device only during its hours."}
          </p>
          <CodeForm
            locale={locale}
            action={setCashRegisterCodeAction}
            id={register.id}
            codes={codes}
            value={register.accountingCodeId}
            suggestion={suggestion}
            errorMessages={errorMessages}
          />
          {linkedIncome ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {linkedIncome._count === 0
                ? nl
                  ? "Nog geen transacties van de online inkomsten gekoppeld aan deze kassa."
                  : "No online income transactions linked to this register yet."
                : nl
                  ? `${linkedIncome._count === 1 ? "1 transactie" : `${linkedIncome._count} transacties`} (${formatEuro(linkedIncome._sum.amountCents ?? 0, locale)}) van de online inkomsten kregen hun code van deze kassa.`
                  : `${linkedIncome._count} online income ${linkedIncome._count === 1 ? "transaction" : "transactions"} (${formatEuro(linkedIncome._sum.amountCents ?? 0, locale)}) got their code from this register.`}
            </p>
          ) : null}
        </section>
      )}

      {sharedResult && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Resultaat" : "Result"}</h2>
            <p className="mt-1 text-sm text-vtk-muted">
              {nl
                ? `Beheer telde deze kassa en gaf het resultaat door. Klopt er iets niet, mail dan ${config.contactEmail}.`
                : `Administration counted this register and passed on the result. If something looks wrong, email ${config.contactEmail}.`}
            </p>
          </div>
          <ResultSummary result={sharedResult} locale={locale} />
        </section>
      )}

      {!manage && !requested && !sharedResult && (
        <p className="rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-vtk-body">
          {nl
            ? `Beheer aanvaardde deze aanvraag. Spreek een ophaalmoment af met de financieel beheerders of via ${config.contactEmail}; daar kan je ook terecht als er nog iets moet veranderen.`
            : `Administration accepted this request. Arrange a pick-up time with the financial managers or via ${config.contactEmail}; that is also where to go if anything still needs to change.`}
        </p>
      )}

      {requestForm &&
        (manage ? (
          // Bij Beheer is de aanvraag een detail: voor het aanvaarden staat het
          // werk (wisselgeld en toestellen) in het aanvaardformulier, daarna in
          // de telling. Openklappen kan om iets recht te zetten.
          <AdminDisclosure
            summary={
              <span>
                <span className="block font-semibold text-vtk-ink">{nl ? "Aanvraag aanpassen" : "Edit the request"}</span>
                <span className="block text-xs text-vtk-muted">
                  {requested
                    ? nl
                      ? "Datum, uren, post, verantwoordelijke en kaartbetalingen"
                      : "Date, times, post, person responsible and card payments"
                    : nl
                      ? "Datum, uren, post, verantwoordelijke, kaartbetalingen en startkassa"
                      : "Date, times, post, person responsible, card payments and starting float"}
                </span>
              </span>
            }
          >
            {requestForm}
          </AdminDisclosure>
        ) : (
          <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-vtk-ink">
              {nl ? "Aanvraag aanpassen" : "Edit the request"}
            </h2>
            {requestForm}
          </section>
        ))}

      {manage && !requested && (
        <section id="tellen" className="scroll-mt-24 rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-vtk-ink">{nl ? "Kassa tellen" : "Count the register"}</h2>
          <CountForm
            locale={locale}
            action={saveCashRegisterCountAction}
            id={register.id}
            startCounts={startCounts}
            endCounts={register.endCounts === null ? null : normaliseCounts(register.endCounts)}
            shiftVouchers={register.shiftVouchers}
            elixirVouchers={register.elixirVouchers}
            shiftVoucherValueCents={register.shiftVoucherValueCents}
            elixirVoucherValueCents={register.elixirVoucherValueCents}
            payments={register.payments.map((payment) => ({
              method: payment.method,
              terminal: payment.terminal,
              amountCents: payment.amountCents,
            }))}
            wantsBancontact={register.wantsBancontact}
            wantsPayconiq={register.wantsPayconiq}
            bancontactTerminals={config.bancontactTerminals}
            payconiqAccounts={config.payconiqAccounts}
            ticketOptions={await ticketOptionsFor(register, locale)}
            linkedTicketIds={register.ticketEvents.map((link) => link.ticketEventId)}
            note={register.note ?? ""}
            errorMessages={errorMessages}
            importAmounts={importAmounts}
            incomeSettingsHref={`${base}/admin/inkomsten/instellingen`}
          />
        </section>
      )}

      {manage && !requested && (
        <section id="doorschuiven" className="scroll-mt-24 rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-base font-semibold text-vtk-ink">
            {nl ? "Doorschuiven naar de volgende kassa" : "Carry over to the next register"}
          </h2>
          <p className="mt-1 mb-3 max-w-2xl text-sm text-vtk-muted">
            {nl
              ? "Gaat dit cash zonder leegmaken naar een volgende activiteit? Dan wordt de eindkassa hier, per munt en briefje, de startkassa van die kassa. De bonnen, Bancontact en Payconiq blijven bij deze kassa."
              : "Does this cash go on to a next activity without being emptied? Then the closing count here, coin by coin and note by note, becomes the starting float of that register. Vouchers, Bancontact and Payconiq stay with this register."}
            {!counted && (nl ? " Kan zodra de eindkassa geteld en opgeslagen is." : " Available once the closing count is saved.")}
          </p>
          {register.carriedTo && (
            <div className="mb-3 space-y-2 text-sm text-vtk-body">
              <p>
                {nl ? "Doorgeschoven naar " : "Carried over to "}
                <Link href={`${base}/admin/kassas/${register.carriedTo.id}`} className="font-medium text-vtk-ink underline underline-offset-4">
                  {register.carriedTo.activity}
                </Link>{" "}
                ({formatSpentOn(register.carriedTo.date, locale)}).
              </p>
              {endCounts && !sameCounts(endCounts, normaliseCounts(register.carriedTo.startCounts)) && (
                <p className="rounded-xl bg-vtk-yellow/15 px-3 py-2">
                  {nl
                    ? `De startkassa daar (${formatEuro(countsTotalCents(normaliseCounts(register.carriedTo.startCounts)), locale)}) is niet meer gelijk aan de eindkassa hier (${formatEuro(countsTotalCents(endCounts), locale)}), per munt en briefje. Schuif opnieuw door om ze gelijk te zetten.`
                    : `The starting float there (${formatEuro(countsTotalCents(normaliseCounts(register.carriedTo.startCounts)), locale)}) no longer matches the closing count here (${formatEuro(countsTotalCents(endCounts), locale)}), coin by coin and note by note. Carry over again to make them match.`}
                </p>
              )}
            </div>
          )}
          {carryOver.length > 0 ? (
            <CarryOverForm
              locale={locale}
              action={carryOverCashRegisterAction}
              id={register.id}
              counted={counted}
              endCents={endCounts ? countsTotalCents(endCounts) : 0}
              candidates={carryOver}
              currentTargetId={register.carriedTo?.id ?? null}
              errorMessages={errorMessages}
            />
          ) : (
            <p className="text-sm text-vtk-body">
              {nl
                ? "Er staat geen latere kassa klaar die nog niet geteld is. Vraag eerst de kassa voor de volgende activiteit aan, ook als die van een andere post is: "
                : "There is no later register that has not been counted yet. Request the register for the next activity first, also when it belongs to another post: "}
              <Link href={`${base}/admin/kassas/aanvragen`} className="font-medium text-vtk-ink underline underline-offset-4">
                {nl ? "kassa aanvragen" : "request a register"}
              </Link>
              .
            </p>
          )}
        </section>
      )}

      {manage && !requested && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Mailen dat de kassa geteld is" : "Email that the register was counted"}</h2>
          <p className="mt-1 mb-3 max-w-2xl text-sm text-vtk-muted">
            {!requesterEmail
              ? nl
                ? "De aanvrager heeft geen account meer, dus er kan geen mail vertrekken. Laat het de post zelf weten."
                : "The requester no longer has an account, so no email can go out. Let the post know yourself."
              : !counted
                ? nl
                  ? "Kan zodra de eindkassa geteld en opgeslagen is."
                  : "Available once the closing count is saved."
                : register.countedMailSentAt
                  ? nl
                    ? `Vertrok op ${formatSubmittedOn(register.countedMailSentAt, locale)}. Opnieuw sturen kan, bijvoorbeeld na een rechtgezette telling.`
                    : `Sent on ${formatSubmittedOn(register.countedMailSentAt, locale)}. You can send it again, for instance after correcting the count.`
                  : nl
                    ? `De mail gaat naar ${requesterEmail}, met het resultaat van de telling.`
                    : `The email goes to ${requesterEmail}, with the result of the count.`}
          </p>
          <SaveForm
            action={sendCashRegisterCountedMailAction}
            submitLabel={nl ? "Mail sturen" : "Send email"}
            savingLabel={nl ? "Bezig met sturen..." : "Sending..."}
            savedMessage={nl ? "Mail verstuurd." : "Email sent."}
            errorMessages={errorMessages}
            fallbackErrorMessage={nl ? "De mail kon niet vertrekken." : "The email could not be sent."}
            resetOnSuccess={false}
            submitDisabled={!counted || !requesterEmail}
            confirmSubmit={{
              title: nl ? "Mailen dat de kassa geteld is?" : "Email that the register was counted?",
              description: nl
                ? `Er vertrekt meteen een mail naar ${requesterEmail}, met het resultaat zoals het nu geteld is.${passesOn ? ' De status gaat naar "doorgegeven", zodat de post het resultaat ook hier ziet.' : ""}`
                : `An email goes to ${requesterEmail} right away, with the result as counted now.${passesOn ? ' The status moves to "passed on", so the post can see the result here too.' : ""}`,
              confirmLabel: nl ? "Mail sturen" : "Send email",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }}
          >
            <input type="hidden" name="id" value={register.id} />
          </SaveForm>
        </section>
      )}

      {editable && (
        <div className="flex justify-end">
          <DeleteButton
            action={deleteCashRegisterAction}
            fields={{ id: register.id, locale }}
            title={
              manage
                ? nl
                  ? "Kassa verwijderen?"
                  : "Delete this cash register?"
                : nl
                  ? "Aanvraag intrekken?"
                  : "Withdraw this request?"
            }
            description={
              manage
                ? nl
                  ? `De kassa van ${register.postLabel} voor ${register.activity} op ${longDate} verdwijnt, met de telling, de Bancontact- en Payconiq-bedragen en de koppeling met de ticketverkoop. De ticketverkoop zelf blijft bestaan, net als het adminlogboek.`
                  : `The ${register.postLabel} register for ${register.activity} on ${longDate} disappears, with its count, the Bancontact and Payconiq amounts and the link to the ticket sale. The ticket sale itself stays, as does the admin log.`
                : nl
                  ? `Je aanvraag voor ${register.activity} op ${longDate} verdwijnt; Beheer ziet ze niet meer. Heb je toch een kassa nodig, dan vraag je opnieuw aan.`
                  : `Your request for ${register.activity} on ${longDate} disappears; Administration no longer sees it. If you do need a register after all, request one again.`
            }
            confirmLabel={manage ? (nl ? "Verwijderen" : "Delete") : nl ? "Intrekken" : "Withdraw"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            errorMessages={errorMessages}
            errorFallback={nl ? "Verwijderen mislukt." : "Could not delete."}
          >
            {manage ? (nl ? "Kassa verwijderen" : "Delete register") : nl ? "Aanvraag intrekken" : "Withdraw request"}
          </DeleteButton>
        </div>
      )}
    </div>
  );
}

/** Meer latere kassa's dan dit in de keuzelijst helpt niemand; de eerste staan bovenaan. */
const CARRY_OVER_LIMIT = 40;

/**
 * De kassa's waar de eindkassa naartoe kan: die van dezelfde dag of later die
 * nog niet geteld zijn, de vroegste eerst. De kassa die er al mee verderging,
 * staat er altijd bij, ook geteld: opnieuw doorschuiven zet haar startkassa
 * gelijk na een rechtgezette telling.
 */
async function carryOverCandidates(
  register: { id: string; date: Date },
  currentTargetId: string | null,
  endCounts: Counts | null,
  locale: "nl" | "en",
): Promise<CarryOverCandidate[]> {
  const nl = locale === "nl";
  const select = {
    id: true,
    activity: true,
    postLabel: true,
    date: true,
    startsAt: true,
    endsAt: true,
    status: true,
    startCounts: true,
    endCounts: true,
    startFromId: true,
    startFrom: { select: { activity: true, date: true } },
  } satisfies Prisma.CashRegisterSelect;
  const [later, current] = await Promise.all([
    prisma.cashRegister.findMany({
      where: {
        id: { notIn: [register.id, ...(currentTargetId ? [currentTargetId] : [])] },
        date: { gte: register.date },
        endCounts: { equals: Prisma.DbNull },
      },
      orderBy: [{ date: "asc" }, { startsAt: "asc" }, { createdAt: "asc" }],
      take: CARRY_OVER_LIMIT,
      select,
    }),
    currentTargetId ? prisma.cashRegister.findUnique({ where: { id: currentTargetId }, select }) : null,
  ]);
  const rows = current ? [current, ...later] : later;
  return rows.map((row) => {
    const date = formatSpentOn(row.date, locale);
    const hours = timeRangeShort(row.startsAt, row.endsAt);
    const fromOther =
      row.startFrom && row.startFromId !== register.id
        ? `${row.startFrom.activity} (${formatSpentOn(row.startFrom.date, locale)})`
        : null;
    return {
      id: row.id,
      activity: row.activity,
      optionLabel: `${date}${hours ? ` ${hours}` : ""}: ${row.activity} (${row.postLabel}), ${statusLabel(row.status, nl).toLowerCase()}${
        fromOther ? (nl ? `, startkassa van ${fromOther}` : `, float from ${fromOther}`) : ""
      }`,
      shortLabel: `${row.activity} (${date})`,
      startCents: countsTotalCents(normaliseCounts(row.startCounts)),
      matchesEnd: endCounts !== null && sameCounts(endCounts, normaliseCounts(row.startCounts)),
      counted: row.endCounts !== null,
      fromOther,
    };
  });
}

/**
 * De ticketverkopen die je aan deze kassa kan koppelen: die van hetzelfde
 * werkingsjaar, plus wat er al aan hangt. De dichtst bij de datum van de
 * activiteit eerst, zodat de juiste meestal bovenaan staat.
 */
async function ticketOptionsFor(
  register: { groupId: string | null; date: Date; workingYear: number; ticketEvents: Array<{ ticketEventId: string }> },
  locale: "nl" | "en",
): Promise<TicketOption[]> {
  const from = new Date(Date.UTC(register.workingYear, 6, 15));
  const to = new Date(Date.UTC(register.workingYear + 1, 6, 15));
  const events = await prisma.ticketEvent.findMany({
    where: {
      OR: [
        { startsAt: { gte: from, lt: to } },
        { id: { in: register.ticketEvents.map((link) => link.ticketEventId) } },
      ],
    },
    select: { id: true, titleNl: true, titleEn: true, startsAt: true, ownerGroupId: true },
    take: 400,
  });
  const income = await ticketIncomeByEvent(events.map((event) => event.id));
  const dateFormat = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const distance = (startsAt: Date) => Math.abs(startsAt.getTime() - register.date.getTime());
  return [...events]
    .sort((a, b) => distance(a.startsAt) - distance(b.startsAt))
    .map((event) => ({
      id: event.id,
      title: pick(event.titleNl, event.titleEn, locale),
      dateLabel: dateFormat.format(event.startsAt),
      samePost: event.ownerGroupId === register.groupId,
      incomeCents: income.get(event.id) ?? 0,
    }));
}

/**
 * De code van de gekoppelde ticketverkopen, als voorstel voor de code van de
 * kassa: wat er aan de kassa binnenkomt, is meestal van hetzelfde evenement.
 * Enkel een voorstel, Beheer kiest. Hebben de ticketverkopen verschillende
 * codes, dan staat er niets ingevuld en noemt de zin ze allemaal.
 */
async function codeSuggestion(ticketEventIds: string[], locale: "nl" | "en"): Promise<CodeSuggestion | null> {
  if (ticketEventIds.length === 0) return null;
  const nl = locale === "nl";
  const events = await prisma.ticketEvent.findMany({
    where: { id: { in: ticketEventIds }, accountingCodeId: { not: null } },
    select: { titleNl: true, titleEn: true, accountingCode: { select: { id: true, code: true, name: true } } },
  });
  const coded = events.flatMap((event) => (event.accountingCode ? [{ title: pick(event.titleNl, event.titleEn, locale), code: event.accountingCode }] : []));
  if (coded.length === 0) return null;
  const ids = new Set(coded.map((event) => event.code.id));
  const list = coded.map((event) => `${event.title} (${event.code.code} ${event.code.name})`).join(", ");
  if (ids.size === 1) {
    return {
      id: coded[0].code.id,
      note: nl ? `Voorgesteld: de code van de gekoppelde ticketverkoop, ${list}.` : `Suggested: the code of the linked ticket sale, ${list}.`,
    };
  }
  return {
    id: null,
    note: nl ? `De gekoppelde ticketverkopen hebben verschillende codes: ${list}.` : `The linked ticket sales have different codes: ${list}.`,
  };
}

/**
 * De bakjes en rekeningen uit de instellingen voor het aanvaardformulier, met
 * bij elk de activiteit waar het op dat moment al ligt. `null` voor wat de post
 * niet vroeg.
 */
async function deviceOptionsFor(
  register: { id: string; date: Date; startsAt: Date | null; endsAt: Date | null; wantsBancontact: boolean; wantsPayconiq: boolean },
  config: { bancontactTerminals: string[]; payconiqAccounts: string[] },
  nl: boolean,
): Promise<{ bancontact: DeviceOption[] | null; payconiq: DeviceOption[] | null }> {
  if (!register.wantsBancontact && !register.wantsPayconiq) return { bancontact: null, payconiq: null };
  const inUse = await terminalsInUse(register.id, registerInterval(register));
  const options = (method: PaymentMethod, names: string[]): DeviceOption[] =>
    names.map((name) => {
      const use = inUse.find((candidate) => sameTerminal(candidate, { method, terminal: name }));
      return {
        name,
        busyWith: use
          ? `${use.activity}, ${timeRangeShort(use.startsAt, use.endsAt) ?? (nl ? "de hele dag" : "all day")}`
          : null,
      };
    });
  return {
    bancontact: register.wantsBancontact ? options("BANCONTACT", config.bancontactTerminals) : null,
    payconiq: register.wantsPayconiq ? options("PAYCONIQ", config.payconiqAccounts) : null,
  };
}
