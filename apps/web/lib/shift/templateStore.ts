import 'server-only';

import { prisma } from '@vtk/db';
import { BUILTIN_SHIFT_TEMPLATES } from '@vtk/db/shiftTemplates';
import type { BuiltinShiftTemplate } from '@vtk/db/shiftTemplates';
import type { ShiftTemplate } from '@/lib/shift/templates';

/**
 * Lezen en toepassen van de shiftsjablonen uit de databank.
 *
 * Server-only en bewust apart van `lib/shift/templates.ts`: dat bestand wordt
 * ook door het client-scherm geïmporteerd, en Prisma hoort daar niet in.
 */

type TemplateRow = ShiftTemplate;

/**
 * Val terug op de meegeleverde sjablonen zolang de tabel leeg is (een databank
 * die nog niet geseed is). Zonder dit staat het sjabloonscherm er leeg bij en
 * krijgt een Theokot-verkoopweek geen shiften, wat pas opvalt op de dag zelf.
 */
function fromBuiltin(template: BuiltinShiftTemplate): TemplateRow {
  return {
    id: `builtin:${template.slug}`,
    slug: template.slug,
    label: template.label,
    note: template.note ?? null,
    builtIn: true,
    eventName: template.eventName ?? '',
    location: template.location ?? '',
    post: template.post ?? null,
    timeOfDay: template.timeOfDay ?? null,
    shifts: template.shifts.map((entry, index) => ({
      id: `builtin:${template.slug}:${index}`,
      name: entry.name,
      startOffsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      maxParticipants: entry.maxParticipants,
      reward: entry.reward,
      description: entry.description,
      instructions: entry.instructions ?? null,
      location: entry.location ?? null,
      ownPost: entry.ownPost ?? false,
      post: entry.post ?? null,
      openToInternationals: entry.openToInternationals ?? false,
      enabled: entry.enabled ?? true,
    })),
  };
}

/** Alle sjablonen met hun shiften, in de volgorde van de keuzelijst. */
export async function listShiftTemplates(): Promise<TemplateRow[]> {
  const rows = await prisma.shiftTemplate.findMany({
    orderBy: [{ order: 'asc' }, { label: 'asc' }],
    // Chronologisch binnen het sjabloon: `order` wordt bij elke opslag op die
    // volgorde gezet, en `startOffsetMinutes` vangt een rij op die daarbuiten
    // ontstond (de seed, of een handmatige ingreep).
    include: { shifts: { orderBy: [{ order: 'asc' }, { startOffsetMinutes: 'asc' }] } },
  });
  if (rows.length === 0) return BUILTIN_SHIFT_TEMPLATES.map(fromBuiltin);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    note: row.note,
    builtIn: row.builtIn,
    eventName: row.eventName,
    location: row.location,
    post: row.post,
    timeOfDay: row.timeOfDay,
    shifts: row.shifts.map((entry) => ({
      id: entry.id,
      name: entry.name,
      startOffsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      maxParticipants: entry.maxParticipants,
      reward: entry.reward,
      description: entry.description,
      instructions: entry.instructions,
      location: entry.location,
      ownPost: entry.ownPost,
      post: entry.post,
      openToInternationals: entry.openToInternationals,
      enabled: entry.enabled,
    })),
  }));
}

/** Eén sjabloon op zijn natuurlijke sleutel, of null. */
export async function getShiftTemplate(slug: string): Promise<TemplateRow | null> {
  const all = await listShiftTemplates();
  return all.find((template) => template.slug === slug) ?? null;
}

/**
 * De posten waaronder het Theokot-sjabloon zijn shiften zet. THEOKOT staat er
 * altijd bij, zodat een sjabloon zonder post niet elke shift zonder post als
 * "Theokot" laat tellen.
 *
 * Hiermee herkennen de verkoopweek en de Theokot-tijdlijn de shiften die niet
 * door een verkoopweek gezet zijn (met de hand, of een opkuis), en die dus geen
 * koppeling aan een verkoopdag hebben.
 */
export function theokotShiftPosts(template: Pick<ShiftTemplate, 'post' | 'shifts'> | null): string[] {
  const posts = new Set<string>(['THEOKOT']);
  if (template?.post) posts.add(template.post);
  for (const entry of template?.shifts ?? []) {
    if (entry.ownPost && entry.post) posts.add(entry.post);
  }
  return [...posts];
}

/** Prisma-filter op die posten, hoofdletterongevoelig zoals de tijdlijn. */
export function theokotPostFilter(posts: string[]) {
  return posts.map((post) => ({ post: { equals: post, mode: 'insensitive' as const } }));
}
