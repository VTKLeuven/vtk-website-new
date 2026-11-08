/*
 * Een budget dat een post op de site opstelt, in plaats van een rekenblad in
 * de map Budgetten op de gedeelde drive. Zie docs/bestuursorgaan.md ("Budgetten
 * op de site") en docs/design-decisions.md ("Bestuursorgaan: budgetten op de
 * site").
 *
 * De inhoud is één document (`BoBudget.content`): parameters, secties en
 * regels. De site rekent alles zelf uit (`calc.ts`), dus er staat nergens een
 * som, een BTW-formule of een totaal in dat kan afwijken van de regels.
 *
 * Bedragen staan als euro met decimalen, zoals ze ingetypt worden ("9,59");
 * enkel de totalen die de lijst toont, gaan als centen naar de databank.
 */

export const BUDGET_TEMPLATES = ['standaard', 'cantus'] as const;
export type BudgetTemplate = (typeof BUDGET_TEMPLATES)[number];

/** Is de ingetypte prijs incl. of excl. BTW? */
export type VatBasis = 'incl' | 'excl';

/** De BTW-tarieven die een product in een winkel kan hebben. */
export const PRODUCT_VAT_RATES = [0.06, 0.21, 0] as const;

/** Wat een post als tarief kan krijgen in de instellingen. */
export const POST_VAT_RATES = [0, 0.06, 0.105, 0.21] as const;

export const SOURCE_TYPES = ['webshop', 'collectgo', 'offerte', 'flesserke', 'afspraak', 'locatie'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const LOCATION_FIELDS = ['zaal', 'vaten', 'licht', 'stopsel', 'sangria'] as const;
export type LocationField = (typeof LOCATION_FIELDS)[number];

/**
 * Waar een prijs vandaan komt. Een link alleen bleef in de bladen bij ruim een
 * derde van de regels leeg, vaak terecht (huur, offerte, servicekost); daarom
 * kiest elke regel een soort bron, en vraagt een afspraak een reden.
 */
export type Source = {
  type: SourceType;
  /** Webshop of Collect&Go: het product. Offerte: waar ze staat. */
  url?: string;
  /** Afspraak: de reden. Offerte: welke offerte. */
  note?: string;
  /** Locatie: welke prijs van de zaal. */
  field?: LocationField;
};

export type CostRow = {
  id: string;
  name: string;
  /** Vaste regel: het aantal. */
  qty?: number;
  /** Variabele regel: het aandeel in de verdeling van de sectie, 0 tot 1. */
  pct?: number;
  /**
   * Variabele regel die krijgt wat er van de verdeling overblijft, zonder
   * aankoop: bij een cantus betaalt wie geen bier of sangria drinkt de
   * waterprijs. In het blad zat dat verstopt in de inkomformule.
   */
  rest?: boolean;
  /**
   * Variabele regel die het percentage van een andere regel deelt: Fruitsap
   * en Cava zijn samen één Mimosa en tellen één keer in de verdeling.
   */
  mixOf?: string;
  /** Variabele regel: hoeveel per persoon (adjes, glazen); anders die van de sectie. */
  perPerson?: number;
  /** Variabele regel: hoeveel er in één eenheid gaat (175 adjes per vat). */
  perUnit?: number;
  /** "vat", "fles", "bak". */
  unit?: string;
  /** Prijs per stuk of per eenheid, zoals ingetypt. */
  price?: number;
  basis?: VatBasis | null;
  /** Het BTW-tarief van het product zelf, om een winkelprijs om te rekenen. */
  productVat?: number;
  source?: Source | null;
  /** Bij een prijs uit de locatie: een ander bedrag, met reden. */
  override?: number | null;
  overrideReason?: string;
  /** Een bedrag zonder berekening ("schatting op basis van vorig jaar"). */
  forfait?: { amount: number; reason: string } | null;
  /** Hoeveel eenheden uit de voorraad van Flesserke komen. */
  flesserke?: number | null;
  /** Wanneer iemand de prijs laatst nakeek (yyyy-mm-dd). */
  checkedAt?: string | null;
  note?: string;
  /** De Collect&Go-servicekost: één regel per bestelling, de prijs komt uit de instellingen. */
  service?: boolean;
  /** De laatste keer dat de site de prijs bij Collect&Go opvroeg. */
  lastCheck?: PriceCheck | null;
};

/**
 * Wat collectandgo.be zei toen de site de prijs opvroeg. `ok` en `changed`
 * vergelijken met de prijs die toen in de regel stond; `failed` is geen
 * antwoord (geblokkeerd, time-out), en dan bevestigt een mens de prijs.
 */
export type PriceCheck = {
  /** ISO-tijdstip van de controle. */
  at: string;
  status: 'ok' | 'changed' | 'notfound' | 'failed';
  /** De prijs op de site, incl. BTW. */
  price?: number;
  /** De naam op de site, om te zien of de link het juiste product is. */
  name?: string;
  reason?: string;
};

export const AUDIENCES = ['leden', 'nietleden', 'ereleden', 'genodigden'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type IncomeCount =
  | { type: 'manual'; qty: number }
  /** Een doelgroep van een cantus, uit de parameters. */
  | { type: 'audience'; audience: Audience }
  /** Zoveel als er van een variabele regel gedronken wordt (naar beneden afgerond). */
  | { type: 'consumption'; rowId: string }
  /** Zoveel als er van een variabele regel gekocht wordt (de eenheden). */
  | { type: 'units'; rowId: string };

export type IncomePrice =
  | { type: 'manual'; value: number }
  /**
   * Een prijs die afhangt van wat iemand drinkt: wie bier of sangria drinkt,
   * betaalt `main`; de rest van de verdeling betaalt `rest` (de waterprijs).
   */
  | { type: 'drinks'; sectionId: string; main: number; rest: number };

export type IncomeRow = {
  id: string;
  name: string;
  count: IncomeCount;
  price: IncomePrice;
  note?: string;
};

export type CostSection = {
  id: string;
  name: string;
  type: 'fixed' | 'variable';
  /** Variabel: welk deel van de deelnemers deze sectie betreft (alcohol 70 %). */
  share?: number;
  /** Variabel: hoeveel per persoon, tenzij een regel iets anders zegt. */
  perPerson?: number;
  /** Variabel: verdelen de regels samen 100 %? Zo niet, telt elke regel voor iedereen (eten). */
  distribute?: boolean;
  rows: CostRow[];
};

export type IncomeSection = {
  id: string;
  name: string;
  type: 'income';
  rows: IncomeRow[];
};

export type Section = CostSection | IncomeSection;

export type BudgetParams = {
  /** Aantal deelnemers. */
  persons: number;
  /** Cantus: genodigden, uit de praesesbegroting. */
  guests?: number;
  /** Cantus: aandeel leden (ereleden inbegrepen), 0 tot 1. */
  memberShare?: number;
  /** Cantus: aandeel ereleden, 0 tot 1. */
  honoraryShare?: number;
};

export type BudgetContent = {
  version: 1;
  params: BudgetParams;
  info: { date: string; location: string; concept: string };
  /** Het bedrag uit de begroting van het werkingsjaar; positief is winst. */
  begroting: number | null;
  /** Een ander tarief dan dat van de post, met reden. */
  vat: { rate: number; reason: string } | null;
  allocation: { org: string; share: number }[];
  sections: Section[];
};

export type BudgetLocation = {
  name: string;
  capacity: number | null;
  zaal: number | null;
  vaten: number | null;
  licht: number | null;
  stopsel: number | null;
  sangria: number | null;
  /** Zijn de prijzen van deze zaal incl. of excl. BTW? Null = niet gekozen. */
  basis: VatBasis | null;
  note: string;
};

/** Wat Beheer instelt (`Setting` "bestuursorgaan.budgets"). */
export type BudgetSettings = {
  /** Het BTW-tarief per post (`g:<groupId>` of een vak); ontbreekt = nog in te vullen. */
  vatByPost: Record<string, number>;
  /** De Collect&Go-servicekost per bestelling, incl. 21 %. */
  serviceCost: number;
  /** Tellen regels uit de voorraad van Flesserke mee als kost? */
  flesserkeCounts: boolean;
  /** Zonder sangriaprijs bij de zaal rekent het cantusblad met de Collect&Go-sangria. */
  sangriaFallback: number;
  locations: BudgetLocation[];
  /**
   * De posten die budgetten op de site mogen proberen. Groep 5 mag het altijd.
   * Het BO werkt nog met de rekenbladen in Drive; dit is een proef naast die
   * werking, geen vervanging (zie docs/design-decisions.md).
   */
  pilotPostKeys: string[];
  /** Vraagt de site prijzen op bij collectandgo.be? Uit als Colruyt het niet wil. */
  collectGoLive: boolean;
};

export const DEFAULT_SETTINGS: BudgetSettings = {
  vatByPost: {},
  serviceCost: 6.95,
  flesserkeCounts: true,
  sangriaFallback: 1.95,
  locations: [],
  pilotPostKeys: [],
  collectGoLive: true,
};
