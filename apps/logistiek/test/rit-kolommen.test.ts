import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

/**
 * De klem op de kolommen van een rit.
 *
 * Een nieuwe kolom op `UitleenTransportBooking` verandert niets aan de ritten
 * die er al staan: die zijn afgesproken onder de regels van toen. Wat dat per
 * soort kolom betekent, staat in docs/uitleendienst.md, "Een veld toevoegen aan
 * een rit". Deze test zorgt dat die beslissing genomen wórdt in plaats van
 * onthouden: voeg je een kolom toe zonder ze hieronder te classificeren, dan
 * faalt dit bestand.
 *
 * Hetzelfde idioom als de MCP-policy (zie CLAUDE.md): de check faalt bij het
 * toevoegen, niet bij het gebruiken.
 *
 * **Uit de DMMF en niet uit `information_schema`**, want dan is er geen database
 * nodig. Zo draait dit mee in `npm run verify` en dus in de pre-push hook,
 * in plaats van enkel in de ene CI-job die een Postgres-service heeft. Precies
 * die vertraging is wat we hier wegnemen.
 */

/**
 * Wat een kolom betekent voor een rit die er al stond.
 *
 * - `verplicht`  NOT NULL zonder default: staat op elke rit, ook de oudste.
 * - `default`    NOT NULL met een default. Een bestaande rij kreeg die default
 *                bij de migratie. Controleer of dat voor haar klopt; is het
 *                antwoord nee, dan hoort er een backfill in dezelfde migratie.
 * - `nullable`   Mag leeg zijn. Leeg betekent "niet gevraagd", nooit "nee".
 * - `snapshot`   Vastgelegd bij het aanmaken en nooit herrekend.
 * - `systeem`    Door Prisma of Postgres beheerd.
 */
type Beslissing = 'verplicht' | 'default' | 'nullable' | 'snapshot' | 'systeem';

const RIT_KOLOMMEN: Record<string, Beslissing> = {
  id: 'systeem',
  createdAt: 'systeem',
  updatedAt: 'systeem',

  userId: 'verplicht',
  vehicleId: 'verplicht',
  startAt: 'verplicht',
  endAt: 'verplicht',
  purpose: 'verplicht',

  status: 'default',
  requesterType: 'default',
  // Kreeg `DEFAULT false`, en dat was voor elke bestaande rit fout: ook de
  // ritten die het team zelf intekende werden zo onverwijderbaar. De migratie
  // 20260911100000 reconstrueert de waarde uit de auditlog. Het voorbeeld
  // waarom deze kolom een beslissing vraagt en geen default.
  plannedByTeam: 'default',

  // Het tarief van het moment van aanvragen. Een tariefwijziging raakt geen
  // enkele bestaande rit, en dat is de bedoeling.
  pricingMode: 'snapshot',
  rateCents: 'snapshot',

  groupId: 'nullable',
  requesterName: 'nullable',
  eventId: 'nullable',
  eventName: 'nullable',
  reservationId: 'nullable',
  // Ronde 3. Geen backfill: van een oude rit weet niemand nog wat er mee moest.
  cargoNote: 'nullable',
  pickupAddress: 'nullable',
  destination: 'nullable',
  // Van vóór V2. Blijven staan voor de historiek; nieuwe bijrijders zijn rijen
  // in UitleenTransportHelper.
  helpersNote: 'nullable',
  helpersPhone: 'nullable',
  contactPhone: 'nullable',
  tripGroupId: 'nullable',
  tripLeg: 'nullable',
  driverId: 'nullable',
  // 20260917160000, bewust zonder backfill: er is geen bron waaruit je kan
  // afleiden aan welke post een rit van vorig jaar doorgegeven zou zijn.
  // Gevolg: tripsForGroups bereikt zo'n rit enkel via zijn tweede tak.
  assignedGroupId: 'nullable',
  kilometers: 'nullable',
  priceCents: 'nullable',
  paymentMode: 'nullable',
  paidOfflineAt: 'nullable',
  memberNote: 'nullable',
  adminNote: 'nullable',
  notifyEmail: 'nullable',
  decidedAt: 'nullable',
  decidedById: 'nullable',
  completedAt: 'nullable',
  completedById: 'nullable',
  requesterSeenAt: 'nullable',
  teamNotifiedAt: 'nullable',
};

/**
 * `UitleenTransportHelper` staat hier omdat "een nieuwe tabel" de andere helft
 * van diezelfde beslissing is: bestaande ritten krijgen er nul rijen in. Komt
 * er een kolom bij, dan geldt dezelfde vraag voor de bijrijders die er al zijn.
 */
const BIJRIJDER_KOLOMMEN: Record<string, Beslissing> = {
  id: 'systeem',
  createdAt: 'systeem',
  transportBookingId: 'verplicht',
  name: 'verplicht',
  phone: 'nullable',
  addedById: 'nullable',
};

/**
 * Elk model dat bij een rit hoort, met zijn kolommenlijst.
 *
 * Dit bestaat om het gat te dichten dat de twee lijsten hierboven openlieten:
 * ze vangen een nieuwe **kolom**, maar een compleet nieuwe **tabel** naast de
 * rit zag niemand. En dat is precies de soort waarvan bestaande ritten nul
 * rijen krijgen, dus de soort waarvoor de vraag "wat betekent dit voor een rit
 * van vorig jaar?" het hardst nodig is.
 */
const RIT_MODELLEN: Record<string, { kolommen: Record<string, Beslissing>; doc: string }> = {
  UitleenTransportBooking: { kolommen: RIT_KOLOMMEN, doc: 'RIT_KOLOMMEN' },
  UitleenTransportHelper: { kolommen: BIJRIJDER_KOLOMMEN, doc: 'BIJRIJDER_KOLOMMEN' },
};

type Kolom = { name: string; isRequired: boolean; hasDefault: boolean; isUpdatedAt: boolean };

function kolommenVan(model: string): Kolom[] {
  const dmmf = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!dmmf) throw new Error(`Model ${model} bestaat niet meer in het schema.`);
  return (
    dmmf.fields
      // Relatievelden laten we buiten beschouwing: die dragen geen waarde op de
      // rij zelf, de bijbehorende scalar (`driverId`) doet dat.
      .filter((f) => !f.relationName)
      .map((f) => ({
        name: f.name,
        isRequired: f.isRequired,
        hasDefault: Boolean(f.hasDefaultValue),
        isUpdatedAt: Boolean(f.isUpdatedAt),
      }))
  );
}

function controleer(model: string, verwacht: Record<string, Beslissing>, doc: string) {
  const kolommen = kolommenVan(model);

  const nieuw = kolommen.filter((k) => !(k.name in verwacht)).map((k) => k.name);
  expect(
    nieuw,
    `Nieuwe kolom(men) op ${model}: ${nieuw.join(', ')}.\n` +
      `Lees "Een veld toevoegen aan een rit" in docs/uitleendienst.md, beslis wat ` +
      `dit betekent voor een rit van vorig jaar, en zet de kolom in ${doc} met ` +
      `die beslissing erbij. Klopt de default niet voor bestaande rijen, dan ` +
      `hoort er een backfill in dezelfde migratie.`
  ).toEqual([]);

  const namen = new Set(kolommen.map((k) => k.name));
  const verdwenen = Object.keys(verwacht).filter((naam) => !namen.has(naam));
  expect(
    verdwenen,
    `${doc} noemt kolom(men) die niet meer op ${model} staan: ${verdwenen.join(', ')}. ` + `Haal ze uit de lijst.`
  ).toEqual([]);

  return kolommen;
}

describe('de kolommen van een rit dragen een beslissing', () => {
  /**
   * Een nieuwe tabel naast de rit is net zo goed een nieuwe feature op een rit:
   * bestaande ritten krijgen er nul rijen in, en of dat klopt, is een vraag en
   * geen vanzelfsprekendheid. `UitleenTransportHelper` was precies dat geval,
   * en daar moesten `helpersNote`/`helpersPhone` voor bestaande ritten blijven
   * staan.
   */
  it('kent elk model dat bij een rit hoort', () => {
    const inSchema = Prisma.dmmf.datamodel.models
      .map((model) => model.name)
      .filter((name) => name.startsWith('UitleenTransport'));

    const onbekend = inSchema.filter((name) => !(name in RIT_MODELLEN));
    expect(
      onbekend,
      `Nieuw model naast de rit: ${onbekend.join(', ')}.\n` +
        `Bestaande ritten krijgen hier nul rijen in. Lees "Een veld toevoegen aan ` +
        `een rit" in docs/uitleendienst.md, vraag na wat dat voor een rit van ` +
        `vorig jaar hoort te betekenen, en zet het model in RIT_MODELLEN.`
    ).toEqual([]);

    const verdwenen = Object.keys(RIT_MODELLEN).filter((name) => !inSchema.includes(name));
    expect(verdwenen, `RIT_MODELLEN noemt modellen die niet meer bestaan.`).toEqual([]);
  });

  it.each(Object.entries(RIT_MODELLEN))('kent elke kolom van %s', (model, { kolommen, doc }) => {
    controleer(model, kolommen, doc);
  });

  /**
   * De namen kloppen laten zijn is de helft. Wordt `cargoNote` morgen NOT NULL,
   * dan is de beslissing "nullable" onwaar geworden zonder dat er een kolom
   * bijkwam, en dat is precies een wijziging die bestaande ritten wél raakt.
   */
  it.each(Object.entries(RIT_MODELLEN))('%s: de beslissing klopt met het schema', (model, { kolommen: verwacht }) => {
    for (const kolom of kolommenVan(model)) {
      const beslissing = verwacht[kolom.name];
      if (!beslissing) continue; // de test hierboven meldt dit al gerichter.

      const uitleg = `${model}.${kolom.name} staat als "${beslissing}"`;

      if (beslissing === 'nullable') {
        expect(kolom.isRequired, `${uitleg} maar is NOT NULL geworden.`).toBe(false);
      }

      if (beslissing === 'verplicht') {
        expect(kolom.isRequired, `${uitleg} maar mag nu leeg zijn.`).toBe(true);
        expect(
          kolom.hasDefault,
          `${uitleg} maar kreeg een default. Dat is de soort "default", en dan ` +
            `moet je nakijken of die default voor bestaande ritten klopt.`
        ).toBe(false);
      }

      if (beslissing === 'default') {
        expect(kolom.isRequired, `${uitleg} maar mag nu leeg zijn.`).toBe(true);
        expect(
          kolom.hasDefault,
          `${uitleg} maar heeft geen default meer. Zonder default faalt de ` + `migratie op een niet-lege tabel.`
        ).toBe(true);
      }

      if (beslissing === 'snapshot') {
        expect(
          kolom.isRequired,
          `${uitleg} maar mag nu leeg zijn. Een snapshot wordt bij het aanmaken ` +
            `vastgelegd en hoort er dus altijd te staan.`
        ).toBe(true);
      }
    }
  });
});
