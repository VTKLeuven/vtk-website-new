import { notFound } from "next/navigation";
import { Card, Input, Label } from "@vtk/ui";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import {
  deletePocPollAction,
  publishPocPollSummaryAction,
  retryPocPollDiscordAction,
  updatePocPollScheduleAction,
} from "@/app/actions/poc-polls";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { discordBotConfigured } from "@/lib/discord/bot";
import { hasLocale } from "@/lib/locale";
import { managedPocIds, managesPoc } from "@/lib/pocPolls/access";
import { pollAdminErrors } from "@/lib/pocPolls/adminCopy";
import { pollPhaseLabel } from "@/lib/pocPolls/copy";
import { pollStatus, POLL_YES } from "@/lib/pocPolls/core";
import { toBrusselsInput } from "@/lib/pocPolls/draft";
import { pollPopulation } from "@/lib/pocPolls/population";
import {
  computeTurnout,
  MIN_GROUP_SIZE,
  pollResultsText,
  questionResult,
  rowsForPhase,
  type QuestionResult,
} from "@/lib/pocPolls/results";
import { pollAnswerRef } from "@/lib/pocPolls/voterKey";
import { requireSession } from "@/lib/session";
import { loadBuilderData } from "../builderData";
import { PollBuilder } from "../PollBuilder";
import { CopyForPocButton, OpenAnswerActions } from "../PollResultClient";
import { PollStatusPill, pollDateLabel } from "../PollStatusPill";

import "@/app/design/vtk-poc-poll.css";

function Bar({ share }: { share: number }) {
  return (
    <div aria-hidden className="h-2 rounded bg-vtk-blue-soft">
      <div className="h-2 rounded-r" style={{ width: `${share}%`, background: "var(--chart-1)" }} />
    </div>
  );
}

function barLabel(kind: string, value: number, low: string | null, high: string | null, nl: boolean): string {
  if (kind === "YES_NO") return value === POLL_YES ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No";
  if (value === 1) return `1, ${low ?? (nl ? "oneens" : "disagree")}`;
  if (value === 5) return `5, ${high ?? (nl ? "eens" : "agree")}`;
  return String(value);
}

export default async function PeilingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ fase?: string }>;
}) {
  const { locale: localeParam, id } = await params;
  const { fase } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession(`${base}/inloggen?next=${base}/admin/peilingen/${id}`);
  const scope = await managedPocIds(session);

  const poll = await prisma.pocPoll.findUnique({
    where: { id },
    include: {
      poc: { select: { nameNl: true, studyProgrammes: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { answers: { select: { voterKey: true, value: true, text: true, studyYears: true, starred: true, hidden: true } } },
      },
    },
  });
  if (!poll || !managesPoc(scope, poll.pocId)) notFound();

  const now = new Date();
  const status = pollStatus(poll, now);

  if (status === "DRAFT") {
    const data = await loadBuilderData(scope, locale);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{nl ? "Concept bewerken" : "Edit draft"}</h1>
          <DeleteButton
            action={deletePocPollAction}
            fields={{ id: poll.id, locale }}
            title={nl ? "Dit concept verwijderen?" : "Delete this draft?"}
            description={nl ? `"${poll.titleNl}" en zijn vragen zijn dan weg. Er staat nog niets online.` : `"${poll.titleNl}" and its questions will be gone. Nothing is online yet.`}
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
          >
            {nl ? "Verwijderen" : "Delete"}
          </DeleteButton>
        </div>
        <PollBuilder
          locale={locale}
          initial={{
            id: poll.id,
            pocId: poll.pocId,
            title: poll.titleNl,
            closesAt: toBrusselsInput(poll.closesAt),
            meetingDate: poll.meetingDate ? poll.meetingDate.toISOString().slice(0, 10) : "",
            studyYears: poll.studyYears,
            discordChannelId: poll.discordChannelId ?? "",
            questions: poll.questions.map((question) => ({
              kind: question.kind,
              text: question.textNl,
              low: question.lowLabelNl ?? "",
              high: question.highLabelNl ?? "",
            })),
          }}
          {...data}
        />
      </div>
    );
  }

  const allRows = poll.questions.flatMap((question) =>
    question.answers.map((answer) => ({ ...answer, questionId: question.id })),
  );
  const population = await pollPopulation(poll.poc.studyProgrammes, poll.studyYears);
  const turnout = computeTurnout(allRows, population);
  const closed = status === "CLOSED";

  const selectable = turnout.phases.filter((phase) => !phase.tooFew);
  const activePhase = fase && selectable.some((phase) => phase.year === fase) ? fase : null;
  const errors = pollAdminErrors(nl);
  const fallbackError = nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong.";

  const results = poll.questions.map((question) => {
    const rows = rowsForPhase(question.answers, activePhase);
    return { question, rows, result: questionResult(question.kind, rows) as QuestionResult };
  });

  const turnoutLine = nl
    ? `${turnout.answered} van de ${turnout.population} studenten antwoordden (${turnout.share}%).`
    : `${turnout.answered} of ${turnout.population} students answered (${turnout.share}%).`;
  const copyText = pollResultsText({
    title: poll.titleNl,
    turnoutLine,
    questions: results.map(({ question, rows, result }) => {
      if (question.kind === "OPEN") {
        const picked = rows.filter((row) => row.text && !row.hidden);
        const starred = picked.filter((row) => row.starred);
        return { text: question.textNl, lines: (starred.length > 0 ? starred : picked).map((row) => row.text ?? "") };
      }
      const lines = result.bars.map(
        (bar) => `${barLabel(question.kind, bar.value, question.lowLabelNl, question.highLabelNl, nl)}: ${bar.share}% (${bar.count})`,
      );
      if (result.average !== null) lines.push(`${nl ? "Gemiddeld" : "Average"}: ${result.average.toFixed(1).replace(".", nl ? "," : ".")} ${nl ? "op" : "of"} 5`);
      return { text: question.textNl, lines };
    }),
  });

  const phaseHref = (year: string | null) => `${base}/admin/peilingen/${poll.id}${year ? `?fase=${year}` : ""}`;
  const chip = "inline-flex h-10 items-center rounded-full border px-4 text-[13px]";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[18rem] flex-1">
          <p className="text-sm text-vtk-muted">
            <Link href={`${base}/admin/peilingen`}>{nl ? "Peilingen" : "Polls"}</Link> · {poll.poc.nameNl.replace(/^POC\s+/i, "")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{poll.titleNl}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2.5 text-sm text-vtk-muted">
            <PollStatusPill status={status} nl={nl} />
            <span>
              {closed ? (nl ? "Sinds " : "Since ") : nl ? "Open tot " : "Open until "}
              {pollDateLabel(poll.closesAt, nl)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {closed ? <CopyForPocButton text={copyText} nl={nl} /> : null}
          <DeleteButton
            action={deletePocPollAction}
            fields={{ id: poll.id, locale }}
            title={nl ? "Deze peiling verwijderen?" : "Delete this poll?"}
            description={
              nl
                ? `"${poll.titleNl}" en de antwoorden van ${turnout.answered} studenten zijn dan definitief weg, ook op Discord. Andere peilingen blijven staan.`
                : `"${poll.titleNl}" and the answers of ${turnout.answered} students will be gone for good, also on Discord. Other polls stay.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
          >
            {nl ? "Verwijderen" : "Delete"}
          </DeleteButton>
        </div>
      </header>

      <p className="text-sm text-vtk-body">
        {nl
          ? "Zolang een peiling open staat, zie je hier enkel de deelname. De cijfers verschijnen na de deadline. Wie wat antwoordde, zie je nooit."
          : "While a poll is open you only see the turnout here. The figures appear after the deadline. You never see who answered what."}
      </p>

      {poll.discordChannelId && discordBotConfigured() && !poll.discordMessageId ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">Discord</h2>
          <p className="text-sm text-vtk-body">
            {poll.discordError ?? (nl ? "De peiling staat nog niet op Discord." : "The poll is not on Discord yet.")}
          </p>
          <SaveForm
            action={retryPocPollDiscordAction}
            submitLabel={nl ? "Opnieuw posten" : "Post again"}
            savingLabel={nl ? "Bezig met posten..." : "Posting..."}
            savedMessage={nl ? "De peiling staat op Discord." : "The poll is on Discord."}
            errorMessages={errors}
            fallbackErrorMessage={fallbackError}
            resetOnSuccess={false}
          >
            <input type="hidden" name="id" value={poll.id} />
          </SaveForm>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="text-base font-semibold">{nl ? "Deelname" : "Turnout"}</h2>
        <p className="mb-3 mt-1 tabular-nums text-vtk-body">{turnoutLine}</p>
        {turnout.phases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-vtk-muted">
                  <th scope="col" className="pb-1.5 pr-3 font-medium">{nl ? "Fase" : "Phase"}</th>
                  <th scope="col" className="pb-1.5 pr-3 font-medium">{nl ? "Antwoorden" : "Responses"}</th>
                  <th scope="col" className="pb-1.5 pr-3 !text-right font-medium">{nl ? "Bereikt" : "Reached"}</th>
                  <th scope="col" className="w-[42%] pb-1.5"><span className="sr-only">{nl ? "Balk" : "Bar"}</span></th>
                </tr>
              </thead>
              <tbody>
                {turnout.phases.map((phase) => (
                  <tr key={phase.year} className="border-t border-vtk-blue/10">
                    <td className="h-8 pr-3">{pollPhaseLabel(phase.year, locale)}</td>
                    <td className="pr-3">{nl ? `${phase.answered} van ${phase.population}` : `${phase.answered} of ${phase.population}`}</td>
                    <td className="pr-3 text-right">{phase.share}%</td>
                    <td><Bar share={phase.share} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {!closed ? (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">{nl ? "Planning" : "Schedule"}</h2>
          <SaveForm
            action={updatePocPollScheduleAction}
            submitLabel={nl ? "Opslaan" : "Save"}
            savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
            savedMessage={nl ? "Planning opgeslagen." : "Schedule saved."}
            errorMessages={errors}
            fallbackErrorMessage={fallbackError}
            resetOnSuccess={false}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={poll.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="closes">{nl ? "Open tot" : "Open until"}</Label>
                <Input id="closes" name="closesAt" type="datetime-local" required defaultValue={toBrusselsInput(poll.closesAt)} />
              </div>
              <div>
                <Label htmlFor="meeting">{nl ? "Besproken op de POC van, optioneel" : "Discussed at the POC of, optional"}</Label>
                <Input id="meeting" name="meetingDate" type="date" defaultValue={poll.meetingDate ? poll.meetingDate.toISOString().slice(0, 10) : ""} />
              </div>
            </div>
          </SaveForm>
        </Card>
      ) : null}

      {closed ? (
        <>
          <div className="space-y-2">
            <div role="group" aria-label={nl ? "Toon per fase" : "Show per phase"} className="flex flex-wrap gap-1.5">
              <Link href={phaseHref(null)} aria-current={activePhase === null ? "true" : undefined} className={`${chip} ${activePhase === null ? "border-vtk-yellow bg-vtk-yellow font-semibold" : "border-vtk-blue/20 font-medium"}`}>
                {nl ? "Alle fasen" : "All phases"}
              </Link>
              {turnout.phases.map((phase) =>
                phase.tooFew ? (
                  <span key={phase.year} className={`${chip} border-dashed border-vtk-blue/20 font-medium text-vtk-muted`}>
                    {pollPhaseLabel(phase.year, locale)}, {nl ? "te weinig" : "too few"}
                  </span>
                ) : (
                  <Link key={phase.year} href={phaseHref(phase.year)} aria-current={activePhase === phase.year ? "true" : undefined} className={`${chip} ${activePhase === phase.year ? "border-vtk-yellow bg-vtk-yellow font-semibold" : "border-vtk-blue/20 font-medium"}`}>
                    {pollPhaseLabel(phase.year, locale)}
                  </Link>
                ),
              )}
            </div>
            <p className="text-[13px] text-vtk-muted">
              {nl
                ? `Een groep met minder dan ${MIN_GROUP_SIZE} antwoorden tonen we niet apart, anders wordt ze herkenbaar.`
                : `A group with fewer than ${MIN_GROUP_SIZE} answers is not shown separately, or it becomes identifiable.`}
            </p>
          </div>

          {results.map(({ question, rows, result }) => (
            <Card key={question.id} className="p-5">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <h2 className="text-base font-semibold">{question.textNl}</h2>
                <span className="flex gap-3.5 text-[13px] tabular-nums text-vtk-muted">
                  {result.average !== null ? (
                    <span>
                      {nl ? "Gemiddeld" : "Average"} {result.average.toFixed(1).replace(".", nl ? "," : ".")} {nl ? "op" : "of"} 5
                    </span>
                  ) : null}
                  <span>
                    {result.answered} {nl ? "antwoorden" : "responses"}
                  </span>
                </span>
              </div>

              {question.kind === "OPEN" ? (
                <div>
                  {rows
                    .filter((row) => row.text)
                    .map((row) => ({ row, ref: pollAnswerRef(question.id, row.voterKey) }))
                    // Op de sleutel en niet in volgorde van binnenkomen, en de
                    // gemarkeerde bovenaan.
                    .sort((a, b) => Number(b.row.starred) - Number(a.row.starred) || a.ref.localeCompare(b.ref))
                    .map(({ row, ref }) => (
                      <div key={ref} className="flex items-center gap-3 border-t border-vtk-blue/10 py-2">
                        <div className={`min-w-0 flex-1 text-[15px] leading-snug ${row.hidden ? "text-vtk-muted line-through" : "text-vtk-ink"}`}>{row.text}</div>
                        <OpenAnswerActions pollId={poll.id} questionId={question.id} answerRef={ref} starred={row.starred} hidden={row.hidden} text={row.text ?? ""} nl={nl} />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-left text-xs text-vtk-muted">
                        <th scope="col" className="w-40 pb-1.5 pr-3 font-medium">{question.kind === "SCORE" ? "Score" : nl ? "Antwoord" : "Answer"}</th>
                        <th scope="col" className="pb-1.5 pr-3"><span className="sr-only">{nl ? "Balk" : "Bar"}</span></th>
                        <th scope="col" className="w-14 pb-1.5 pr-3 !text-right font-medium">{nl ? "Aandeel" : "Share"}</th>
                        <th scope="col" className="w-12 pb-1.5 !text-right font-medium">{nl ? "Aantal" : "Count"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bars.map((bar) => (
                        <tr key={bar.value} className="border-t border-vtk-blue/10">
                          <td className="h-8 pr-3">{barLabel(question.kind, bar.value, question.lowLabelNl, question.highLabelNl, nl)}</td>
                          <td className="pr-3"><Bar share={bar.share} /></td>
                          <td className="pr-3 text-right font-semibold">{bar.share}%</td>
                          <td className="text-right text-vtk-muted">{bar.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}

          <Card className="p-5">
            <h2 className="text-base font-semibold">{nl ? "Samenvatting voor studenten" : "Summary for students"}</h2>
            <p className="mb-3 mt-1 text-sm text-vtk-muted">
              {nl
                ? "Na de POC: vertel wat er met de antwoorden gebeurde. Dit staat 30 dagen bij je POC op de homepage. Leegmaken haalt het weer weg."
                : "After the POC: tell what happened with the answers. This stays at your POC on the homepage for 30 days. Emptying it removes it again."}
            </p>
            <SaveForm
              action={publishPocPollSummaryAction}
              submitLabel={nl ? "Publiceer samenvatting" : "Publish summary"}
              savingLabel={nl ? "Bezig met publiceren..." : "Publishing..."}
              savedMessage={nl ? "Samenvatting opgeslagen." : "Summary saved."}
              errorMessages={errors}
              fallbackErrorMessage={fallbackError}
              resetOnSuccess={false}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={poll.id} />
              <MarkdownEditorField name="summary" defaultValue={poll.summaryNl} locale={locale} allowImages={false} rows={6} maxLength={4000} />
            </SaveForm>
          </Card>
        </>
      ) : null}
    </div>
  );
}
