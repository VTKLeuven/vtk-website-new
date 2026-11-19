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

export const BUDGET_TEMPLATES = ['standaard', 'cantus', 'fakfeestje', 'sectornight'] as const;
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
  /**
   * Wanneer iemand de prijs zelf nakeek en bevestigde: een tijdstip (ISO), of
   * bij oudere budgetten enkel de dag (yyyy-mm-dd). De site zet dit nooit
   * zelf: wat zij bij een winkel nakeek, staat in `lastCheck`.
   */
  checkedAt?: string | null;
  /** Wie bevestigde. De server vult de naam in bij het bewaren (`stampConfirmations`). */
  checkedBy?: string | null;
  note?: string;
  /** De Collect&Go-servicekost: één regel per bestelling, de prijs komt uit de instellingen. */
  service?: boolean;
  /** De laatste keer dat de site de prijs bij de webshop opvroeg. */
  lastCheck?: PriceCheck | null;
  /** Een berekening per veld ("=2,79/4"); het antwoord staat in het veld zelf (`formula.ts`). */
  fx?: Partial<Record<'qty' | 'pct' | 'perPerson' | 'perUnit' | 'price', string>>;
  /** Resultaat: wat deze regel echt kostte. Null of afwezig = nog niet ingevuld. */
  result?: number | null;
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
  /** De prijs op de site, incl. BTW (bij een drukker excl., zie `basis`). */
  price?: number;
  /** Is die prijs incl. of excl. BTW? Afwezig = incl., zoals een winkelprijs. */
  basis?: VatBasis;
  /** Welke webshop antwoordde (`lib/priceCheck/shops.ts`). */
  shop?: string;
  /** De naam op de site, om te zien of de link het juiste product is. */
  name?: string;
  reason?: string;
  /**
   * Sinds wanneer de winkel dit antwoord geeft. Een nieuwe controle met
   * dezelfde uitkomst houdt dit tijdstip, zodat een prijs die iemand met de
   * hand bevestigde niet om de vier uur opnieuw als "gewijzigd" opduikt.
   */
  since?: string;
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
  /** Een berekening voor het aantal of de prijs, enkel bij een ingetypte waarde. */
  fx?: Partial<Record<'qty' | 'price', string>>;
  /** Resultaat: wat er echt binnenkwam. */
  result?: number | null;
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
  /**
   * Variabel: voor hoeveel personen deze sectie rekent, als dat niet alle
   * deelnemers zijn (enkel het praesidium eet mee, twee vertegenwoordigers
   * per bedrijf). Null of afwezig = de deelnemers van het budget.
   */
  base?: number | null;
  fx?: Partial<Record<'share' | 'perPerson' | 'base', string>>;
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
  /**
   * Eigen parameters, zoals het blok Parameters bovenaan het blad: "Aantal
   * bedrijven", "Percentage cola", "Prijs inkom". Een berekening verwijst
   * ernaar met de naam tussen haken.
   */
  extra?: BudgetParam[];
};

export type BudgetParam = {
  id: string;
  name: string;
  value: number;
  /** Hoe het getal getoond wordt; een percentage staat als 0 tot 1. */
  kind?: 'number' | 'percent' | 'money';
  fx?: string;
};

export type BudgetContent = {
  version: 1;
  params: BudgetParams;
  info: { date: string; location: string; concept: string };
  /** Het bedrag uit de begroting van het werkingsjaar; positief is winst. */
  begroting: number | null;
  /**
   * De lijn uit de begroting waar dit budget op zit (`begroting.ts`). Twee
   * budgetten met dezelfde lijn delen een potje (`pot.ts`).
   */
  begrotingRef?: { sheet: string; key: string; label: string } | null;
  /**
   * Dit budget neemt maar een deel van de lijn: er komen nog budgetten op
   * (materiaal dat door het jaar gekocht wordt). Dan is "minder dan de
   * begroting" geen nieuws en vergelijkt de site het potje als geheel.
   */
  potPart?: boolean;
  /** Wanneer de site de prijzen bij de webshops laatst zelf nakeek (ISO). */
  pricesAt?: string | null;
  /** Een ander tarief dan dat van de post, met reden. */
  vat: { rate: number; reason: string } | null;
  allocation: { org: string; share: number }[];
  sections: Section[];
  /**
   * Het resultaat van de activiteit, naast het budget. Zodra dit aan staat,
   * toont de editor de kolom Resultaat en heet de download "Resultaat".
   */
  result?: { on: boolean; note?: string } | null;
  /**
   * Overgenomen uit een rekenblad van het BO (`importSheet.ts`): welk bestand,
   * en of de regels overgenomen zijn of enkel het overzicht. Afwezig bij een
   * budget dat op de site opgesteld is.
   */
  source?: {
    kind: 'drive' | 'upload';
    name: string;
    id?: string;
    mode: 'regels' | 'overzicht';
    /** Het totaal van het blad bij het overnemen, om later te zien of iemand het budget wijzigde. */
    sheetTotal: number | null;
  } | null;
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

/**
 * Een prijs die vastligt en in elk budget terugkomt zonder link of offerte:
 * de huur van een zaal, een vat, licht en geluid. Een regel zonder bron met
 * die omschrijving en die prijs heeft daarmee een bron (`fixed.ts`).
 */
export type FixedPrice = {
  id: string;
  name: string;
  price: number;
  /** Enkel op deze locatie; leeg = overal. */
  location: string;
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
  /** Vaste prijzen die geen bron per budget vragen. */
  fixedPrices: FixedPrice[];
  /**
   * De posten die budgetten op de site mogen proberen. Groep 5 mag het altijd.
   * Het BO werkt nog met de rekenbladen in Drive; dit is een proef naast die
   * werking, geen vervanging (zie docs/design-decisions.md).
   */
  pilotPostKeys: string[];
  /** Vraagt de site prijzen op bij de webshops? Uit als een winkel het niet wil. */
  collectGoLive: boolean;
  /**
   * De postcode van de Colruyt waar de kring koopt. Colruyt geeft een prijs per
   * winkel; zonder postcode kijkt de site een link naar colruyt.be niet na.
   */
  colruytPostcode: string;
};

export const DEFAULT_SETTINGS: BudgetSettings = {
  vatByPost: {},
  serviceCost: 6.95,
  flesserkeCounts: true,
  sangriaFallback: 1.95,
  locations: [],
  fixedPrices: [],
  pilotPostKeys: [],
  collectGoLive: true,
  colruytPostcode: '',
};
