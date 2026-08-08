"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { euroToCents } from "@/lib/fakbar";
import { DENOMINATIONS } from "@/lib/fakbar-cash";

const ADMIN_PATH = "/admin/fakbar";

/**
 * Leest een tellingsraster uit het formulier: `<prefix>-<denominatie in cent>`
 * per munt of biljet. Een leeg veld is nul (niemand vult acht nullen in), een
 * negatief of onzinnig aantal is een fout.
 */
function readCashCount(
  formData: FormData,
  prefix: string,
): { counts: Array<{ denominationCents: number; quantity: number }> } | { error: string } {
  const counts: Array<{ denominationCents: number; quantity: number }> = [];

  for (const denomination of DENOMINATIONS) {
    const raw = formData.get(`${prefix}-${denomination.cents}`);
    if (raw === null || raw === "") continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) return { error: "INVALID_COUNT" };
    if (quantity === 0) continue;
    counts.push({ denominationCents: denomination.cents, quantity });
  }

  return { counts };
}

/** Leest de bonnentelling: `coupon-<id>` per actief bontype. */
async function readCoupons(
  formData: FormData,
): Promise<
  { coupons: Array<{ couponTypeId: string; quantity: number; valueCents: number }> } | { error: string }
> {
  const types = await prisma.fakbarCouponType.findMany({ where: { active: true } });
  const coupons: Array<{ couponTypeId: string; quantity: number; valueCents: number }> = [];

  for (const type of types) {
    const raw = formData.get(`coupon-${type.id}`);
    if (raw === null || raw === "") continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) return { error: "INVALID_COUNT" };
    if (quantity === 0) continue;
    // De waarde wordt hier vastgeklikt: herprijst de verantwoordelijke de bon
    // later, dan blijft deze shift kloppen.
    coupons.push({ couponTypeId: type.id, quantity, valueCents: type.valueCents });
  }

  return { coupons };
}

/**
 * Opent een shift met de kassatelling van dat moment.
 *
 * Er kan er maar één tegelijk openstaan. Dat wordt in een Serializable-
 * transactie gecontroleerd: twee mensen die tegelijk op "Shift starten" duwen
 * mogen geen twee open shiften opleveren, want dan telt niemand nog dezelfde
 * kassa.
 */
export async function openFakbarShiftAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("fakbar.manage");

  const start = readCashCount(formData, "start");
  if ("error" in start) return saveError(start.error);

  try {
    await prisma.$transaction(
      async (tx) => {
        const open = await tx.fakbarShift.findFirst({ where: { closedAt: null } });
        if (open) throw new ShiftConflictError("ALREADY_OPEN");

        await tx.fakbarShift.create({
          data: {
            openedById: session.user.id,
            cashCounts: {
              create: start.counts.map((c) => ({ ...c, moment: "START" as const })),
            },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ShiftConflictError) return saveError(err.code);
    throw err;
  }

  revalidatePath(ADMIN_PATH);
  return saveOk();
}

/**
 * Sluit de open shift af: tweede kassatelling, wat er naar de kluis ging, de
 * bonnen die binnenkwamen en de SumUp-omzet.
 */
export async function closeFakbarShiftAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("fakbar.manage");

  const shiftId = (formData.get("shiftId") as string) || "";
  if (!shiftId) return saveError("NOT_OPEN");

  const end = readCashCount(formData, "end");
  if ("error" in end) return saveError(end.error);
  const vault = readCashCount(formData, "vault");
  if ("error" in vault) return saveError(vault.error);

  const coupons = await readCoupons(formData);
  if ("error" in coupons) return saveError(coupons.error);

  // SumUp mag leeg blijven (een avond zonder kaartbetalingen); staat er iets,
  // dan moet het een bedrag zijn.
  const sumUpRaw = ((formData.get("sumUp") as string) || "").trim();
  const sumUpCents = sumUpRaw === "" ? 0 : euroToCents(sumUpRaw);
  if (sumUpCents === null) return saveError("INVALID_SUMUP");

  const note = ((formData.get("note") as string) || "").trim() || null;

  try {
    await prisma.$transaction(
      async (tx) => {
        const shift = await tx.fakbarShift.findUnique({ where: { id: shiftId } });
        if (!shift) throw new ShiftConflictError("NOT_OPEN");
        // Iemand anders was sneller: dan is deze telling niet meer de afsluiting
        // en willen we ze niet stil over de hunne heen schrijven.
        if (shift.closedAt) throw new ShiftConflictError("ALREADY_CLOSED");

        await tx.fakbarCashCount.deleteMany({
          where: { shiftId, moment: { in: ["END", "VAULT"] } },
        });
        await tx.fakbarShiftCoupon.deleteMany({ where: { shiftId } });

        await tx.fakbarShift.update({
          where: { id: shiftId },
          data: {
            closedAt: new Date(),
            closedById: session.user.id,
            sumUpCents,
            sumUpSource: "MANUAL",
            note,
            cashCounts: {
              create: [
                ...end.counts.map((c) => ({ ...c, moment: "END" as const })),
                ...vault.counts.map((c) => ({ ...c, moment: "VAULT" as const })),
              ],
            },
            coupons: { create: coupons.coupons },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ShiftConflictError) return saveError(err.code);
    throw err;
  }

  revalidatePath(ADMIN_PATH);
  return saveOk();
}

/**
 * Beheert de bontypes (naam + waarde). Enkel de Fakbar-verantwoordelijke, net
 * als het standaardaanbod.
 *
 * Een bon die uit de lijst gehaald wordt, wordt gedeactiveerd en niet
 * verwijderd: de tellingen van oude shiften hangen eraan vast.
 */
export async function saveFakbarCouponTypesAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("fakbar.offering.manage");

  const count = Number(formData.get("couponCount")) || 0;
  const rows: Array<{ id: string; name: string; valueCents: number }> = [];

  for (let i = 0; i < count; i += 1) {
    const name = ((formData.get(`coupon-${i}-name`) as string) || "").trim();
    if (!name) continue;
    const valueCents = euroToCents(formData.get(`coupon-${i}-value`));
    if (valueCents === null) return saveError("INVALID_PRICE");
    rows.push({ id: (formData.get(`coupon-${i}-id`) as string) || "", name, valueCents });
  }

  const keepIds = new Set<string>();
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 1) {
      const { id, name, valueCents } = rows[i];
      const data = { name, valueCents, order: i, active: true };
      if (id) {
        keepIds.add(id);
        await tx.fakbarCouponType.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        });
      } else {
        const created = await tx.fakbarCouponType.create({ data });
        keepIds.add(created.id);
      }
    }

    const ids = [...keepIds];
    await tx.fakbarCouponType.updateMany({
      where: ids.length > 0 ? { id: { notIn: ids }, active: true } : { active: true },
      data: { active: false },
    });
  });

  revalidatePath("/admin/fakbar/standaardaanbod");
  revalidatePath(ADMIN_PATH);
  return saveOk();
}

/** Verwachte samenloop bij het openen/sluiten van een shift; komt als rode
 *  toast terug, niet als error boundary. */
class ShiftConflictError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
