import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { Button, Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { IconLink, RowActions } from "@/components/ui/IconButton";
import { CheckIcon, MegaphoneIcon, PencilIcon } from "@/components/ui/icons";
import {
  canSeeCommuRequests,
  commuFormHref,
  commuRequestCapabilities,
  COMMU_STATUS_LABELS,
  getCommuRequestForm,
  loadCommuRequests,
  requestsByEvent,
  sortByWhen,
  upcomingEventsWithoutRequest,
  type CommuRequestForm,
  type CommuRequestRow,
} from "@/lib/commu/requests";
import { groupByWeek, weekTitle } from "@/lib/commu/weeks";
import { CommuStatusSelect } from "./CommuStatusSelect";

type Status = keyof typeof COMMU_STATUS_LABELS;

/**
 * Commu-aanvragen: wat posten aanvragen voor het weekoverzicht, het Bakske en
 * de sociale media.
 *
 * Eén pagina met twee gezichten. Wie de aanvragen opvolgt (commu, IT, Groep 5,
 * en wie commu toegang gaf op het formulier) ziet ze allemaal per week van het
 * evenement. Een andere post ziet de eigen komende evenementen, met per
 * evenement of er al een aanvraag is en een knop om er een te doen.
 */
export default async function CommuRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tonen?: string; post?: string; nieuw?: string }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const session = await requireSession();

  if (!(await canSeeCommuRequests())) {
    return <p>{nl ? "Geen toegang." : "No access."}</p>;
  }

  const form = await getCommuRequestForm();
  const capabilities = await commuRequestCapabilities();
  const isViewer = capabilities.includes("VIEW_ENTRIES");
  const published = form?.status === "PUBLISHED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Commu-aanvragen" : "Comms requests"}</h1>
          <p className="mt-1 text-sm">
            {isViewer
              ? nl
                ? "Wat de posten aanvragen voor het weekoverzicht, het Bakske en de sociale media, per week van het evenement."
                : "What the posts request for the weekly overview, the Bakske and social media, by week of the event."
              : nl
                ? "Vraag communicatie aan voor je evenementen: het weekoverzicht, het Bakske en de sociale media. Eén aanvraag per evenement."
                : "Request communication for your events: the weekly overview, the Bakske and social media. One request per event."}
          </p>
        </div>
        {form && (published || capabilities.includes("MANAGE_FORM")) ? (
          <Link href={commuFormHref(form.slug)}>
            <Button>{nl ? "Nieuwe aanvraag" : "New request"}</Button>
          </Link>
        ) : null}
      </div>

      {!form ? (
        <Card className="p-5">
          <p className="text-sm">
            {nl
              ? "Er is nog geen aanvraagformulier gekoppeld. Iemand van IT maakt het aan met `npm run forms:commu`; daarna verschijnen de aanvragen hier."
              : "No request form is linked yet. Someone from IT creates it with `npm run forms:commu`; requests then show up here."}
          </p>
        </Card>
      ) : !published ? (
        <p className="rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-4 py-3 text-sm">
          {capabilities.includes("MANAGE_FORM") ? (
            <>
              {nl
                ? "Het aanvraagformulier staat nog als concept. Lees het na en zet het online bij "
                : "The request form is still a draft. Review it and publish it in "}
              <Link
                href={`${nl ? "" : "/en"}/admin/formulieren/${form.id}/instellingen`}
                className="font-medium underline"
              >
                {nl ? "de instellingen van het formulier" : "the form settings"}
              </Link>
              .
            </>
          ) : nl ? (
            "Het aanvraagformulier is nog niet online. Commu laat weten wanneer je kan aanvragen."
          ) : (
            "The request form is not online yet. Comms will let you know when you can submit requests."
          )}
        </p>
      ) : null}

      {form ? (
        isViewer ? (
          <CommuOverview
            locale={locale}
            form={form}
            canManage={capabilities.includes("MANAGE_ENTRIES")}
            canEditForm={capabilities.includes("MANAGE_FORM")}
            filters={filters}
          />
        ) : (
          <PostView
            locale={locale}
            form={form}
            published={published}
            userId={session.user.id}
            groupIds={session.groups.map((group) => group.id)}
          />
        )
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Commu: alle aanvragen per week
// -----------------------------------------------------------------------------

async function CommuOverview({
  locale,
  form,
  canManage,
  canEditForm,
  filters,
}: {
  locale: Locale;
  form: CommuRequestForm;
  canManage: boolean;
  canEditForm: boolean;
  filters: { tonen?: string; post?: string; nieuw?: string };
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const showPast = filters.tonen === "verleden";
  const onlyNew = filters.nieuw === "1";
  const today = ymdKey(brusselsYMD(new Date()));

  const all = await loadCommuRequests(form);
  const inPeriod = all.filter((row) =>
    showPast ? row.date !== null && row.date < today : row.date === null || row.date >= today
  );
  const posts = [...new Map(inPeriod.filter((row) => row.postCode).map((row) => [row.postCode!, row.post ?? row.postCode!])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const postFilter = posts.some(([code]) => code === filters.post) ? filters.post! : null;
  const newCount = inPeriod.filter((row) => row.reviewStatus === "NEW").length;

  const rows = sortByWhen(
    inPeriod.filter(
      (row) => (!postFilter || row.postCode === postFilter) && (!onlyNew || row.reviewStatus === "NEW")
    ),
    showPast ? "desc" : "asc"
  );
  const { weeks, undated } = groupByWeek(rows, (row) => row.date, today);
  const missing = showPast ? [] : await upcomingEventsWithoutRequest(form);

  const statusLabels = Object.fromEntries(
    Object.entries(COMMU_STATUS_LABELS).map(([key, labels]) => [key, labels[nl ? 0 : 1]])
  ) as Record<Status, string>;

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = {
      tonen: showPast ? "verleden" : null,
      post: postFilter,
      nieuw: onlyNew ? "1" : null,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    return `${base}/admin/commu-aanvragen${query ? `?${query}` : ""}`;
  };

  const table = (items: CommuRequestRow[]) => (
    <RequestTable
      locale={locale}
      formId={form.id}
      rows={items}
      canManage={canManage}
      statusLabels={statusLabels}
    />
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterPill href={href({ tonen: null, post: null })} active={!showPast}>
            {nl ? "Komend" : "Upcoming"}
          </FilterPill>
          <FilterPill href={href({ tonen: "verleden", post: null })} active={showPast}>
            {nl ? "Voorbij" : "Past"}
          </FilterPill>
          <FilterPill href={href({ nieuw: onlyNew ? null : "1" })} active={onlyNew}>
            {nl ? `Enkel nieuwe (${newCount})` : `New only (${newCount})`}
          </FilterPill>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {canEditForm ? (
            <Link href={`${base}/admin/formulieren/${form.id}/velden`} className="text-vtk-body hover:underline">
              {nl ? "Vragen aanpassen" : "Edit questions"}
            </Link>
          ) : null}
          <a href={`/api/forms/${form.id}/exports/entries?locale=${locale}`} className="text-vtk-body hover:underline">
            {nl ? "Exporteren (CSV)" : "Export (CSV)"}
          </a>
        </div>
      </div>

      {posts.length > 1 ? (
        <div className="flex flex-wrap gap-2" aria-label={nl ? "Post" : "Post"}>
          <FilterPill href={href({ post: null })} active={!postFilter}>
            {nl ? "Alle posten" : "All posts"}
          </FilterPill>
          {posts.map(([code, label]) => (
            <FilterPill key={code} href={href({ post: code })} active={postFilter === code}>
              {label}
            </FilterPill>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm">
            {showPast
              ? nl
                ? "Geen voorbije aanvragen die aan deze filter voldoen."
                : "No past requests match this filter."
              : nl
                ? "Geen komende aanvragen die aan deze filter voldoen."
                : "No upcoming requests match this filter."}
          </p>
        </Card>
      ) : null}

      {weeks.map((week) => (
        <section key={week.key} className="space-y-2" aria-labelledby={`week-${week.key}`}>
          <h2 id={`week-${week.key}`} className="vtk-commu-week">
            {weekTitle(week, nl)}
            <span>{rangeLabel(week.monday, week.sunday, locale)}</span>
          </h2>
          {table(week.items)}
        </section>
      ))}

      {undated.length > 0 ? (
        <section className="space-y-2" aria-labelledby="week-undated">
          <h2 id="week-undated" className="vtk-commu-week">
            {nl ? "Zonder datum" : "No date"}
          </h2>
          {table(undated)}
        </section>
      ) : null}

      {missing.length > 0 ? (
        <section className="space-y-2" aria-labelledby="missing-heading">
          <h2 id="missing-heading" className="vtk-commu-week">
            {nl ? "Nog geen aanvraag" : "No request yet"}
            <span>{nl ? "gepubliceerde evenementen, komende 3 weken" : "published events, next 3 weeks"}</span>
          </h2>
          <Card className="overflow-x-auto">
            <table className="vtk-commu-table w-full text-sm">
              <thead className="bg-vtk-blue-soft text-left">
                <tr>
                  <th className="px-4 py-2">{nl ? "Wanneer" : "When"}</th>
                  <th className="px-4 py-2">{nl ? "Evenement" : "Event"}</th>
                  <th className="px-4 py-2">Post</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-2" data-label={nl ? "Wanneer" : "When"}>
                      <When date={event.date} time={event.time} locale={locale} />
                    </td>
                    <td className="px-4 py-2 font-medium text-vtk-ink" data-label={nl ? "Evenement" : "Event"}>
                      {event.title}
                    </td>
                    <td className="px-4 py-2" data-label="Post">
                      {event.post}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </>
  );
}

function RequestTable({
  locale,
  formId,
  rows,
  canManage,
  statusLabels,
}: {
  locale: Locale;
  formId: string;
  rows: CommuRequestRow[];
  canManage: boolean;
  statusLabels: Record<Status, string>;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const label = {
    when: nl ? "Wanneer" : "When",
    activity: nl ? "Activiteit" : "Activity",
    facebook: "Facebook",
    bakske: "Bakske",
    promo: "Promo",
    texts: nl ? "Tekstjes" : "Texts",
    status: "Status",
  };

  return (
    <Card className="overflow-x-auto">
      <table className="vtk-commu-table w-full text-sm">
        <thead className="bg-vtk-blue-soft text-left">
          <tr>
            <th className="px-4 py-2">{label.when}</th>
            <th className="px-4 py-2">{label.activity}</th>
            <th className="px-4 py-2">{label.facebook}</th>
            <th className="px-4 py-2">{label.bakske}</th>
            <th className="px-4 py-2">{label.promo}</th>
            <th className="px-4 py-2">{label.texts}</th>
            <th className="px-4 py-2">{label.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = `${base}/admin/formulieren/${formId}/inzendingen/${row.entryId}`;
            return (
              <LinkedRow key={row.entryId} href={detail} className="cursor-pointer">
                <td className="px-4 py-2 align-top" data-label={label.when}>
                  <When date={row.date} time={row.time} locale={locale} />
                </td>
                <td className="px-4 py-2 align-top" data-label={label.activity}>
                  <Link href={detail} className="font-medium text-vtk-ink hover:underline">
                    {row.title || (nl ? "Zonder naam" : "Untitled")}
                  </Link>
                  <div className="text-xs text-vtk-muted">
                    {[row.post, row.submitterName].filter(Boolean).join(nl ? ", door " : ", by ")}
                  </div>
                </td>
                <td className="px-4 py-2 align-top" data-label={label.facebook}>
                  {row.facebook ?? <Empty />}
                </td>
                <td className="px-4 py-2 align-top" data-label={label.bakske}>
                  {row.bakske ?? <Empty />}
                </td>
                <td className="px-4 py-2 align-top" data-label={label.promo}>
                  {row.promo.length > 0 ? (
                    <ul className="space-y-0.5">
                      {row.promo.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <Empty />
                  )}
                </td>
                <td className="px-4 py-2 align-top" data-label={label.texts}>
                  {row.facebookText || row.bakskeText ? (
                    <ul className="space-y-0.5">
                      {row.facebookText ? (
                        <TextLine done={row.facebookText === "DONE"} label="Facebook" nl={nl} />
                      ) : null}
                      {row.bakskeText ? (
                        <TextLine done={row.bakskeText === "DONE"} label="Bakske" nl={nl} />
                      ) : null}
                    </ul>
                  ) : (
                    <Empty />
                  )}
                </td>
                <td className="px-4 py-2 align-top" data-label={label.status}>
                  {canManage ? (
                    <CommuStatusSelect
                      locale={locale}
                      entryId={row.entryId}
                      title={row.title}
                      status={row.reviewStatus}
                      labels={statusLabels}
                    />
                  ) : (
                    <StatusPill status={row.reviewStatus} label={statusLabels[row.reviewStatus]} />
                  )}
                </td>
              </LinkedRow>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Een post: de eigen komende evenementen en de eigen aanvragen
// -----------------------------------------------------------------------------

async function PostView({
  locale,
  form,
  published,
  userId,
  groupIds,
}: {
  locale: Locale;
  form: CommuRequestForm;
  published: boolean;
  userId: string;
  groupIds: string[];
}) {
  const nl = locale === "nl";
  const now = new Date();
  const events = groupIds.length
    ? await prisma.calendarEvent.findMany({
        where: { groupId: { in: groupIds }, end: { gte: now } },
        select: {
          id: true,
          titleNl: true,
          start: true,
          end: true,
          allDay: true,
          publishedAt: true,
          group: { select: { nameNl: true, nameEn: true } },
        },
        orderBy: { start: "asc" },
        take: 100,
      })
    : [];
  const requested = await requestsByEvent(
    form,
    events.map((event) => event.id)
  );
  const own = sortByWhen(await loadCommuRequests(form, { submittedById: userId }), "asc");
  const listedEventIds = new Set(events.map((event) => event.id));
  const today = ymdKey(brusselsYMD(now));
  const otherOwn = own.filter(
    (row) => !(row.eventId && listedEventIds.has(row.eventId)) && (row.date === null || row.date >= today)
  );
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  const label = {
    when: nl ? "Wanneer" : "When",
    event: nl ? "Evenement" : "Event",
    request: nl ? "Aanvraag" : "Request",
  };

  return (
    <>
      <section className="space-y-2" aria-labelledby="own-events">
        <h2 id="own-events" className="vtk-commu-week">
          {nl ? "Jullie komende evenementen" : "Your upcoming events"}
        </h2>
        {events.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm">
              {nl
                ? "Je post heeft geen komende evenementen in de kalender. Zet ze eerst in de kalender; staat iets er bewust niet in, dien dan een aanvraag in zonder evenement."
                : "Your post has no upcoming events in the calendar. Add them there first; for something that deliberately is not in it, submit a request without an event."}
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="vtk-commu-table w-full text-sm">
              <thead className="bg-vtk-blue-soft text-left">
                <tr>
                  <th className="px-4 py-2">{label.when}</th>
                  <th className="px-4 py-2">{label.event}</th>
                  <th className="px-4 py-2">{label.request}</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const request = requested.get(event.id);
                  const mine = request?.submittedById === userId;
                  return (
                    <tr key={event.id}>
                      <td className="px-4 py-2 align-top" data-label={label.when}>
                        <When
                          date={ymdKey(brusselsYMD(event.start))}
                          time={event.allDay ? null : `${timeFmt.format(event.start)} - ${timeFmt.format(event.end)}`}
                          locale={locale}
                        />
                      </td>
                      <td className="px-4 py-2 align-top" data-label={label.event}>
                        <div className="font-medium text-vtk-ink">{event.titleNl}</div>
                        <div className="text-xs text-vtk-muted">
                          {nl ? event.group.nameNl : event.group.nameEn}
                          {event.publishedAt ? "" : nl ? ", concept" : ", draft"}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-top" data-label={label.request}>
                        {request ? (
                          <StatusPill
                            status={request.reviewStatus}
                            label={COMMU_STATUS_LABELS[request.reviewStatus][nl ? 0 : 1]}
                          />
                        ) : (
                          <span className="text-vtk-muted">{nl ? "Nog niet aangevraagd" : "Not requested yet"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {published ? (
                          <RowActions>
                            {request && mine ? (
                              <IconLink
                                href={commuFormHref(form.slug, { inzending: request.entryId })}
                                label={nl ? "Aanvraag bewerken" : "Edit request"}
                                srLabel={`${nl ? "Aanvraag bewerken" : "Edit request"}: ${event.titleNl}`}
                              >
                                <PencilIcon />
                              </IconLink>
                            ) : null}
                            {request ? null : (
                              <IconLink
                                href={commuFormHref(form.slug, { evenement: event.id })}
                                label={nl ? "Commu aanvragen" : "Request comms"}
                                srLabel={`${nl ? "Commu aanvragen" : "Request comms"}: ${event.titleNl}`}
                              >
                                <MegaphoneIcon />
                              </IconLink>
                            )}
                          </RowActions>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {otherOwn.length > 0 ? (
        <section className="space-y-2" aria-labelledby="own-requests">
          <h2 id="own-requests" className="vtk-commu-week">
            {nl ? "Jouw andere aanvragen" : "Your other requests"}
          </h2>
          <Card className="overflow-x-auto">
            <table className="vtk-commu-table w-full text-sm">
              <thead className="bg-vtk-blue-soft text-left">
                <tr>
                  <th className="px-4 py-2">{label.when}</th>
                  <th className="px-4 py-2">{nl ? "Activiteit" : "Activity"}</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {otherOwn.map((row) => (
                  <tr key={row.entryId}>
                    <td className="px-4 py-2 align-top" data-label={label.when}>
                      <When date={row.date} time={row.time} locale={locale} />
                    </td>
                    <td className="px-4 py-2 align-top font-medium text-vtk-ink" data-label={nl ? "Activiteit" : "Activity"}>
                      {row.title}
                    </td>
                    <td className="px-4 py-2 align-top" data-label="Status">
                      <StatusPill
                        status={row.reviewStatus}
                        label={COMMU_STATUS_LABELS[row.reviewStatus][nl ? 0 : 1]}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      {published && form.allowEditAfterSubmit ? (
                        <RowActions>
                          <IconLink
                            href={commuFormHref(form.slug, { inzending: row.entryId })}
                            label={nl ? "Aanvraag bewerken" : "Edit request"}
                            srLabel={`${nl ? "Aanvraag bewerken" : "Edit request"}: ${row.title}`}
                          >
                            <PencilIcon />
                          </IconLink>
                        </RowActions>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Kleine bouwstenen
// -----------------------------------------------------------------------------

function When({ date, time, locale }: { date: string | null; time: string | null; locale: Locale }) {
  if (!date) return <Empty />;
  return (
    <>
      <div className="whitespace-nowrap font-medium text-vtk-ink">{dayLabel(date, locale)}</div>
      {time ? <div className="whitespace-nowrap text-xs tabular-nums text-vtk-muted">{time}</div> : null}
    </>
  );
}

function dayLabel(date: string, locale: Locale): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function rangeLabel(monday: string, sunday: string, locale: Locale): string {
  const fmt = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  };
  return `${fmt(monday)} - ${fmt(sunday)}`;
}

function Empty() {
  return <span className="text-vtk-muted">-</span>;
}

function TextLine({ done, label, nl }: { done: boolean; label: string; nl: boolean }) {
  return (
    <li className={done ? "flex items-center gap-1 text-vtk-ink" : "flex items-center gap-1 text-vtk-muted"}>
      {done ? <CheckIcon /> : null}
      {done ? label : `${label} ${nl ? "ontbreekt" : "missing"}`}
    </li>
  );
}

function StatusPill({ status, label }: { status: Status; label: string }) {
  return (
    <span className="vtk-commu-pill" data-status={status}>
      {label}
    </span>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 text-vtk-ink hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
