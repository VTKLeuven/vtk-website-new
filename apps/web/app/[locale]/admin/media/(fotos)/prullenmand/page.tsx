import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { loadTrash } from "@/lib/media-admin";
import { requireAnyPermission } from "@/lib/session";
import { TrashManager } from "./TrashManager";
import { ALBUM_MANAGE_PERMISSIONS } from "@/lib/media-album-access";

/**
 * De prullenmand van het fotobeheer: wat de voorbije 30 dagen weggegooid werd,
 * met een knop om het terug te zetten. Dit stond voordien in Immich, en daar
 * hoort niemand van communicatie te moeten komen.
 */
export const dynamic = "force-dynamic";

export default async function PhotoTrashPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requireAnyPermission([...ALBUM_MANAGE_PERMISSIONS]);
  const trash = await loadTrash();
  return <TrashManager locale={locale} photos={trash.photos} albums={trash.albums} now={new Date().toISOString()} />;
}
