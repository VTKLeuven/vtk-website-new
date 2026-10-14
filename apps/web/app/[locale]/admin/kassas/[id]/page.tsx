import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { hasLocale } from "@/lib/locale";
import { preferredEmail } from "@/lib/brevo/contacts";
import { formatEuro, formatSubmittedOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import {
  canEditRequest,
  canView,
  cashRegisterAccess,
  getCashRegisterConfig,
  ticketIncomeByEvent,
} from "@/lib/kassas/server";
import {
  countsLines,
  countsTotalCents,
  denominationLabel,
  normaliseCounts,
  statusLabel,
} from "@/lib/kassas/kassa";
import {
  acceptCashRegisterAction,
  deleteCashRegisterAction,
  saveCashRegisterCountAction,
  setCashRegisterStatusAction,
  updateCashRegisterRequestAction,
} from "@/app/actions/kassas";
import { CountForm, type TicketOption } from "../CountForm";
import { RequestForm } from "../RequestForm";
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
      requestedBy: {
        select: { name: true, email: true, personalEmail: true, emailPreference: true },
      },
      acceptedBy: { select: { name: true } },
      payments: { orderBy: { sortOrder: "asc" } },
      ticketEvents: { select: { ticketEventId: true } },
    },
  });
  // Een id die je niet mag zien, bestaat voor jou niet.
  if (!register || !access.canRequest || !canView(access, register)) notFound();

  const manage = access.canManage;
  const editable = canEditRequest(access, register);
  const requested = register.status === "REQUESTED";
  const config = await getCashRegisterConfig();
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
  const requesterEmail = register.requestedBy ? preferredEmail(register.requestedBy) : null;

  const facts: Array<{ label: string; value: string }> = [
    { label: nl ? "Datum" : "Date", value: longDate },
    { label: nl ? "Post" : "Post", value: register.postLabel },
    { label: nl ? "Verantwoordelijke" : "Person responsible", value: register.responsibleName },
    {
      label: nl ? "Aangevraagd door" : "Requested by",
      value: `${register.requestedBy?.name ?? (nl ? "onbekend" : "unknown")}, ${formatSubmittedOn(register.createdAt, locale)}`,
    },
    {
      label: nl ? "Kaartbetalingen" : "Card payments",
      value:
        [register.wantsBancontact ? "Bancontact" : "", register.wantsPayconiq ? "Payconiq" : ""]
          .filter(Boolean)
          .join(nl ? " en " : " and ") || (nl ? "geen" : "none"),
    },
    {
      label: nl ? "Startkassa" : "Starting float",
      value:
        startCents > 0
          ? `${formatEuro(startCents, locale)}: ${countsLines(startCounts)
              .map((line) => `${line.pieces} × ${denominationLabel(line.denomination)}`)
              .join(", ")}`
          : nl
            ? "geen wisselgeld"
            : "no change",
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
      values={{
        id: register.id,
        date: toDateInputValue(register.date),
        activity: register.activity,
        groupId: register.groupId ?? "",
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
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              requested ? "bg-vtk-yellow text-vtk-on-yellow" : "bg-vtk-blue-soft text-vtk-body"
            }`}
          >
            {statusLabel(register.status, nl)}
          </span>
        </div>
        <p className="text-sm text-vtk-muted">
          {longDate} · {register.postLabel}
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
          <SaveForm
            action={acceptCashRegisterAction}
            submitLabel={nl ? "Aanvaarden en mailen" : "Accept and email"}
            savingLabel={nl ? "Bezig met aanvaarden..." : "Accepting..."}
            savedMessage={nl ? "Aanvaard." : "Accepted."}
            errorMessages={errorMessages}
            fallbackErrorMessage={nl ? "Aanvaarden mislukt." : "Could not accept."}
            confirmSubmit={{
              title: nl ? "Aanvaarden en mailen?" : "Accept and send the email?",
              description: requesterEmail
                ? nl
                  ? `Er vertrekt meteen een mail naar ${requesterEmail}. Pas de aanvraag hieronder eerst aan als het wisselgeld niet klopt: de mail toont wat er nu staat.`
                  : `An email goes to ${requesterEmail} right away. Adjust the request below first if the change is wrong: the email shows what is there now.`
                : nl
                  ? "De aanvrager heeft geen account meer, dus er vertrekt geen mail. Laat het de post zelf weten."
                  : "The requester no longer has an account, so no email goes out. Let the post know yourself.",
              confirmLabel: nl ? "Aanvaarden" : "Accept",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }}
            className="mt-4"
          >
            <input type="hidden" name="id" value={register.id} />
          </SaveForm>
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

      {!manage && !requested && (
        <p className="rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-vtk-body">
          {nl
            ? `Beheer aanvaardde deze aanvraag. Spreek een ophaalmoment af met de financieel beheerders of via ${config.contactEmail}; daar kan je ook terecht als er nog iets moet veranderen.`
            : `Administration accepted this request. Arrange a pick-up time with the financial managers or via ${config.contactEmail}; that is also where to go if anything still needs to change.`}
        </p>
      )}

      {requestForm &&
        (manage ? (
          // Bij Beheer is de aanvraag na het aanvaarden een detail; de telling is
          // dan het werk. Openklappen kan nog altijd om het wisselgeld bij te
          // stellen.
          // De sleutel hangt aan de aanvraagstand: na het aanvaarden klapt de
          // aanvraag zo vanzelf dicht en staat de telling open.
          <AdminDisclosure
            key={requested ? "aanvraag" : "aanvaard"}
            defaultOpen={requested}
            summary={
              <span>
                <span className="block font-semibold text-vtk-ink">{nl ? "Aanvraag aanpassen" : "Edit the request"}</span>
                <span className="block text-xs text-vtk-muted">
                  {nl
                    ? "Datum, post, verantwoordelijke, kaartbetalingen en startkassa"
                    : "Date, post, person responsible, card payments and starting float"}
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
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
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
          />
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
