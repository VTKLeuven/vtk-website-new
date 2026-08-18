import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { readFieldValues } from "@/lib/frontpage/fields";
import {
  DEFAULT_FRONTPAGE_ID,
  FRONTPAGE_MODULES,
  getFrontpageModule,
} from "@/lib/frontpage/registry";
import { frontpageStatus } from "@/lib/frontpage/resolve";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import { FrontpageEditor, type FrontpageCard } from "./FrontpageEditor";

export default async function AdminFrontpage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("home.edit");

  const rows = await prisma.frontpage.findMany();
  const byLayout = new Map(rows.map((row) => [row.layout, row]));

  const now = new Date();
  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Same rule as the homepage: the most recently started live takeover wins, and
  // the default steps in when there is none. Computed here too so the admin can
  // point at the one a visitor actually sees, instead of showing three cards that
  // all claim to be active.
  const liveTakeover = FRONTPAGE_MODULES.filter((m) => m.id !== DEFAULT_FRONTPAGE_ID)
    .map((m) => byLayout.get(m.id))
    .filter((row) => row && frontpageStatus(row, now) === "live")
    .sort((a, b) => (b!.startsAt?.getTime() ?? 0) - (a!.startsAt?.getTime() ?? 0))[0];
  const showingLayout = liveTakeover?.layout ?? DEFAULT_FRONTPAGE_ID;

  const cards: FrontpageCard[] = FRONTPAGE_MODULES.map((module) => {
    const row = byLayout.get(module.id);
    const isDefault = module.id === DEFAULT_FRONTPAGE_ID;
    const stored = readFieldValues(row?.values, module.fields);

    // Datetime fields are kept as ISO but a datetime-local input wants
    // "YYYY-MM-DDTHH:mm" in the server's zone.
    const values: Record<string, string> = {};
    for (const [name, def] of Object.entries(module.fields)) {
      const value = stored[name];
      if (!value) continue;
      values[name] =
        def.type === "datetime" ? utcToLocalDateTime(new Date(value)) : value;
    }

    const from = row?.startsAt ? dateFormat.format(row.startsAt) : null;
    const until = row?.endsAt ? dateFormat.format(row.endsAt) : null;
    const windowLabel = nl
      ? from && until
        ? `${from} tot ${until}`
        : from
          ? `Vanaf ${from}`
          : until
            ? `Tot ${until}`
            : "Zonder venster"
      : from && until
        ? `${from} until ${until}`
        : from
          ? `From ${from}`
          : until
            ? `Until ${until}`
            : "No window";

    return {
      layout: module.id,
      previewUrl: `/frontpage-preview/${locale}/${module.id}`,
      label: nl ? module.labelNl : module.labelEn,
      description: nl ? module.descriptionNl : module.descriptionEn,
      fields: Object.entries(module.fields),
      values,
      isDefault,
      startsAt: row?.startsAt ? utcToLocalDateTime(row.startsAt) : "",
      endsAt: row?.endsAt ? utcToLocalDateTime(row.endsAt) : "",
      active: isDefault ? true : (row?.active ?? false),
      status: isDefault ? "live" : row ? frontpageStatus(row, now) : "off",
      showing: module.id === showingLayout,
      windowLabel,
    };
  });

  // A row whose component was deleted keeps its data but has nowhere to render;
  // say so rather than letting it disappear silently.
  const orphans = rows.filter((row) => !getFrontpageModule(row.layout));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Frontpage" : "Front page"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Het donkere blok bovenaan de homepage. Elke frontpage hieronder is een eigen ontwerp met eigen velden; je plant er een in rond een evenement en daarna staat de standaard er vanzelf weer. Een nieuwe frontpage maken is een taak voor IT."
            : "The dark block at the top of the homepage. Each front page below is its own design with its own fields; you schedule one around an event and afterwards the default returns by itself. Building a new front page is a job for IT."}
        </p>
      </header>

      {orphans.length > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {nl
            ? `Opgeslagen instellingen zonder ontwerp in de code: ${orphans.map((o) => o.layout).join(", ")}. Ze doen niets.`
            : `Saved settings with no design in the code: ${orphans.map((o) => o.layout).join(", ")}. They do nothing.`}
        </p>
      ) : null}

      <FrontpageEditor locale={locale} cards={cards} />
    </div>
  );
}
