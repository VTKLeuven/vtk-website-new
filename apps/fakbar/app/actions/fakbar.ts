"use server";

import { prisma } from "@vtk/db";
import type { FakbarConsumptionCategory, FakbarItemCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";

// -----------------------------------------------------------------------------
// Seed / Default Items Helper
// -----------------------------------------------------------------------------
export async function ensureDefaultFakbarItems() {
  const count = await prisma.fakbarItem.count();
  if (count > 0) return;

  const defaultItems: Array<{ name: string; category: FakbarItemCategory; salesPrice: number }> = [
    // VAT
    { name: "Stella Artois", category: "VAT", salesPrice: 120 },
    { name: "Sint-Barbara", category: "VAT", salesPrice: 150 },
    { name: "Tripel Karmeliet", category: "VAT", salesPrice: 230 },
    { name: "Suggestie van 't vat", category: "VAT", salesPrice: 200 },
    // BIER_WIJN
    { name: "Chimay Bleu", category: "BIER_WIJN", salesPrice: 230 },
    { name: "La Chouffe", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Duvel", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Kriek Lindemans", category: "BIER_WIJN", salesPrice: 150 },
    { name: "Leffe", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Paix Dieu", category: "BIER_WIJN", salesPrice: 250 },
    { name: "Omer", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Westmalle Tripel", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Desperados", category: "BIER_WIJN", salesPrice: 250 },
    { name: "Stella 0.0%", category: "BIER_WIJN", salesPrice: 120 },
    { name: "Strongbow Apple", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Strongbow Red", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Kasteelbier Rouge", category: "BIER_WIJN", salesPrice: 230 },
    { name: "Stëlz mango", category: "BIER_WIJN", salesPrice: 200 },
    // FRISDRANK
    { name: "Coca Cola", category: "FRISDRANK", salesPrice: 120 },
    { name: "Coca Cola Zero", category: "FRISDRANK", salesPrice: 120 },
    { name: "Fanta", category: "FRISDRANK", salesPrice: 120 },
    { name: "Sprite", category: "FRISDRANK", salesPrice: 120 },
    { name: "Water Bruis", category: "FRISDRANK", salesPrice: 100 },
    { name: "Water Plat", category: "FRISDRANK", salesPrice: 100 },
    // STERK
    { name: "Jenever Appel-Kers", category: "STERK", salesPrice: 150 },
    { name: "Jenever Bessen", category: "STERK", salesPrice: 150 },
    { name: "Passoã", category: "STERK", salesPrice: 200 },
  ];

  for (const item of defaultItems) {
    await prisma.fakbarItem.create({ data: item });
  }
}

// -----------------------------------------------------------------------------
// Week Management
// -----------------------------------------------------------------------------
export async function getOrCreateCurrentWeek(year: number = 2026, weekNumber: number = 7) {
  await ensureDefaultFakbarItems();

  let week = await prisma.fakbarWeek.findUnique({
    where: { year_weekNumber: { year, weekNumber } },
    include: {
      evenings: {
        orderBy: { date: "asc" },
        include: {
          hoofdtapper: true,
          cashCount: true,
          rental: true,
        },
      },
      stockCounts: {
        include: { item: true },
      },
    },
  });

  if (!week) {
    const startDate = new Date(year, 2, 22); // Example Sunday March 22, 2026
    const endDate = new Date(year, 2, 27); // Example Friday March 27, 2026

    week = await prisma.fakbarWeek.create({
      data: {
        year,
        weekNumber,
        startDate,
        endDate,
        evenings: {
          create: [
            { dayOfWeek: "Zondag", date: new Date(year, 2, 22) },
            { dayOfWeek: "Maandag", date: new Date(year, 2, 23) },
            { dayOfWeek: "Dinsdag", date: new Date(year, 2, 24) },
            { dayOfWeek: "Woensdag", date: new Date(year, 2, 25) },
            { dayOfWeek: "Donderdag", date: new Date(year, 2, 26) },
            { dayOfWeek: "Vrijdag", date: new Date(year, 2, 27) },
          ],
        },
      },
      include: {
        evenings: {
          orderBy: { date: "asc" },
          include: {
            hoofdtapper: true,
            cashCount: true,
            rental: true,
          },
        },
        stockCounts: {
          include: { item: true },
        },
      },
    });

    // Initialize stock counts for all items
    const items = await prisma.fakbarItem.findMany();
    for (const item of items) {
      await prisma.fakbarStockCount.create({
        data: {
          weekId: week.id,
          itemId: item.id,
        },
      });
    }
  }

  return week;
}

// -----------------------------------------------------------------------------
// Stocktelling Actions
// -----------------------------------------------------------------------------
export async function updateStockCount(
  stockCountId: string,
  data: {
    beginOpslag?: number;
    levering?: number;
    naarPost?: number;
    naarFrigo?: number;
    eindOpslag?: number;
    beginTelling?: number;
    eindTelling?: number;
  }
) {
  await prisma.fakbarStockCount.update({
    where: { id: stockCountId },
    data,
  });
  revalidatePath("/admin/telling");
}

// -----------------------------------------------------------------------------
// Daily Kassa & Evening Actions
// -----------------------------------------------------------------------------
export async function updateEveningDetails(
  eveningId: string,
  data: {
    hoofdtapperId?: string | null;
    specialeActiviteit?: string | null;
    bancontactRevenue?: number;
    cashToSafe?: number;
  }
) {
  await prisma.fakbarEvening.update({
    where: { id: eveningId },
    data,
  });
  revalidatePath("/admin");
}

export async function updateCashRegisterCount(
  eveningId: string,
  counts: {
    cnt_0_05?: number;
    cnt_0_10?: number;
    cnt_0_20?: number;
    cnt_0_50?: number;
    cnt_1_00?: number;
    cnt_2_00?: number;
    cnt_5_00?: number;
    cnt_10_00?: number;
    cnt_20_00?: number;
    cnt_50_00?: number;
    cnt_100_00?: number;
    cnt_elixirbon?: number;
    cnt_guidogids?: number;
    cnt_medewerkersbon?: number;
  }
) {
  await prisma.fakbarCashRegisterCount.upsert({
    where: { eveningId },
    create: {
      eveningId,
      ...counts,
    },
    update: counts,
  });
  revalidatePath("/admin");
}

// -----------------------------------------------------------------------------
// Consumption / Drankverbruik Actions
// -----------------------------------------------------------------------------
export async function recordConsumption(
  eveningId: string,
  itemId: string,
  category: FakbarConsumptionCategory,
  quantity: number
) {
  const existing = await prisma.fakbarConsumption.findFirst({
    where: { eveningId, itemId, category },
  });

  if (existing) {
    await prisma.fakbarConsumption.update({
      where: { id: existing.id },
      data: { quantity },
    });
  } else {
    await prisma.fakbarConsumption.create({
      data: { eveningId, itemId, category, quantity },
    });
  }
  revalidatePath("/admin");
}

// -----------------------------------------------------------------------------
// Rental Actions
// -----------------------------------------------------------------------------
export async function upsertRentalDetails(
  eveningId: string,
  data: {
    rentalFee?: number;
    expectedRevenue?: number;
    effectiveProfit?: number;
  }
) {
  await prisma.fakbarRental.upsert({
    where: { eveningId },
    create: {
      eveningId,
      rentalFee: data.rentalFee ?? 25000,
      expectedRevenue: data.expectedRevenue ?? 0,
      effectiveProfit: data.effectiveProfit ?? 0,
    },
    update: data,
  });
  revalidatePath("/admin");
}
