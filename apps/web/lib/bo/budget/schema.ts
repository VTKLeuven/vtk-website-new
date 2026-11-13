import { z } from 'zod';
import { AUDIENCES, LOCATION_FIELDS, SOURCE_TYPES, type BudgetContent, type BudgetSettings } from './types';

/*
 * Wat de server aanvaardt als inhoud van een budget en als instellingen. De
 * editor stuurt het hele document bij elke bewaring; alles wat hier niet in
 * past, is een fout van de client en geen invoerfout van de gebruiker.
 */

const money = z.number().finite().min(-10_000_000).max(10_000_000);
const share = z.number().finite().min(0).max(10);
const count = z.number().finite().min(0).max(1_000_000);
const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(40);
const formula = z.string().max(300);

const source = z.object({
  type: z.enum(SOURCE_TYPES),
  url: text(2000).optional(),
  note: text(500).optional(),
  field: z.enum(LOCATION_FIELDS).optional(),
});

const costRow = z.object({
  id,
  name: text(200),
  qty: count.optional(),
  pct: share.optional(),
  rest: z.boolean().optional(),
  mixOf: id.optional(),
  perPerson: count.optional(),
  perUnit: count.optional(),
  unit: text(40).optional(),
  price: money.optional(),
  basis: z.enum(['incl', 'excl']).nullable().optional(),
  productVat: z.number().min(0).max(1).optional(),
  source: source.nullable().optional(),
  override: money.nullable().optional(),
  overrideReason: text(500).optional(),
  forfait: z
    .object({ amount: money, reason: text(500) })
    .nullable()
    .optional(),
  flesserke: count.nullable().optional(),
  checkedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: text(1000).optional(),
  service: z.boolean().optional(),
  lastCheck: z
    .object({
      at: z.string().max(40),
      status: z.enum(['ok', 'changed', 'notfound', 'failed']),
      price: money.optional(),
      name: text(300).optional(),
      reason: text(300).optional(),
      basis: z.enum(['incl', 'excl']).optional(),
      shop: text(40).optional(),
    })
    .nullable()
    .optional(),
  fx: z.partialRecord(z.enum(['qty', 'pct', 'perPerson', 'perUnit', 'price']), formula).optional(),
  result: money.nullable().optional(),
});

const incomeRow = z.object({
  id,
  name: text(200),
  count: z.discriminatedUnion('type', [
    z.object({ type: z.literal('manual'), qty: count }),
    z.object({ type: z.literal('audience'), audience: z.enum(AUDIENCES) }),
    z.object({ type: z.literal('consumption'), rowId: id }),
    z.object({ type: z.literal('units'), rowId: id }),
  ]),
  price: z.discriminatedUnion('type', [
    z.object({ type: z.literal('manual'), value: money }),
    z.object({ type: z.literal('drinks'), sectionId: id, main: money, rest: money }),
  ]),
  note: text(1000).optional(),
  fx: z.partialRecord(z.enum(['qty', 'price']), formula).optional(),
  result: money.nullable().optional(),
});

const section = z.discriminatedUnion('type', [
  z.object({ id, name: text(120), type: z.literal('income'), rows: z.array(incomeRow).max(200) }),
  z.object({
    id,
    name: text(120),
    type: z.enum(['fixed', 'variable']),
    share: share.optional(),
    perPerson: count.optional(),
    distribute: z.boolean().optional(),
    base: count.nullable().optional(),
    fx: z.partialRecord(z.enum(['share', 'perPerson', 'base']), formula).optional(),
    rows: z.array(costRow).max(200),
  }),
]);

export const budgetContentSchema = z.object({
  version: z.literal(1),
  params: z.object({
    persons: count,
    guests: count.optional(),
    memberShare: share.optional(),
    honoraryShare: share.optional(),
    extra: z
      .array(
        z.object({
          id,
          name: text(80),
          value: money,
          kind: z.enum(['number', 'percent', 'money']).optional(),
          fx: formula.optional(),
        })
      )
      .max(40)
      .optional(),
  }),
  info: z.object({ date: text(40), location: text(120), concept: text(2000) }),
  begroting: money.nullable(),
  begrotingRef: z
    .object({ sheet: text(80), key: text(300), label: text(300) })
    .nullable()
    .optional(),
  potPart: z.boolean().optional(),
  vat: z.object({ rate: z.number().min(0).max(1), reason: text(500) }).nullable(),
  allocation: z
    .array(z.object({ org: text(80), share }))
    .min(1)
    .max(10),
  sections: z.array(section).max(30),
  result: z
    .object({ on: z.boolean(), note: text(2000).optional() })
    .nullable()
    .optional(),
  source: z
    .object({
      kind: z.enum(['drive', 'upload']),
      name: text(300),
      id: text(200).optional(),
      mode: z.enum(['regels', 'overzicht']),
      sheetTotal: money.nullable(),
    })
    .nullable()
    .optional(),
});

export function parseBudgetContent(value: unknown): BudgetContent | null {
  const parsed = budgetContentSchema.safeParse(value);
  return parsed.success ? (parsed.data as BudgetContent) : null;
}

const location = z.object({
  name: text(80).min(1),
  capacity: count.nullable(),
  zaal: money.nullable(),
  vaten: money.nullable(),
  licht: money.nullable(),
  stopsel: money.nullable(),
  sangria: money.nullable(),
  basis: z.enum(['incl', 'excl']).nullable(),
  note: text(300),
});

export const budgetSettingsSchema = z.object({
  vatByPost: z.record(z.string().max(60), z.number().min(0).max(1)),
  serviceCost: money,
  flesserkeCounts: z.boolean(),
  sangriaFallback: money,
  locations: z.array(location).max(100),
  // Ontbreekt in instellingen van voor de proef: dan doet niemand buiten Groep 5 mee.
  pilotPostKeys: z.array(z.string().max(60)).max(200).default([]),
  collectGoLive: z.boolean().default(true),
  colruytPostcode: z
    .string()
    .regex(/^(\d{4})?$/)
    .default(''),
});

export function parseBudgetSettings(value: unknown): BudgetSettings | null {
  const parsed = budgetSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const begrotingLine = z.object({ key: text(300), group: text(200), name: text(200), amount: money });

export const begrotingSchema = z.object({
  fileName: text(200),
  uploadedAt: z.string().max(40),
  sheets: z.array(z.object({ name: text(80), lines: z.array(begrotingLine).max(2000) })).max(80),
});
