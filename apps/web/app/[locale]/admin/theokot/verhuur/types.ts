import type {
  ContractState,
  DepositChoice,
  DepositState,
  KeyState,
  RentalStatus,
  RenterType,
} from "@/lib/theokotVerhuur";

/**
 * Eén verhuuraanvraag zoals de clientcomponenten ze krijgen.
 *
 * De tijdzone-omzetting gebeurt op de server: `day`, `minutes` en de labels
 * staan er al in Brussel-wandklok in. Zo hoeft het weekraster niet met `Date` te
 * rekenen, en toont een laptop die per ongeluk op UTC staat niet iets anders dan
 * de rest.
 */
export type RentalView = {
  id: string;

  /** "YYYY-MM-DD" in Brussel, de dag waarop de verhuur begint. */
  day: string;
  /** Minuten sinds middernacht (Brussel), voor de plaats in het weekraster. */
  minutes: number;
  /**
   * Einde in minuten sinds middernacht van dezelfde dag. Een fuif die om 02:00
   * stopt levert hier dus een getal boven de 1440; het raster kapt zelf af op
   * middernacht en de lijst toont het echte uur.
   */
  endMinutes: number;

  /** Waarden voor de datum- en uurvelden in het beheer. */
  dateInput: string;
  startInput: string;
  endInput: string;

  /** "vrijdag 3 oktober 2025" en "20:00 – 02:00", al geformatteerd. */
  dateLabel: string;
  timeLabel: string;
  /** Korte vorm voor de lijst: "vr 3 okt". */
  dayLabel: string;

  status: RentalStatus;
  deposit: DepositState;
  contract: ContractState;
  keyStatus: KeyState;
  renterType: RenterType;
  depositChoice: DepositChoice;

  responsibleName: string;
  email: string;
  phone: string;
  purpose: string;
  attendees: number | null;
  remarks: string | null;
  /** De antwoorden op de vragen die Theokot zelf toevoegde. */
  extraAnswers: { id: string; label: string; value: string }[];

  internalNote: string | null;
  decisionNote: string | null;

  locale: "nl" | "en";

  decidedAtLabel: string | null;
  decidedByName: string | null;
  decidedViaMail: boolean;
  requesterNotifiedAtLabel: string | null;
  createdAtLabel: string;

  /** Andere aanvragen die met dit venster overlappen. */
  clashes: { id: string; label: string }[];

  /** Wat er over deze aanvraag al verstuurd werd, nieuwste eerst. */
  messages: RentalMessageView[];

  /**
   * De placeholderwaarden van deze aanvraag, al ingevuld en geformatteerd op de
   * server. Zo vult het paneel een sjabloon zonder zelf met tijdzones of
   * valutanotatie te rekenen.
   */
  mailVars: Record<string, string>;
};

export type RentalMessageView = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  body: string;
  attachmentName: string | null;
  sentAtLabel: string;
  sentByName: string | null;
  sentViaMail: boolean;
};

export type ContractDocView = {
  id: string;
  audience: RenterType;
  locale: string;
  fileName: string;
  sizeBytes: number;
  uploadedAtLabel: string;
  uploadedByName: string | null;
  /** Waar het document te bekijken is; de mediaroute streamt het. */
  href: string;
};
