/**
 * Wat de beheeracties onder elkaar delen (T1 uit de audit van november 2026).
 *
 * Geen `'use server'`: dit zijn gewone hulpfuncties, en een bestand met die
 * richtlijn mag enkel async functies exporteren.
 */

import { revalidatePath } from 'next/cache';

export function revalidateBeheer() {
  revalidatePath('/beheer');
  revalidatePath('/beheer/aanvragen');
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/vervoer/week');
  revalidatePath('/beheer/materiaal');
  revalidatePath('/beheer/sjablonen');
  revalidatePath('/beheer/flesserke');
  revalidatePath('/beheer/evenementen');
  revalidatePath('/beheer/kalender');
  revalidatePath('/beheer/instellingen');
  revalidatePath('/beheer/chauffeurs');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
  revalidatePath('/reservaties');
  revalidatePath('/ritten');
}

export function parseEuroToCents(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return 0;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Versie waarop de editor het record laadde (de `updatedAt` die het formulier
 * meestuurt). Voor optimistic locking: bij het opslaan matchen we op deze
 * `updatedAt`, zodat een save die op verouderde data is gebaseerd (iemand
 * anders paste intussen aan) faalt in plaats van stilletjes te overschrijven.
 * Prisma beheert `@updatedAt` op milliseconde-precisie, dus de round-trip is
 * exact. Ontbreekt de waarde, dan valt de guard weg (last-write-wins).
 */
export function parseExpectedVersion(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Betalingen die een terugdraaiing tegenhouden: wat nog loopt of gelukt is.
 * Een geslaagde online betaling vraagt een terugbetaling bij de provider.
 */
export const BLOCKING_PAYMENT_STATUSES = ['CREATED', 'PENDING', 'SUCCEEDED'];
