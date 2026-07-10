import { redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

export default async function FotosAlbumPage({
  params,
}: {
  params: Promise<{ locale: string; albumSlug: string }>;
}) {
  const { locale, albumSlug } = await params;
  const base = hasLocale(locale) && locale === "en" ? "/en" : "";
  redirect(`${base}/media/${albumSlug}`);
}
