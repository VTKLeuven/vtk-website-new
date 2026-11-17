import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { visibleOpeningHoursServices } from "./OpeningHoursAdminView";

/** Naar de eerste dienst die je mag bewerken; elke dienst is een tabblad. */
export default async function OpeningHoursAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const session = await requirePermission("openingHours.manageOwn");
  const [first] = visibleOpeningHoursServices(session);
  if (!first) {
    return (
      <p className="text-sm text-[#5c667f]">
        {locale === "nl"
          ? "Je zit in geen post met openingsuren op de homepage."
          : "You are not in a post with opening hours on the homepage."}
      </p>
    );
  }
  redirect(`${locale === "nl" ? "" : "/en"}/admin/openingsuren/${first}`);
}
