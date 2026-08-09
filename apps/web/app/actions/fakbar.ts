"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { euroToCents, isFakbarCategory, type FakbarCategory } from "@/lib/fakbar";

const ADMIN_PATH = "/admin/fakbar/standaardaanbod";

type ParsedRow = {
  id: string;
  name: string;
  category: FakbarCategory;
  purchaseUnitCents: number;
  servingsPerUnit: number;
  salePriceCents: number;
};

/**
 * Schrijft het volledige standaardaanbod in één keer weg: het formulier stuurt
 * de lijst zoals ze op het scherm staat, en wat er niet meer in staat verdwijnt.
 * Rendert `drink-<i>-{id,name,category,purchaseUnit,servings,salePrice}` plus een
 * `drinkCount`, geschreven door `FakbarOfferingManager`.
 *
 * Enkel de verantwoordelijke van de post Fakbar heeft `fakbar.offering.manage`
 * (de rol `fakbar-lead` hangt als LEADER aan de post); de rest van de post leest
 * het aanbod met `fakbar.manage`.
 */
export async function saveFakbarOfferingAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("fakbar.offering.manage");

  const count = Number(formData.get("drinkCount")) || 0;
  const rows: ParsedRow[] = [];

  for (let i = 0; i < count; i += 1) {
    const name = ((formData.get(`drink-${i}-name`) as string) || "").trim();
    // Een lege rij is een rij die het lid toevoegde en niet invulde; die slaan we
    // over in plaats van er een fout van te maken.
    if (!name) continue;

    const category = formData.get(`drink-${i}-category`);
    if (!isFakbarCategory(category)) return saveError("INVALID_CATEGORY");

    const purchaseUnitCents = euroToCents(formData.get(`drink-${i}-purchaseUnit`));
    const salePriceCents = euroToCents(formData.get(`drink-${i}-salePrice`));
    if (purchaseUnitCents === null || salePriceCents === null) return saveError("INVALID_PRICE");

    const servingsPerUnit = Number(formData.get(`drink-${i}-servings`));
    if (!Number.isInteger(servingsPerUnit) || servingsPerUnit < 1) {
      return saveError("INVALID_SERVINGS");
    }

    rows.push({
      id: (formData.get(`drink-${i}-id`) as string) || "",
      name,
      category,
      purchaseUnitCents,
      servingsPerUnit,
      salePriceCents,
    });
  }

  const keepIds = new Set<string>();
  // Eén transactie: een half doorgevoerde prijslijst (nieuwe rijen bewaard, oude
  // niet opgeruimd) is erger dan een mislukte opslag.
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 1) {
      const { id, ...data } = rows[i];
      if (id) {
        keepIds.add(id);
        // Upsert, geen update: verdween de rij intussen (iemand anders bewerkte
        // de lijst), dan hoort dat geen 500 te geven.
        await tx.fakbarProduct.upsert({
          where: { id },
          update: { ...data, order: i },
          create: { id, ...data, order: i },
        });
      } else {
        const created = await tx.fakbarProduct.create({ data: { ...data, order: i } });
        keepIds.add(created.id);
      }
    }
    // Een lege lijst betekent "alles weg"; hoe `notIn: []` zich gedraagt laten we
    // niet voor ons beslissen.
    const ids = [...keepIds];
    if (ids.length > 0) {
      await tx.fakbarProduct.deleteMany({ where: { id: { notIn: ids } } });
    } else {
      await tx.fakbarProduct.deleteMany();
    }
  });

  revalidatePath(ADMIN_PATH);
  return saveOk();
}
