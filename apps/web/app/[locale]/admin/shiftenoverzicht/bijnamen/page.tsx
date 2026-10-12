import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatWorkingYear, parseWorkingYear } from "@/lib/workingYear";
import { loadRoster } from "@/lib/praesidiumShifts/server";
import { deletePraesidiumShiftAliasAction } from "@/app/actions/praesidiumShifts";
import { overviewErrorMessages } from "../messages";
import { AliasTargetSelect, NewAliasForm, type AliasOption } from "./AliasControls";

export default async function PraesidiumShiftAliases({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("shift.praesidium");

  const { jaar } = await searchParams;
  const year = parseWorkingYear(jaar);
  const [aliases, roster, usage] = await Promise.all([
    prisma.praesidiumShiftAlias.findMany({
      orderBy: { label: "asc" },
      select: {
        nameKey: true,
        label: true,
        userId: true,
        notAName: true,
        updatedAt: true,
        user: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
    }),
    loadRoster(year, locale),
    prisma.praesidiumShiftListName.groupBy({
      by: ["nameKey"],
      where: { source: "ALIAS" },
      _count: { _all: true },
    }),
  ]);
  const usedOn = new Map(usage.map((u) => [u.nameKey, u._count._all]));
  const messages = overviewErrorMessages(locale);
  const options: AliasOption[] = roster.map((m) => ({
    userId: m.userId,
    name: m.name,
    hint: m.posts.join(", ") || undefined,
  }));
  const optionsFor = (userId: string | null, name: string | undefined): AliasOption[] =>
    userId && !options.some((o) => o.userId === userId)
      ? [{ userId, name: name ?? "?", hint: `${nl ? "niet in het praesidium van" : "not in the praesidium of"} ${formatWorkingYear(year)}` }, ...options]
      : options;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`${base}/admin/shiftenoverzicht?jaar=${year}`} className="text-sm text-vtk-muted hover:text-vtk-ink">
          {"← "}
          {nl ? "Shiftenoverzicht praesidium" : "Praesidium shift overview"}
        </Link>
        <h1 className="text-2xl font-semibold">{nl ? "Bijnamen op shiftenlijsten" : "Nicknames on shift lists"}</h1>
        <p className="max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Een bijnaam koppelt een schrijfwijze (\"Mekkie\", \"Jarne P\") aan een praesidiumlid, of zegt dat ze nooit iemand van het praesidium is, of dat ze geen persoon is maar een post of taak (\"Iedereen\", \"Cultuur\"). Ze geldt voor elke lijst die je oplaadt, en voor elke lijst waar die naam niet met de hand gekozen is. Klopt er een niet meer, kies hier iemand anders: de lijsten volgen meteen."
            : "A nickname links a spelling (\"Mekkie\", \"Jarne P\") to a praesidium member, or says it is never anyone from the praesidium, or that it is not a person but a post or task (\"Everyone\", \"Culture\"). It applies to every list you upload, and to every list where that name was not chosen by hand. If one is wrong, pick someone else here: the lists follow at once."}
        </p>
      </div>

      <section className="space-y-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5">
        <h2 className="text-sm font-semibold">{nl ? "Bijnaam toevoegen" : "Add a nickname"}</h2>
        <NewAliasForm locale={locale} options={options} errorMessages={messages} />
      </section>

      {aliases.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-vtk-blue/20 p-6 text-sm text-vtk-muted">
          {nl
            ? "Nog geen bijnamen. Ze ontstaan vanzelf wanneer je op een lijst een naam koppelt met \"Onthouden\" aan."
            : "No nicknames yet. They appear by themselves when you link a name on a list with \"Remember\" on."}
        </p>
      ) : (
        <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <div
            className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_5rem_minmax(0,1fr)_2.5rem] sm:items-center hidden rounded-t-[18px] border-b border-vtk-blue/10 bg-[var(--paper-2)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-vtk-muted sm:grid"
            aria-hidden
          >
            <span>{nl ? "Bijnaam" : "Nickname"}</span>
            <span>{nl ? "Is" : "Is"}</span>
            <span className="text-right">{nl ? "Op lijsten" : "On lists"}</span>
            <span>{nl ? "Laatst gewijzigd" : "Last changed"}</span>
            <span />
          </div>
          <ul>
            {aliases.map((alias) => {
              const lists = usedOn.get(alias.nameKey) ?? 0;
              return (
                <li key={alias.nameKey} className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_5rem_minmax(0,1fr)_2.5rem] sm:items-center border-b border-vtk-blue/5 px-4 py-3 last:border-0">
                  <span className="font-medium">{alias.label}</span>
                  <AliasTargetSelect
                    locale={locale}
                    label={alias.label}
                    value={alias.userId ?? (alias.notAName ? "noname" : "ignore")}
                    options={optionsFor(alias.userId, alias.user?.name)}
                    errorMessages={messages}
                  />
                  <span className="text-sm tabular-nums sm:text-right">
                    <span className="text-vtk-muted sm:hidden">{nl ? "Op lijsten: " : "On lists: "}</span>
                    {lists}
                  </span>
                  <span className="text-xs text-vtk-muted">
                    {alias.updatedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {alias.updatedBy ? ` · ${alias.updatedBy.name}` : ""}
                  </span>
                  <span className="sm:text-right">
                    <DeleteIconButton
                      action={deletePraesidiumShiftAliasAction}
                      fields={{ nameKey: alias.nameKey }}
                      label={nl ? "Bijnaam vergeten" : "Forget nickname"}
                      srLabel={nl ? `Bijnaam vergeten: ${alias.label}` : `Forget nickname: ${alias.label}`}
                      title={nl ? `"${alias.label}" vergeten?` : `Forget "${alias.label}"?`}
                      description={
                        nl
                          ? `De bijnaam verdwijnt. Op ${lists} ${lists === 1 ? "lijst krijgt" : "lijsten krijgt"} "${alias.label}" opnieuw het voorstel van zonder bijnaam; staat er dan niemand die past, dan wacht de naam daar weer op een keuze. Namen die je op een lijst met de hand koppelde, blijven zoals ze zijn.`
                          : `The nickname disappears. On ${lists} lists "${alias.label}" gets the suggestion it would have without a nickname again; if nobody fits, the name waits for a choice there again. Names you linked by hand on a list stay as they are.`
                      }
                      confirmLabel={nl ? "Vergeten" : "Forget"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Bijnaam vergeten." : "Nickname forgotten."}
                      errorMessages={messages}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
