import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  saveHomepageCardImageAction,
  saveOpeningHoursAction,
  saveCareerAction,
  saveAftermoviesAction,
  saveFeaturedAlbumsAction,
} from "@/app/actions/home";

type OpeningHours = { titleNl: string; titleEn: string; entries: Array<{ dayNl: string; dayEn: string; hours: string }> };
type Career = { titleNl: string; titleEn: string; bodyNl: string; bodyEn: string; ctaLabelNl?: string; ctaLabelEn?: string; ctaUrl?: string };
type Aftermovies = {
  titleNl: string;
  titleEn: string;
  items: Array<{
    id?: string;
    type: "video" | "image";
    url: string;
    titleNl?: string;
    titleEn?: string;
    posterUrl?: string;
    publishedAt?: string;
  }>;
};
type Featured = { albumSlugs: string[] };

function readAftermoviesSetting(value: unknown): Aftermovies | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;

  const items = record.items.flatMap((item): Aftermovies["items"] => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string") return [];
    return [{
      id: typeof entry.id === "string" ? entry.id : undefined,
      type: entry.type === "image" ? "image" : "video",
      url: entry.url,
      titleNl: typeof entry.titleNl === "string" ? entry.titleNl : undefined,
      titleEn: typeof entry.titleEn === "string" ? entry.titleEn : undefined,
      posterUrl: typeof entry.posterUrl === "string" ? entry.posterUrl : undefined,
      publishedAt: typeof entry.publishedAt === "string" ? entry.publishedAt : undefined,
    }];
  });

  return {
    titleNl: typeof record.titleNl === "string" ? record.titleNl : "Aftermovies",
    titleEn: typeof record.titleEn === "string" ? record.titleEn : "Aftermovies",
    items,
  };
}

export default async function AdminHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");
  const dict = getDictionary(locale);

  const base = locale === "nl" ? "" : "/en";
  const [rows, homepageCards] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            "home.openingHours.cursusdienst",
            "home.career",
            "media.aftermovies",
            "home.aftermovies",
            "home.featuredAlbums",
          ],
        },
      },
    }),
    prisma.headerTab.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        labelNl: true,
        labelEn: true,
        imageKey: true,
      },
    }),
  ]);
  const map = new Map(rows.map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const cursus = (map.get("home.openingHours.cursusdienst") as OpeningHours | undefined) ?? { titleNl: "", titleEn: "", entries: [] };
  const career = (map.get("home.career") as Career | undefined) ?? { titleNl: "", titleEn: "", bodyNl: "", bodyEn: "" };
  const after = readAftermoviesSetting(map.get("media.aftermovies"))
    ?? readAftermoviesSetting(map.get("home.aftermovies"))
    ?? { titleNl: "", titleEn: "", items: [] };
  const featured = (map.get("home.featuredAlbums") as Featured | undefined) ?? { albumSlugs: [] };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Homepagina" : "Homepage"}</h1>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{locale === "nl" ? "Wat we doen" : "What we do"}</h2>
        <p className="mb-5 text-sm text-[#5c667f]">
          {locale === "nl"
            ? "Beheer de foto op elke categoriekaart. De eerste zes zichtbare categorieën verschijnen op de homepage; hun volgorde beheer je onder Inhoud."
            : "Manage the photo on each category card. The first six visible categories appear on the homepage; manage their order under Content."}
        </p>

        {homepageCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {homepageCards.map((tab) => (
              <SaveForm
                key={tab.id}
                action={saveHomepageCardImageAction}
                className="space-y-4 rounded-xl border border-vtk-blue/10 p-4"
                submitLabel={dict.admin.save}
                savingLabel={dict.common.saving}
                savedMessage={dict.common.saved}
                fallbackErrorMessage={dict.common.saveError}
              >
                <input type="hidden" name="id" value={tab.id} />
                <div>
                  <h3 className="font-medium">
                    {locale === "nl" ? tab.labelNl : tab.labelEn}
                  </h3>
                  <p className="font-mono text-xs text-[#5c667f]">/{tab.slug}</p>
                </div>
                <StorageImageField
                  defaultKey={tab.imageKey}
                  locale={locale}
                  label={locale === "nl" ? "Kaartfoto" : "Card photo"}
                  emptyHint={locale === "nl" ? "Standaardfoto" : "Default photo"}
                  helpText={
                    locale === "nl"
                      ? "Zonder upload gebruikt deze kaart de standaardfoto of het gestreepte patroon."
                      : "Without an upload, this card uses its default photo or the striped pattern."
                  }
                />
              </SaveForm>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#5c667f]">
            {locale === "nl"
              ? "Er zijn nog geen zichtbare categorieën. Maak ze eerst aan onder Inhoud."
              : "There are no visible categories yet. Create them under Content first."}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Openingsuren" : "Opening hours"} – Cursusdienst
        </h2>
        <SaveForm
          action={saveOpeningHoursAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <input type="hidden" name="key" value="home.openingHours.cursusdienst" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>Title (NL)</Label><Input name="titleNl" defaultValue={cursus.titleNl} /></div>
            <div><Label>Title (EN)</Label><Input name="titleEn" defaultValue={cursus.titleEn} /></div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left"><tr><th>Day (NL)</th><th>Day (EN)</th><th>Hours</th></tr></thead>
            <tbody>
              {Array.from({ length: 7 }).map((_, i) => {
                const e = cursus.entries[i] || { dayNl: "", dayEn: "", hours: "" };
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1"><Input name={`dayNl-${i}`} defaultValue={e.dayNl} /></td>
                    <td className="pr-2 py-1"><Input name={`dayEn-${i}`} defaultValue={e.dayEn} /></td>
                    <td className="py-1"><Input name={`hours-${i}`} defaultValue={e.hours} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-1">
          {locale === "nl" ? "Openingsuren" : "Opening hours"} – Theokot
        </h2>
        <p className="text-sm text-[#5c667f]">
          {locale === "nl" ? (
            <>
              De Theokot-openingsuren beheer je onder{" "}
              <Link href={`${base}/admin/theokot/openingsuren`} className="underline">
                Theokot · Openingsuren
              </Link>
              . Ze verschijnen automatisch op de startpagina.
            </>
          ) : (
            <>
              Manage the Theokot opening hours under{" "}
              <Link href={`${base}/admin/theokot/openingsuren`} className="underline">
                Theokot · Opening hours
              </Link>
              . They appear on the homepage automatically.
            </>
          )}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">VTK Career</h2>
        <SaveForm
          action={saveCareerAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>Title (NL)</Label><Input name="titleNl" defaultValue={career.titleNl} /></div>
            <div><Label>Title (EN)</Label><Input name="titleEn" defaultValue={career.titleEn} /></div>
            <div className="md:col-span-2"><Label>Body (NL)</Label><Textarea name="bodyNl" defaultValue={career.bodyNl} rows={3} /></div>
            <div className="md:col-span-2"><Label>Body (EN)</Label><Textarea name="bodyEn" defaultValue={career.bodyEn} rows={3} /></div>
            <div><Label>CTA label (NL)</Label><Input name="ctaLabelNl" defaultValue={career.ctaLabelNl ?? ""} /></div>
            <div><Label>CTA label (EN)</Label><Input name="ctaLabelEn" defaultValue={career.ctaLabelEn ?? ""} /></div>
            <div className="md:col-span-2"><Label>CTA URL</Label><Input name="ctaUrl" defaultValue={career.ctaUrl ?? ""} /></div>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Aftermovies & sfeerbeelden" : "Aftermovies & photos"}
        </h2>
        <SaveForm
          action={saveAftermoviesAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>Title (NL)</Label><Input name="titleNl" defaultValue={after.titleNl} /></div>
            <div><Label>Title (EN)</Label><Input name="titleEn" defaultValue={after.titleEn} /></div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left"><tr><th>Type</th><th>URL (YouTube embed / image URL)</th><th>Title (NL)</th><th>Title (EN)</th></tr></thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => {
                const item: Aftermovies["items"][number] = after.items[i]
                  ?? { type: "video", url: "", titleNl: "", titleEn: "" };
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1">
                      <input type="hidden" name={`id-${i}`} value={item.id ?? ""} />
                      <input type="hidden" name={`posterUrl-${i}`} value={item.posterUrl ?? ""} />
                      <input type="hidden" name={`publishedAt-${i}`} value={item.publishedAt ?? ""} />
                      <Select name={`type-${i}`} defaultValue={item.type}>
                        <option value="video">video</option>
                        <option value="image">image</option>
                      </Select>
                    </td>
                    <td className="pr-2 py-1"><Input name={`url-${i}`} defaultValue={item.url} /></td>
                    <td className="pr-2 py-1"><Input name={`titleNl-${i}`} defaultValue={item.titleNl ?? ""} /></td>
                    <td className="py-1"><Input name={`titleEn-${i}`} defaultValue={item.titleEn ?? ""} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Uitgelichte albums" : "Featured albums"}
        </h2>
        <SaveForm
          action={saveFeaturedAlbumsAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <Label>{locale === "nl" ? "Slugs (komma-gescheiden)" : "Slugs (comma-separated)"}</Label>
          <Input name="albumSlugs" defaultValue={featured.albumSlugs.join(", ")} placeholder="galabal-2026, cantus-2026" />
        </SaveForm>
      </Card>
    </div>
  );
}
