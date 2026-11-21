'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { isVehiclePattern } from '@/lib/driver-colors';
import { isVehicleIcon } from '@/lib/vehicle-icon';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import {
  isEmailish,
  isTripHandoverMode,
  NOTIFY_KINDS,
  parseNotifyEmails,
  type TripHandoverMode,
} from '@/lib/uitleen';
import type { ActionResult } from '@/app/actions/uitleen';
import { parseEuroToCents, revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const PRICING_MODES = ['FREE', 'PER_HOUR', 'PER_KM', 'FLAT'] as const;
type PricingMode = (typeof PRICING_MODES)[number];

export async function saveVehicleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const id = String(formData.get('id') ?? '').trim();
  const nameNl = String(formData.get('nameNl') ?? '').trim();
  const nameEn = String(formData.get('nameEn') ?? '').trim() || nameNl;
  const description = String(formData.get('description') ?? '').trim();
  const modeRaw = String(formData.get('pricingMode') ?? 'FREE').trim();
  const pricingMode: PricingMode = PRICING_MODES.includes(modeRaw as PricingMode)
    ? (modeRaw as PricingMode)
    : 'FREE';
  const rateCents = parseEuroToCents(formData.get('rate'));
  const patternRaw = String(formData.get('pattern') ?? '').trim();
  const iconRaw = String(formData.get('icon') ?? '').trim();
  if (!nameNl) return saveError('NAME_REQUIRED');
  if (rateCents === null) return saveError('AMOUNT_INVALID');

  const data = {
    nameNl,
    nameEn,
    description: description || null,
    pricingMode,
    rateCents: pricingMode === 'FREE' ? 0 : rateCents,
    needsVanDriver: String(formData.get('needsVanDriver') ?? '') === 'on',
    needsDriver: String(formData.get('needsDriver') ?? '') === 'on',
    // Enkel het team plant dit voertuig in wanneer het uit staat (F6.21). De poort
    // zelf staat in `buildTransportBookings`, niet in het formulier.
    requestableByMembers: String(formData.get('requestableByMembers') ?? '') === 'on',
    // "Geen arcering" bewaren we als null en niet als de string 'none': in de
    // databank is dat dezelfde toestand, en twee schrijfwijzen voor hetzelfde
    // lopen vroeg of laat uiteen in een query.
    pattern: isVehiclePattern(patternRaw) && patternRaw !== 'none' ? patternRaw : null,
    // Leeg is hier "automatisch", en dat bewaren we als null: het icoon volgt dan
    // de naam van het voertuig, zoals het deed voor deze keuze bestond.
    icon: isVehicleIcon(iconRaw) ? iconRaw : null,
  };
  if (id) {
    await prisma.uitleenVehicle.update({ where: { id }, data });
  } else {
    const base = nameNl.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'voertuig';
    let code = base;
    for (let i = 2; await prisma.uitleenVehicle.findUnique({ where: { code } }); i += 1) {
      code = `${base}-${i}`;
    }
    const count = await prisma.uitleenVehicle.count();
    await prisma.uitleenVehicle.create({ data: { ...data, code, sortIndex: count } });
  }

  revalidateBeheer();
  // De arcering staat ook op het publieke bezettingsoverzicht.
  revalidatePath('/vervoer/bezetting');
  return saveOk();
}

export async function setVehicleActiveAction(vehicleId: string, active: boolean): Promise<ActionResult> {
  await requireManage();
  await prisma.uitleenVehicle.update({ where: { id: vehicleId }, data: { active } });
  revalidateBeheer();
  return { ok: true, message: active ? 'Voertuig terug beschikbaar.' : 'Voertuig gedeactiveerd.' };
}

const LOGISTIEK_SETTINGS_KEY = 'logistiek.settings';

export async function saveLogistiekSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();
  const showRentPrices = String(formData.get('showRentPrices') ?? '') === 'on';
  const externalRequestsOpen = String(formData.get('externalRequestsOpen') ?? '') === 'on';
  const lastMinuteDays = Number.parseInt(String(formData.get('lastMinuteDays') ?? ''), 10);
  // Een bovengrens omdat "last minute" anders alles wordt en de badge niets meer zegt.
  if (!Number.isFinite(lastMinuteDays) || lastMinuteDays < 1 || lastMinuteDays > 90) {
    return saveError('LAST_MINUTE_INVALID');
  }
  // Per soort een lijst adressen (M1). Komma-gescheiden in het formulier, want
  // dat is hoe het meelezende adres op een aanvraag er ook uitziet; dezelfde
  // parser, dus dezelfde regels over wat een adres is.
  const notifyEmails: Record<string, string[]> = {};
  for (const kind of NOTIFY_KINDS) {
    const raw = String(formData.get(`notify-${kind}`) ?? '');
    const parsed = parseNotifyEmails(raw);
    if (parsed === null) return saveError('NOTIFY_EMAIL_INVALID');
    notifyEmails[kind] = parsed;
  }

  // Wie er verwittigd wordt bij het doorgeven van een rit aan een post (F4.8b).
  // Een onbekende waarde wordt "niemand" en niet een foutmelding: dat is de
  // standaard, en het is de enige keuze die niemand ongevraagd mailt.
  const handoverMode = String(formData.get('tripHandoverMode') ?? '');
  const mode: TripHandoverMode = isTripHandoverMode(handoverMode) ? handoverMode : 'NIEMAND';
  // Het adres blijft bewaard wanneer je tijdelijk op iets anders staat: anders
  // moet je het opnieuw intikken zodra je terugschakelt. Enkel wanneer het echt
  // gebruikt wordt, moet het er ook zijn.
  const handoverEmail = String(formData.get('tripHandoverEmail') ?? '').trim();
  if (mode === 'ADRES' && !isEmailish(handoverEmail)) return saveError('HANDOVER_EMAIL_INVALID');
  const tripHandover = { mode, email: handoverEmail };

  const value = {
    showRentPrices,
    lastMinuteDays,
    externalRequestsOpen,
    notifyEmails,
    tripHandover,
  };
  await prisma.setting.upsert({
    where: { key: LOGISTIEK_SETTINGS_KEY },
    update: { value },
    create: { key: LOGISTIEK_SETTINGS_KEY, value },
  });
  revalidateBeheer();
  // Ook de ledenkant: de waarschuwing bij het aanvragen komt uit dezelfde
  // instelling, en `externalRequestsOpen` bepaalt of daar überhaupt een formulier
  // staat. De hub hoort erbij, want die zegt het als eerste.
  revalidatePath('/');
  revalidatePath('/materiaal');
  revalidatePath('/flesserke');
  revalidatePath('/vervoer');
  return saveOk();
}
