import { redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

export default async function FotosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const base = hasLocale(locale) && locale === "en" ? "/en" : "";
  redirect(`${base}/media`);
}
