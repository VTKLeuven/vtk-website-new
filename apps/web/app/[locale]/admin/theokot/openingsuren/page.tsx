import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label } from "@vtk/ui";
import { saveTheokotOpeningHoursAction } from "@/app/actions/theokot";
import { TheokotAdminNav } from "../TheokotAdminNav";

type Hours = { titleNl?: string; titleEn?: string; entries?: Array<{ dayNl: string; dayEn: string; hours: string }> };

export default async function TheokotOpeningHoursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/openingsuren`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.manage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const hoursRow = await prisma.setting.findUnique({ where: { key: "home.openingHours.theokot" } });
  const hours = (hoursRow?.value as Hours) ?? {};
  const hourEntries = hours.entries ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Openingsuren" : "Opening hours"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="openingsuren" caps={caps} />

      <Card className="p-5">
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Deze uren verschijnen op de startpagina van de website. Dit zijn NIET de afhaaluren van de reservaties (die stel je per verkoopdag in)."
            : "These hours appear on the website homepage. These are NOT the reservation pickup hours (set those per sale day)."}
        </p>
        <form action={saveTheokotOpeningHoursAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
              <Input name="titleNl" defaultValue={hours.titleNl ?? "Openingsuren Theokot"} />
            </div>
            <div>
              <Label>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
              <Input name="titleEn" defaultValue={hours.titleEn ?? "Theokot opening hours"} />
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => {
              const entry = hourEntries[i];
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-center">
                  <Input name={`dayNl-${i}`} defaultValue={entry?.dayNl ?? ""} placeholder={nl ? "Dag (NL)" : "Day (NL)"} />
                  <Input name={`dayEn-${i}`} defaultValue={entry?.dayEn ?? ""} placeholder={nl ? "Dag (EN)" : "Day (EN)"} />
                  <Input name={`hours-${i}`} defaultValue={entry?.hours ?? ""} placeholder="10:30 – 18:00" />
                </div>
              );
            })}
          </div>
          <Button type="submit">{nl ? "Openingsuren opslaan" : "Save opening hours"}</Button>
        </form>
      </Card>
    </div>
  );
}
