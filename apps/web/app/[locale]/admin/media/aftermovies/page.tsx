import { notFound } from "next/navigation";
import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { hasLocale } from "@/lib/locale";
import { getMediaContent } from "@/lib/media-content";
import { requirePermission } from "@/lib/session";
import { savePromoVideosAction } from "@/app/actions/media";

/** De YouTube- of Vimeo-links in de videostrook van de mediapagina. */
export default async function AdminAftermovies({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("media.manage");
  const nl = locale === "nl";

  const { videos } = await getMediaContent();
  const videoRows = [...videos, null, null, null];

  return (
    <Card className="p-5">
        <h2 className="font-semibold mb-1">Aftermovies</h2>
        <p className="text-sm text-zinc-500 mb-3">
          {nl
            ? "YouTube- of Vimeo-links die in de videosectie van de mediapagina staan. Lege rijen worden genegeerd."
            : "YouTube or Vimeo links shown in the media page video section. Empty rows are ignored."}
        </p>
        <SaveForm
          action={savePromoVideosAction}
          className="space-y-3"
          submitLabel={nl ? "Video's opslaan" : "Save videos"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Video's opgeslagen" : "Videos saved"}
          fallbackErrorMessage={nl ? "Opslaan van de video's mislukt." : "Saving the videos failed."}
        >
          {videoRows.map((video, i) => (
            <div key={video ? video.id : `new-${i}`} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="hidden" name={`id-${i}`} value={video?.id ?? ""} />
              <div className="md:col-span-2">
                <Label>URL</Label>
                <Input name={`url-${i}`} defaultValue={video?.url ?? ""} placeholder="https://www.youtube.com/watch?v=…" />
              </div>
              <div>
                <Label>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
                <Input name={`titleNl-${i}`} defaultValue={video?.titleNl ?? ""} />
              </div>
              <div>
                <Label>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
                <Input name={`titleEn-${i}`} defaultValue={video?.titleEn ?? ""} />
              </div>
            </div>
          ))}
        </SaveForm>
    </Card>
  );
}
