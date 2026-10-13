import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { getMediaContent } from "@/lib/media-content";
import { requirePermission } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import { deleteMagazineAction } from "@/app/actions/media";
import { MagazineCoverButton } from "../MagazineCoverButton";
import { MagazineStats, parsePeriod } from "../MagazineStats";
import { MagazineUploadForm } from "../MagazineUploadForm";

/**
 * Het Bakske en Ir.Reëel: een nieuwe editie opladen en de gepubliceerde
 * beheren. De leescijfers staan onderaan en niet meer bovenaan het hele
 * mediabeheer: je komt hier om een editie op te laden, niet om cijfers te lezen.
 */
export default async function AdminMagazines({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stats?: string | string[] }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("media.manage");
  const nl = locale === "nl";

  const { stats: statsPeriod } = await searchParams;
  const { publications, videos } = await getMediaContent();

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-semibold mb-1">{nl ? "Nieuwe magazine-editie" : "New magazine issue"}</h2>
        <p className="text-sm text-zinc-500 mb-3">
          {nl
            ? "Upload de PDF van een nieuwe editie van Het Bakske of Ir.Reëel. Die verschijnt meteen bovenaan de boekenplank."
            : "Upload the PDF of a new issue of Het Bakske or Ir.Reëel. It appears at the top of the shelf immediately."}
        </p>
        <MagazineUploadForm locale={locale} />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {nl ? "Gepubliceerde edities" : "Published issues"} ({publications.length})
        </h2>
        <ul className="divide-y divide-zinc-200">
          {publications.map((p) => (
            // `basis-48` op de titel: smal past er naast het label niets meer
            // bij, dus zakt het actieblok als geheel naar een tweede regel in
            // plaats van de titel tot vier woorden per regel te knijpen.
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase">
                {p.kind === "bakske" ? "Bakske" : "Ir.Reëel"}
              </span>
              {/* De kaft zelf, zodat je ziet welke editie er al een heeft (voor
                  de tegel in het nieuws); zonder kaft een leeg vakje. */}
              {p.coverKey ? (
                // Een kaft van 900 px uit de eigen /api/media-route.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicUrl(p.coverKey) ?? undefined}
                  alt=""
                  className="h-10 w-7 shrink-0 rounded-sm border border-zinc-200 object-cover object-top"
                />
              ) : (
                <span
                  className="h-10 w-7 shrink-0 rounded-sm border border-dashed border-zinc-300"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 basis-48 text-sm">
                {nl ? p.titleNl : p.titleEn || p.titleNl} · {nl ? p.issueNl : p.issueEn || p.issueNl}
                {p.publishedAt ? <span className="text-zinc-500"> · {p.publishedAt}</span> : null}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <a
                  href={`/api/media/publications/${encodeURIComponent(p.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                >
                  PDF
                </a>
                <MagazineCoverButton
                  id={p.id}
                  hasCover={Boolean(p.coverKey)}
                  context={`${nl ? p.titleNl : p.titleEn || p.titleNl} ${nl ? p.issueNl : p.issueEn || p.issueNl}`}
                  locale={locale}
                />
                <DeleteIconButton
                  action={deleteMagazineAction}
                  fields={{ id: p.id }}
                  label={nl ? "Verwijderen" : "Delete"}
                  srLabel={`${nl ? "Verwijderen" : "Delete"}: ${nl ? p.titleNl : p.titleEn || p.titleNl} ${nl ? p.issueNl : p.issueEn || p.issueNl}`}
                  title={nl ? "Editie verwijderen?" : "Delete issue?"}
                  description={
                    nl
                      ? `"${p.titleNl} ${p.issueNl}" verdwijnt van de mediapagina. De andere edities blijven staan.`
                      : `"${p.titleEn || p.titleNl} ${p.issueEn || p.issueNl}" disappears from the media page. The other issues remain.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Editie verwijderd" : "Issue deleted"}
                />
              </div>
            </li>
          ))}
          {publications.length === 0 ? (
            <li className="py-2 text-sm text-zinc-500">
              {nl ? "Nog geen edities." : "No issues yet."}
            </li>
          ) : null}
        </ul>
      </Card>

      <MagazineStats
        locale={locale}
        publications={publications}
        videos={videos}
        period={parsePeriod(statsPeriod)}
      />
    </div>
  );
}
