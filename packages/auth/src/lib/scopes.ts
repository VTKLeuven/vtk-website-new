/**
 * De scopes die VTK als OAuth-provider aanbiedt.
 *
 * Bewust code en geen tabel: het zijn er een handvol, ze veranderen zelden, en
 * de plugin leest ze bij het opstarten toch maar één keer. Zo staat een wijziging
 * aan wat een app over een lid mag zien ook gewoon in code review, net als bij
 * de permissie-registry in packages/db/src/permissions.ts.
 *
 * `consentNl` / `consentEn` is wat het lid leest op het toestemmingsscherm en in
 * zijn lijst met verbonden apps. Schrijf ze in gewone taal, niet in jargon: dit
 * is de hele privacybelofte die het lid te zien krijgt.
 */
export type ScopeDefinition = {
  code: string;
  /** Gevoelige scopes verdienen extra nadruk in de UI. */
  sensitive: boolean;
  /** Staat aangevinkt bij het aanmaken van een client; de rest vink je zelf aan. */
  defaultSelected: boolean;
  consentNl: string;
  consentEn: string;
};

export const SCOPES = [
  {
    code: 'openid',
    sensitive: false,
    defaultSelected: true,
    consentNl: 'Wie je bent',
    consentEn: 'Who you are',
  },
  {
    code: 'profile',
    sensitive: false,
    defaultSelected: true,
    consentNl: 'Je naam en profielfoto',
    consentEn: 'Your name and profile picture',
  },
  {
    code: 'email',
    sensitive: false,
    defaultSelected: true,
    consentNl: 'Je e-mailadres',
    consentEn: 'Your email address',
  },
  {
    code: 'address',
    sensitive: true,
    defaultSelected: false,
    consentNl: 'Je kotadres',
    consentEn: 'Your address',
  },
  {
    code: 'phone',
    sensitive: true,
    defaultSelected: false,
    consentNl: 'Je telefoonnummer',
    consentEn: 'Your phone number',
  },
  {
    code: 'offline_access',
    sensitive: true,
    defaultSelected: false,
    consentNl: 'Toegang houden wanneer je niet aangemeld bent',
    consentEn: 'Keep access while you are signed out',
  },
  {
    code: 'entitlements',
    sensitive: false,
    defaultSelected: true,
    consentNl: 'Zien welke rechten je hebt in deze toepassing',
    consentEn: 'See which rights you have in this application',
  },
  {
    code: 'vtk:membership',
    sensitive: false,
    defaultSelected: false,
    consentNl: 'Van welke posten je lid bent',
    consentEn: 'Which groups you belong to',
  },

  // Studie stond eerst als één scope. Apart, omdat een app die enkel de
  // richting nodig heeft (bv. om een mailinglijst te filteren) daarvoor niet
  // ook het studentennummer moet kunnen opvragen.
  {
    code: 'vtk:study_programme',
    sensitive: false,
    defaultSelected: false,
    consentNl: 'Je studierichting',
    consentEn: 'Your study programme',
  },
  {
    code: 'vtk:study_year',
    sensitive: false,
    defaultSelected: false,
    consentNl: 'Je studiejaar',
    consentEn: 'Your year of study',
  },
  {
    // Het r-nummer identificeert het lid rechtstreeks bij de KU Leuven; van de
    // drie studie-scopes is dit de enige die echt gevoelig is.
    code: 'vtk:student_number',
    sensitive: true,
    defaultSelected: false,
    consentNl: 'Je studentennummer',
    consentEn: 'Your student number',
  },

  {
    code: 'vtk:contact',
    sensitive: true,
    defaultSelected: false,
    consentNl: 'Je persoonlijke contactgegevens en geboortedatum',
    consentEn: 'Your personal contact details and date of birth',
  },
] as const satisfies readonly ScopeDefinition[];

export type Scope = (typeof SCOPES)[number]['code'];

export const SCOPE_CODES: readonly string[] = SCOPES.map((s) => s.code);

const BY_CODE = new Map<string, ScopeDefinition>(SCOPES.map((s) => [s.code, s]));

/** Onbekende scopes komen ongewijzigd terug: liever de ruwe code tonen dan niets. */
export function describeScope(code: string, locale: 'nl' | 'en'): string {
  const scope = BY_CODE.get(code);
  if (!scope) return code;
  return locale === 'nl' ? scope.consentNl : scope.consentEn;
}

export function isSensitiveScope(code: string): boolean {
  return BY_CODE.get(code)?.sensitive ?? false;
}

/** Voorselectie bij het aanmaken van een client. */
export const DEFAULT_SCOPE_CODES: readonly string[] = SCOPES.filter((scope) => scope.defaultSelected).map(
  (scope) => scope.code
);
