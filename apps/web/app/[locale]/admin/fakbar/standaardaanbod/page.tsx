import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import {
  FAKBAR_CATEGORIES,
  centsToEuroInput,
  formatEuroCents,
  profitPerServingCents,
  purchasePerServingCents,
} from "@/lib/fakbar";
import { FakbarAdminNav } from "../FakbarAdminNav";
import { FakbarOfferingManager, type OfferingRow } from "./FakbarOfferingManager";

/**
 * Standaardaanbod van de Fakbar: elke drank met haar aankoopeenheid, het aantal
 * consumpties daaruit en de verkoopprijs. De aankoopprijs per consumptie en de
 * winst worden berekend (zie `lib/fakbar.ts`), niet bewaard.
 *
 * Iedereen van de post leest de lijst (`fakbar.manage`); enkel de
 * verantwoordelijke bewerkt ze (`fakbar.offering.manage`, via de rol
 * `fakbar-lead` die als LEADER aan de post hangt).
 */
export default async function AdminFakbarStandaardaanbod({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requirePermission("fakbar.manage");
  const canEdit =
    session.user.isSuperAdmin || session.permissions.includes("fakbar.offering.manage");

  const products = await prisma.fakbarProduct.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  const rows: OfferingRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    purchaseUnitEuro: centsToEuroInput(p.purchaseUnitCents),
    servingsPerUnit: String(p.servingsPerUnit),
    salePriceEuro: centsToEuroInput(p.salePriceCents),
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">
        Fakbar · {nl ? "Standaardaanbod" : "Default offering"}
      </h1>
      <FakbarAdminNav base={base} nl={nl} active="standaardaanbod" />

      <Card className="p-5">
        {canEdit ? (
          <FakbarOfferingManager nl={nl} initial={rows} />
        ) : (
          <ReadOnlyOffering nl={nl} products={products} />
        )}
      </Card>
    </div>
  );
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  purchaseUnitCents: number;
  servingsPerUnit: number;
  salePriceCents: number;
};

/** Leesweergave voor wie het aanbod niet mag wijzigen: dezelfde kolommen,
 *  zonder invoervelden. */
 /** Leesweergave voor wie het aanbod niet mag wijzigen: dezelfde kolommen,
  *  zonder invoervelden. */
 function ReadOnlyOffering({ nl, products }: { nl: boolean; products: ProductRow[] }) {
   if (products.length === 0) {
     return (
       <p className="text-sm text-[#5c667f]">
         {nl ? "Er staat nog niets in het aanbod." : "The offering is still empty."}
       </p>
     );
   }

   return (
     <div className="space-y-5">
       {FAKBAR_CATEGORIES.map((category) => {
         const items = products.filter((p) => p.category === category.value);
         if (items.length === 0) return null;

         return (
           <section key={category.value}>
             <h3 className="mb-2 text-sm font-semibold text-vtk-ink">
               {nl ? category.nl : category.en}
             </h3>
             <div className="overflow-x-auto">
               <table className="w-full min-w-[38rem] table-fixed text-sm">
                 <thead>
                   {/* ADDED whitespace-nowrap TO THIS ROW */}
                   <tr className="whitespace-nowrap border-b border-vtk-blue/10 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                     <th className="w-[35%] py-1 pr-3 text-left font-semibold">
                       {nl ? "Naam" : "Name"}
                     </th>
                     <th className="w-[13%] py-1 pr-3 text-right font-semibold">
                       {nl ? "Prijs / eenheid" : "Price / unit"}
                     </th>
                     <th className="w-[13%] py-1 pr-3 text-right font-semibold">
                       {nl ? "Consumpties" : "Servings"}
                     </th>
                     <th className="w-[13%] py-1 pr-3 text-right font-semibold">
                       {nl ? "Aankoop / cons." : "Cost / serving"}
                     </th>
                     <th className="w-[13%] py-1 pr-3 text-right font-semibold">
                       {nl ? "Verkoop / cons." : "Sale / serving"}
                     </th>
                     <th className="w-[13%] py-1 text-right font-semibold">
                       {nl ? "Winst / cons." : "Profit / serving"}
                     </th>
                   </tr>
                 </thead>
                 <tbody>
                   {items.map((p) => {
                     const purchase = purchasePerServingCents(p);
                     const profit = profitPerServingCents(p);
                     return (
                       <tr key={p.id} className="border-b border-vtk-blue/10 last:border-0">
                         <td className="py-1.5 pr-3 text-vtk-ink">{p.name}</td>
                         <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                           {formatEuroCents(p.purchaseUnitCents, nl)}
                         </td>
                         <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                           {p.servingsPerUnit}
                         </td>
                         <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                           {purchase === null ? "—" : formatEuroCents(purchase, nl)}
                         </td>
                         <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                           {formatEuroCents(p.salePriceCents, nl)}
                         </td>
                         <td
                           className={`py-1.5 text-right font-medium tabular-nums ${
                             profit !== null && profit < 0 ? "text-red-600" : "text-vtk-ink"
                           }`}
                         >
                           {profit === null ? "—" : formatEuroCents(profit, nl)}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           </section>
         );
       })}
     </div>
   );
 }
