import 'server-only';
import { prisma } from '@vtk/db';

/**
 * De verhuurvoorwaarden van 't ElixIr.
 *
 * Ze stonden hardgecodeerd op twee plaatsen: op /verhuur hier en op
 * /fakbar-huren op vtk.be, allebei met "€250,00 (academiejaar 2025-2026)" in de
 * JSX. Het tarief wijzigt per academiejaar en het is niet de bedoeling dat de
 * fakbar daarvoor een pull request nodig heeft; het staat nu in `Setting` onder
 * `fakbar.rental` en is te bewerken via /admin/instellingen.
 */

export const RENTAL_SETTING_KEY = 'fakbar.rental';

export type RentalSettings = {
  /** Het huurtarief in cent. */
  feeCents: number;
  /** Waar het tarief voor geldt, bv. "academiejaar 2025-2026". */
  period: string;
  /** Het e-mailadres waar een aanvraag naartoe gaat. */
  contactEmail: string;
  /** Voorwaarden, één per regel in de admin. */
  conditions: { title: string; body: string }[];
};

const DEFAULTS: RentalSettings = {
  feeCents: 25000,
  period: '',
  contactEmail: 'fakbar@vtk.be',
  conditions: [
    {
      title: 'Hoofdtapper',
      body: "Er staat altijd minstens één hoofdtapper van 't ElixIr mee achter de toog. Die kent het gebouw en de installatie en stelt de toog aan.",
    },
    {
      title: 'Drank',
      body: 'Alle drank loopt via het vaste assortiment van de fakbar. Eigen drank meebrengen kan niet.',
    },
    {
      title: 'Afrekening',
      body: 'De effectieve omzet, de kratten en eventuele schade worden achteraf op de eindfactuur verrekend.',
    },
  ],
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export function parseRentalSettings(value: unknown): RentalSettings {
  const source = asRecord(value);
  const fee = Number(source.feeCents);
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.map(asRecord).flatMap((row) => {
        const title = asText(row.title);
        const body = asText(row.body);
        return title || body ? [{ title, body }] : [];
      })
    : [];

  return {
    feeCents: Number.isInteger(fee) && fee >= 0 ? fee : DEFAULTS.feeCents,
    period: asText(source.period),
    contactEmail: asText(source.contactEmail, DEFAULTS.contactEmail),
    conditions: conditions.length > 0 ? conditions : DEFAULTS.conditions,
  };
}

export async function getRentalSettings(): Promise<RentalSettings> {
  const row = await prisma.setting.findUnique({ where: { key: RENTAL_SETTING_KEY } });
  return parseRentalSettings(row?.value);
}

export async function saveRentalSettings(settings: RentalSettings): Promise<void> {
  const value = { ...settings };
  await prisma.setting.upsert({
    where: { key: RENTAL_SETTING_KEY },
    create: { key: RENTAL_SETTING_KEY, value },
    update: { value },
  });
}
