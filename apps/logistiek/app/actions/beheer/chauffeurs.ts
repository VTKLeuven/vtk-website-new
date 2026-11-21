'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';
import { requireManage } from '@/lib/session';
import {
  isCustomDriverColor,
  isDriverColorIndex,
  NEW_DRIVER_COLOR_INDEX,
  serializeCustomColor,
} from '@/lib/driver-colors';
import { normaliseBelgianPhone } from '@/lib/vcard';
import { saveError, saveOk, type SaveState } from '@vtk/ui/save-state';
import { searchDriverCandidates, type DriverCandidate } from '@/lib/uitleen-server';
import type { ActionResult } from '@/app/actions/uitleen';
import { revalidateBeheer } from './shared';

// ---------------------------------------------------------------------------
// Chauffeurs
// ---------------------------------------------------------------------------

/**
 * Lid zoeken voor de chauffeurspicker. Een server action i.p.v. een API-route:
 * de picker leeft in het beheer, dus `requireManage` is de enige poort die we
 * nodig hebben (en we moeten geen aparte route beveiligen).
 */
export async function searchDriverCandidatesAction(query: string): Promise<DriverCandidate[]> {
  await requireManage();
  return searchDriverCandidates(query);
}

/**
 * De regels achter "deze persoon wordt chauffeur", gedeeld door de picker
 * bovenaan en de knop per post (F4.10). Geeft een foutcode terug, of `null`
 * wanneer de rij er staat.
 *
 * Bewust één functie: de twee wegen komen op hetzelfde neer, en een tweede
 * kopie van deze vier controles loopt vroeg of laat uiteen met deze.
 */
async function createDriverRow(
  userId: string,
  note: string | null,
  addedById: string
): Promise<'NOT_FOUND' | 'INACTIVE' | 'IN_POST' | 'ALREADY_DRIVER' | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, active: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return 'NOT_FOUND';
  if (!user.active) return 'INACTIVE';

  // Al chauffeur via de post: dan voegt een rij hier niets toe, en de melding
  // legt uit waarom de naam toch al in de keuzelijst staat.
  const inPost = await prisma.groupMembership.count({
    where: { userId, year: currentWorkingYear(), group: { code: 'LOGISTIEK' } },
  });
  if (inPost > 0) return 'IN_POST';

  const existing = await prisma.uitleenDriver.count({ where: { userId } });
  if (existing > 0) return 'ALREADY_DRIVER';

  // Een toegevoegde chauffeur start op Salie (F6.7) en niet op de hash: zo valt hij
  // niet toevallig samen met iemand die zijn kleur al koos, en zie je aan Salie dat
  // niemand er nog een koos. Wie via de post chauffeur is, heeft geen rij en houdt
  // zijn hashkleur.
  await prisma.uitleenDriver.create({
    data: { userId, note, addedById, colorIndex: NEW_DRIVER_COLOR_INDEX },
  });
  revalidateBeheer();
  return null;
}

export async function addDriverAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireManage();

  const userId = String(formData.get('userId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!userId) return saveError('USER_REQUIRED');

  const code = await createDriverRow(userId, note || null, session.user.id);
  return code ? saveError(code) : saveOk();
}

/**
 * Een lid van een post of werkgroep chauffeur maken, vanaf de lijst per post
 * (F4.10).
 *
 * Geen notitie: je klikt hier op een naam die al op het scherm staat, er valt
 * niets te zoeken en niets toe te lichten. De meldingen staan hier in volle
 * zinnen in plaats van als code, want deze knop hangt niet aan een `SaveForm`
 * met zijn `errorMessages`.
 */
export async function addDriverFromGroupAction(userId: string): Promise<ActionResult> {
  const session = await requireManage();

  const code = await createDriverRow(userId, null, session.user.id);
  if (code === 'NOT_FOUND') return { ok: false, error: 'Dit lid bestaat niet (meer) op vtk.be.' };
  if (code === 'INACTIVE') {
    return { ok: false, error: 'Dit lid is gedeactiveerd op vtk.be en kan geen chauffeur zijn.' };
  }
  if (code === 'IN_POST') {
    return { ok: false, error: 'Dit lid zit in de post Logistiek en is daardoor al chauffeur.' };
  }
  if (code === 'ALREADY_DRIVER') return { ok: false, error: 'Dit lid staat al in de chauffeurslijst.' };
  // Zonder melding: de knop weet wiens naam het is en zet die in de toast.
  return { ok: true };
}

export async function saveDriverNoteAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const driverRowId = String(formData.get('driverRowId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!driverRowId) return saveError('NOT_FOUND');

  const updated = await prisma.uitleenDriver.updateMany({
    where: { id: driverRowId },
    data: { note: note || null },
  });
  if (updated.count === 0) return saveError('NOT_FOUND');

  revalidateBeheer();
  return saveOk();
}

/**
 * Het nummer waarop een chauffeur bereikbaar is, vastleggen.
 *
 * Op `userId` en met een upsert, net als de karvlag: een lid van de post
 * Logistiek heeft pas een rij zodra iemand er iets aan instelt.
 *
 * Wat het scherm toont zolang dit leeg is, is het gsm-nummer van het profiel van
 * deze persoon, of anders het nummer dat hij ooit zelf bij een aanvraag opgaf
 * (`driverPhones`). Opslaan zet dat vast; leeg maken laat het weer aan die twee
 * over, en dat is iets anders dan "heeft geen nummer". Is er ook daar niets te
 * vinden, dan blijft het veld gewoon leeg, zoals het hoort.
 */
export async function saveDriverPhoneAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireManage();

  const userId = String(formData.get('userId') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim().slice(0, 60);
  if (!userId) return saveError('NOT_FOUND');

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return saveError('NOT_FOUND');

  await prisma.uitleenDriver.upsert({
    where: { userId },
    update: { phone: phone || null },
    create: { userId, phone: phone || null },
  });

  revalidateBeheer();
  return saveOk();
}

/**
 * De aangevinkte nummers uit de gedeelde gsm-lijst wegschrijven (F4.3).
 *
 * **Het bestand komt hier niet aan.** Het scherm leest de `.vcf` in de browser,
 * koppelt daar op naam en stuurt enkel de rijen die aangevinkt staan, als
 * `<userId>|<nummer>`. Een lijst met vierennegentig namen en nummers reist dus
 * niet over de lijn en belandt in geen enkele log; wat hier binnenkomt, is
 * precies wat iemand gezien en goedgekeurd heeft.
 *
 * **Het nummer wordt hier opnieuw genormaliseerd.** Niet omdat de client niet te
 * vertrouwen zou zijn (wie dit scherm mag openen, mag het nummer er evengoed met
 * de hand intikken), maar omdat één functie de vorm bepaalt: zo staat er in deze
 * kolom altijd `0470 12 34 56`, langs welke weg ze ook gevuld wordt.
 *
 * Schrijft `UitleenDriver.phone`, de bron `TEAM`, die binnen `driverPhones` al
 * wint van het profielnummer en van wat iemand ooit bij een aanvraag opgaf.
 */
export async function importDriverPhonesAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requireManage();

  const picks = formData.getAll('pick').map((value) => String(value));
  if (picks.length === 0) return saveError('NOTHING_PICKED');

  // Op gebruiker en niet als lijst: twee vinkjes voor dezelfde chauffeur zijn
  // geen twee schrijfbeurten, en dan klopt het aantal in de melding ook.
  const byUser = new Map<string, string>();
  for (const pick of picks) {
    const at = pick.indexOf('|');
    if (at === -1) return saveError('BAD_PICK');
    const userId = pick.slice(0, at).trim();
    const phone = normaliseBelgianPhone(pick.slice(at + 1));
    if (!userId || !phone.ok) return saveError('BAD_PICK');
    byUser.set(userId, phone.phone);
  }

  const known = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()] }, active: true, deletedAt: null },
    select: { id: true },
  });
  if (known.length !== byUser.size) return saveError('NOT_FOUND');

  for (const [userId, phone] of byUser) {
    await prisma.uitleenDriver.upsert({
      where: { userId },
      update: { phone },
      create: { userId, phone },
    });
  }

  revalidateBeheer();
  return saveOk(`${byUser.size} nummer${byUser.size === 1 ? '' : 's'} opgeslagen.`);
}

/**
 * Zet of wist de karvlag van een chauffeur.
 *
 * Werkt op `userId` en niet op de rij, want iemand uit de post Logistiek heeft
 * pas een `UitleenDriver`-rij zodra je hier iets aanvinkt; die rij wordt dan
 * aangemaakt. Gevolg om te kennen: verlaat die persoon later de post, dan blijft
 * hij via die rij in de chauffeurslijst staan (en verschijnt hij onder "zelf
 * toegevoegd", waar je hem kan weghalen).
 */
export async function setDriverVanAction(
  userId: string,
  canDriveVan: boolean
): Promise<ActionResult> {
  await requireManage();

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { ok: false, error: 'Dit lid bestaat niet (meer) op vtk.be.' };

  await prisma.uitleenDriver.upsert({
    where: { userId },
    update: { canDriveVan },
    create: { userId, canDriveVan },
  });

  revalidateBeheer();
  return {
    ok: true,
    message: canDriveVan ? 'Rijdt ook met de kar.' : 'Rijdt niet met de kar.',
  };
}

/**
 * De kleur van een chauffeur in de transportplanning (K1).
 *
 * `null` zet hem terug op de kleur die uit zijn id volgt; dat is de standaard en
 * niet "geen kleur", want een blok zonder vulling is niet te onderscheiden van
 * een blok zonder chauffeur.
 *
 * Een paletkleur en een eigen kleur sluiten elkaar uit: wie een nummer kiest,
 * wist de eigen kleur, en `setDriverCustomColorAction` doet het omgekeerde.
 * Anders blijft er na "Standaard" een eigen kleur in de rij staan die de hash
 * blijft overschrijven.
 *
 * Upsert, zoals `setDriverVanAction`: een lid van de post Logistiek heeft pas een
 * rij zodra iemand er iets aan instelt.
 */
export async function setDriverColorAction(
  userId: string,
  colorIndex: number | null
): Promise<ActionResult> {
  await requireManage();

  if (colorIndex !== null && !isDriverColorIndex(colorIndex)) {
    return { ok: false, error: 'Die kleur bestaat niet.' };
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { ok: false, error: 'Dit lid bestaat niet (meer) op vtk.be.' };

  await prisma.uitleenDriver.upsert({
    where: { userId },
    update: { colorIndex, customColor: null },
    create: { userId, colorIndex },
  });

  revalidateBeheer();
  // Ook het publieke bezettingsoverzicht draagt deze kleuren.
  revalidatePath('/vervoer/bezetting');
  return { ok: true, message: colorIndex === null ? 'Terug op de standaardkleur.' : 'Kleur opgeslagen.' };
}

/**
 * Een eigen kleur voor een chauffeur, uit de drie schuiven (tint, levendigheid,
 * kracht; zie `CustomDriverColor`).
 *
 * De server controleert de bereiken zelf: de schuiven kunnen niets anders geven,
 * maar een aanroep hoeft niet via de schuiven te komen, en een kleur buiten het
 * bereik is er een waarop de tekst in het blok niet meer leesbaar is. De
 * helderheid zelf wordt hier niet bewaard maar volgt uit de modus (`theme.css`),
 * dus een waarde die klopt, kan het scherm nooit onleesbaar maken.
 */
export async function setDriverCustomColorAction(
  userId: string,
  color: { hue: number; chroma: number; tone: number }
): Promise<ActionResult> {
  await requireManage();

  if (!isCustomDriverColor(color)) {
    return { ok: false, error: 'Die kleur kan niet: de schuiven staan buiten hun bereik.' };
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { ok: false, error: 'Dit lid bestaat niet (meer) op vtk.be.' };

  // Alleen de drie velden uit `color`, niet het object zelf: een aanroep kan er
  // meer in stoppen dan de schuiven kennen.
  const customColor = serializeCustomColor({ hue: color.hue, chroma: color.chroma, tone: color.tone });
  await prisma.uitleenDriver.upsert({
    where: { userId },
    update: { customColor, colorIndex: null },
    create: { userId, customColor },
  });

  revalidateBeheer();
  revalidatePath('/vervoer/bezetting');
  return { ok: true, message: 'Eigen kleur opgeslagen.' };
}

/**
 * Chauffeur uit de pool halen. Ritten die al aan deze persoon toegewezen zijn
 * blijven bewust staan: de rit is gereden of gepland, en de naam wissen zou de
 * historiek en de planning stukmaken. Wel verdwijnt de keuze voor nieuwe ritten,
 * en ziet de persoon "Mijn ritten" enkel nog zolang er ritten aan hangen.
 */
export async function removeDriverAction(driverRowId: string): Promise<ActionResult> {
  await requireManage();

  const deleted = await prisma.uitleenDriver.deleteMany({ where: { id: driverRowId } });
  if (deleted.count === 0) return { ok: false, error: 'Deze chauffeur staat niet (meer) in de lijst.' };

  revalidateBeheer();
  return { ok: true, message: 'Chauffeur uit de lijst gehaald.' };
}
