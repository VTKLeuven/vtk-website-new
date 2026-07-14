import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { parseTheokotConfig } from "@/lib/theokot";
import { saveConfigAction, saveOrderMessageAction } from "@/app/actions/theokot";
import { TheokotAdminNav } from "../TheokotAdminNav";

export default async function TheokotSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/instellingen`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.manage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const [configRow, messageRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "theokot.config" } }),
    prisma.setting.findUnique({ where: { key: "theokot.orderMessage" } }),
  ]);
  const config = parseTheokotConfig(configRow?.value);
  const message = (messageRow?.value as { bodyNl?: string; bodyEn?: string }) ?? {};

  const numField = (name: string, labelNl: string, labelEn: string, value: number, min = 0) => (
    <div>
      <Label>{nl ? labelNl : labelEn}</Label>
      <Input name={name} type="number" min={min} defaultValue={value} />
    </div>
  );
  const timeField = (name: string, labelNl: string, labelEn: string, value: string) => (
    <div>
      <Label>{nl ? labelNl : labelEn}</Label>
      <Input name={name} type="time" defaultValue={value} />
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Instellingen" : "Settings"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="instellingen" caps={caps} />

      {/* Configuratie */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Configuratie" : "Configuration"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Deze waarden gelden voor nieuwe verkoopweken en het bestelgedrag. Ze hoeven niet elke week aangepast te worden."
            : "These values apply to new sale weeks and ordering behaviour. They need not be changed weekly."}
        </p>
        <form action={saveConfigAction} className="grid gap-4 sm:grid-cols-3">
          {numField("maxItemsPerOrder", "Max broodjes / bestelling (X)", "Max sandwiches / order (X)", config.maxItemsPerOrder, 1)}
          {numField("maxWeeklySpecialPerOrder", "Max v/d week / bestelling (Y)", "Max weekly special / order (Y)", config.maxWeeklySpecialPerOrder, 0)}
          {numField("orderLeadDays", "Dagen vooraf bestellen", "Order lead days", config.orderLeadDays, 0)}
          {timeField("orderOpenTime", "Bestellen opent om", "Ordering opens at", config.orderOpenTime)}
          {timeField("cancelDeadline", "Annulatiedeadline", "Cancellation deadline", config.cancelDeadline)}
          {timeField("pickupDefaultStart", "Afhalen vanaf (default)", "Pickup from (default)", config.pickupDefaultStart)}
          {timeField("pickupDefaultEnd", "Afhalen tot (default)", "Pickup until (default)", config.pickupDefaultEnd)}
          {numField("noShowGraceMinutes", "No-show grace (min)", "No-show grace (min)", config.noShowGraceMinutes, 0)}
          {numField("noShowThreshold", "No-shows voor ban", "No-shows before ban", config.noShowThreshold, 1)}
          {numField("banDurationDays", "Ban-duur (dagen)", "Ban duration (days)", config.banDurationDays, 1)}
          <div className="sm:col-span-3">
            <Button type="submit">{nl ? "Configuratie opslaan" : "Save configuration"}</Button>
          </div>
        </form>
      </Card>

      {/* Custom bericht */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Bericht op bestelpagina" : "Message on order page"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl ? "Laat leeg om geen bericht te tonen." : "Leave empty to show no message."}
        </p>
        <form action={saveOrderMessageAction} className="space-y-4">
          <div>
            <Label>{nl ? "Bericht (NL)" : "Message (NL)"}</Label>
            <Textarea name="bodyNl" defaultValue={message.bodyNl ?? ""} />
          </div>
          <div>
            <Label>{nl ? "Bericht (EN)" : "Message (EN)"}</Label>
            <Textarea name="bodyEn" defaultValue={message.bodyEn ?? ""} />
          </div>
          <Button type="submit">{nl ? "Bericht opslaan" : "Save message"}</Button>
        </form>
      </Card>
    </div>
  );
}
