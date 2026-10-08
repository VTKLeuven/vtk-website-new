import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label, Textarea } from "@vtk/ui";
import { formatEuro, parseTheokotConfig, sandwichVoucherCost } from "@/lib/theokot";
import { formatVouchers } from "@/lib/shift/rewards";
import { saveBureauStockAction, saveConfigAction, saveOrderMessageAction } from "@/app/actions/theokot";
import { parseBureauStock } from "@/lib/meetings";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { ProductCatalogManager } from "../ProductCatalogManager";
import type { OfferingRow } from "../OfferingRows";

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

  const [configRow, messageRow, bureauStockRow, products] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "theokot.config" } }),
    prisma.setting.findUnique({ where: { key: "theokot.orderMessage" } }),
    prisma.setting.findUnique({ where: { key: "theokot.bureauStock" } }),
    prisma.theokotProduct.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);
  const config = parseTheokotConfig(configRow?.value);
  const bureauStock = parseBureauStock(bureauStockRow?.value);
  const message = (messageRow?.value as { bodyNl?: string; bodyEn?: string }) ?? {};
  const catalog: OfferingRow[] = products.map((p) => ({
    id: p.id,
    nameNl: p.nameNl,
    nameEn: p.nameEn ?? "",
    priceEuro: (p.priceCents / 100).toFixed(2),
    quantity: p.defaultQuantity,
    isWeeklySpecial: p.isWeeklySpecialSlot,
    imageKey: p.imageKey,
    badgeImageKey: p.badgeImageKey,
    ingredientsNl: p.ingredientsNl ?? "",
    ingredientsEn: p.ingredientsEn ?? "",
    hasLines: false,
    // De catalogus is een sjabloon; bestellingen hangen aan het aanbod van een
    // verkoopdag, niet hieraan.
    ordered: 0,
  }));

  // Wat het standaardaanbod met de huidige waarde kost, zodat wie de waarde
  // aanpast meteen ziet wat dat aan de balie betekent.
  const voucherExamples = products.map((p) => ({
    id: p.id,
    name: nl ? p.nameNl : p.nameEn || p.nameNl,
    priceCents: p.priceCents,
    cost: sandwichVoucherCost(p.priceCents, config.voucherHalfCents),
  }));

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
        <SaveForm
          action={saveConfigAction}
          className="grid gap-4 sm:grid-cols-3"
          submitLabel={nl ? "Configuratie opslaan" : "Save configuration"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Configuratie opgeslagen" : "Configuration saved"}
          fallbackErrorMessage={nl ? "Opslaan van de configuratie mislukt." : "Saving the configuration failed."}
          errorMessages={{
            WEEKLY_SPECIAL_TOO_HIGH: nl
              ? "Het maximum aan broodjes van de week moet lager liggen dan het maximum per bestelling."
              : "The weekly special limit must be lower than the limit per order.",
            VOUCHER_HALF_INVALID: nl
              ? "Geef een bedrag van minstens €0,01 in voor een half bonnetje."
              : "Enter an amount of at least €0.01 for half a voucher.",
          }}
        >
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
          <fieldset className="grid gap-3 sm:col-span-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="noShowPaused"
                defaultChecked={config.noShowPaused}
                className="mt-0.5 h-4 w-4 accent-vtk-ink"
              />
              <span>
                <span className="block font-medium text-vtk-ink">
                  {nl ? "No-shows en bans pauzeren" : "Pause no-shows and bans"}
                </span>
                <span className="text-[#5c667f]">
                  {nl
                    ? "Zolang dit aan staat, krijgt niemand een no-show-mail en komt er geen automatische ban. Een niet-opgehaalde bestelling blijft als niet opgehaald geboekt, maar telt ook later niet mee voor een ban. Lopende bans blijven lopen."
                    : "While this is on, nobody gets a no-show email and no automatic ban is created. An order that is not picked up is still booked as such, but never counts towards a ban. Running bans stay in place."}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="autoPickup"
                defaultChecked={config.autoPickup}
                className="mt-0.5 h-4 w-4 accent-vtk-ink"
              />
              <span>
                <span className="block font-medium text-vtk-ink">
                  {nl ? "Automatisch op afgehaald zetten" : "Mark as picked up automatically"}
                </span>
                <span className="text-[#5c667f]">
                  {nl
                    ? "Aan de afhaalbalie staat een bestelling meteen op opgehaald zodra de student gevonden is: met de kaartlezer, de pas uit de app, een r-nummer, een naam of een keuze uit de lijst. Gebruikt de student bonnetjes, dan gebeurt het na die vraag. Een laattijdige bestelling blijft een klik. Een foute match zet de shifter meteen terug met Ongedaan maken."
                    : "At the pickup counter an order is marked as picked up as soon as the student is found: with the card reader, the app pass, an r-number, a name or a choice from the list. If the student uses vouchers, it happens after that question. A late order still needs a click. A wrong match can be reverted at once with Undo."}
                </span>
              </span>
            </label>
          </fieldset>
          <div className="sm:col-span-3">
            <Label htmlFor="voucherHalfEuro">
              {nl ? "Een half medewerkersbonnetje per (€)" : "Half a staff voucher per (€)"}
            </Label>
            <div className="max-w-[10rem]">
              <Input
                id="voucherHalfEuro"
                name="voucherHalfEuro"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(config.voucherHalfCents / 100).toFixed(2)}
              />
            </div>
            <p className="mt-1.5 text-sm text-[#5c667f]">
              {nl
                ? "Wat een broodje aan de afhaalbalie kost in bonnetjes: de prijs gedeeld door dit bedrag, afgerond op het dichtste halve bonnetje. Met €0,60 is een broodje van €2,30 of €2,60 twee bonnetjes en een van €3,00 tweeënhalf. Bij de shiften worden enkel hele bonnetjes fysiek meegegeven; een half blijft openstaan voor de balie."
                : "What a sandwich costs in vouchers at the pickup counter: its price divided by this amount, rounded to the nearest half voucher. At €0.60 a sandwich of €2.30 or €2.60 is two vouchers and one of €3.00 two and a half. Shift payouts only hand out whole vouchers; a half stays open for the counter."}
            </p>
            {voucherExamples.length > 0 ? (
              <table className="mt-3 w-full max-w-md text-sm">
                <caption className="mb-1 text-left text-xs font-medium uppercase tracking-wide text-[#5c667f]">
                  {nl
                    ? `Het standaardaanbod met ${formatEuro(config.voucherHalfCents)} per half bonnetje`
                    : `The default offering at ${formatEuro(config.voucherHalfCents)} per half voucher`}
                </caption>
                <thead className="text-left text-[#5c667f]">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{nl ? "Broodje" : "Sandwich"}</th>
                    <th className="py-1 pr-3 text-right font-medium">{nl ? "Prijs" : "Price"}</th>
                    <th className="py-1 text-right font-medium">{nl ? "Bonnetjes" : "Vouchers"}</th>
                  </tr>
                </thead>
                <tbody>
                  {voucherExamples.map((example) => (
                    <tr key={example.id} className="border-t border-vtk-navy/10">
                      <td className="py-1 pr-3 text-vtk-ink">{example.name}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{formatEuro(example.priceCents)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {formatVouchers(example.cost, nl ? "nl" : "en")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="itemLayout">{nl ? "Weergave van de broodjes" : "Sandwich display"}</Label>
            <div className="max-w-xs">
              <ThemedSelect
                id="itemLayout"
                name="itemLayout"
                defaultValue={config.itemLayout}
                options={[
                  { value: "list", label: nl ? "Lijst" : "List" },
                  { value: "grid", label: nl ? "Raster met foto's" : "Grid with photos" },
                ]}
              />
            </div>
            <p className="mt-1.5 text-sm text-[#5c667f]">
              {nl
                ? "Zo staan de broodjes op de bestelpagina. Een raster geeft de foto's ruimte; een lijst blijft compacter wanneer er weinig foto's zijn."
                : "How the sandwiches appear on the order page. A grid gives the photos room; a list stays more compact when there are few photos."}
            </p>
          </div>
        </SaveForm>
      </Card>

      {/* Standaardaanbod (catalogus). Het id is het anker van de link op het
          scherm met de verkoopdagen. */}
      <Card className="p-5" id="standaardaanbod">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Standaardaanbod" : "Default offering"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "De default namen, prijzen, aantallen, foto's en ingrediënten die als startpunt getoond worden bij “Verkoopweek aanmaken”. Per week kan je nadien nog afwijken; wijzigingen hier raken bestaande weken niet."
            : "The default names, prices, quantities, photos and ingredients shown as a starting point when creating a sale week. You can still deviate per week afterwards; changes here don't affect existing weeks."}
        </p>
        <ProductCatalogManager nl={nl} initial={catalog} />
      </Card>

      {/* Bureauvoorraad: hoort bij het standaardaanbod, want het is wat Theokot
          voor elk bureau extra maakt. */}
      <Card className="p-5" id="bureauvoorraad">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Bureauvoorraad" : "Bureau stock"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Zoveel broodjes maakt Theokot voor elk VTK Bureau extra, bovenop het aanbod van die dag. Het bureau neemt eerst van de gewone voorraad; is een broodje voor studenten op, dan kan het bureau het nog uit deze voorraad krijgen. Studenten zien deze broodjes nooit. Ze staan in de kolom Bureau van de lijst bestelde broodjes. Een lager getal schrapt niemand: wie al een broodje uit de bureauvoorraad heeft, houdt het. 0 = geen bureauvoorraad."
            : "This many sandwiches Theokot makes extra for every VTK Bureau, on top of that day's offering. The bureau takes from the normal stock first; once a sandwich is gone for students, the bureau can still get it from this stock. Students never see these sandwiches. They are in the Bureau column of the ordered sandwiches list. A lower number drops nobody: whoever already has a sandwich from the bureau stock keeps it. 0 = no bureau stock."}
        </p>
        <SaveForm
          action={saveBureauStockAction}
          className="flex flex-wrap items-end gap-3"
          resetOnSuccess={false}
          submitLabel={nl ? "Opslaan" : "Save"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Bureauvoorraad opgeslagen" : "Bureau stock saved"}
          fallbackErrorMessage={nl ? "Opslaan van de bureauvoorraad mislukt." : "Saving the bureau stock failed."}
          errorMessages={{
            INVALID_NUMBER: nl
              ? "Geef een geheel aantal broodjes in, 0 of meer."
              : "Enter a whole number of sandwiches, 0 or more.",
          }}
        >
          <div className="w-44">
            <Label htmlFor="extraSandwiches">{nl ? "Extra broodjes per bureau" : "Extra sandwiches per bureau"}</Label>
            <Input id="extraSandwiches" name="extraSandwiches" type="number" min={0} step={1} defaultValue={bureauStock} />
          </div>
        </SaveForm>
      </Card>

      {/* Custom bericht */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Bericht op bestelpagina" : "Message on order page"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl ? "Laat leeg om geen bericht te tonen." : "Leave empty to show no message."}
        </p>
        <SaveForm
          action={saveOrderMessageAction}
          className="space-y-4"
          submitLabel={nl ? "Bericht opslaan" : "Save message"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Bericht opgeslagen" : "Message saved"}
          fallbackErrorMessage={nl ? "Opslaan van het bericht mislukt." : "Saving the message failed."}
        >
          <div>
            <Label>{nl ? "Bericht (NL)" : "Message (NL)"}</Label>
            <Textarea name="bodyNl" defaultValue={message.bodyNl ?? ""} />
          </div>
          <div>
            <Label>{nl ? "Bericht (EN)" : "Message (EN)"}</Label>
            <Textarea name="bodyEn" defaultValue={message.bodyEn ?? ""} />
          </div>
        </SaveForm>
      </Card>
    </div>
  );
}
