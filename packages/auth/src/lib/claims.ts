/**
 * Welke gegevens VTK als claim vrijgeeft, onder welke scope, en waar ze
 * terechtkomen.
 *
 * Code en geen tabel, zoals de scope-registry: een wijziging hier bepaalt welke
 * ledengegevens een externe applicatie te zien krijgt, en dat hoort door code
 * review te gaan. Zie ook packages/db/src/permissions.ts, dat hetzelfde patroon
 * volgt.
 *
 * Een claim toevoegen voor een veld dat al bestaat is één regel hieronder. Een
 * claim die logica nodig heeft, krijgt een `COMPUTED`-bron in server/claims.ts.
 */
import type { TransformerArgs, TransformerName } from './transformers';

/** Waar een claim in terecht mag komen. */
export type ClaimDestination = 'id_token' | 'access_token' | 'userinfo';

export type ClaimSource =
  /** Rechtstreeks een veld van `User`. */
  | { kind: 'USER_FIELD'; field: string }
  /** Berekend in code; zie COMPUTED in server/claims.ts. */
  | { kind: 'COMPUTED'; resolver: string };

export type ClaimDefinition = {
  /** De naam zoals ze in het token verschijnt. */
  name: string;
  /** Zonder deze scope komt de claim niet vrij. */
  scope: string;
  source: ClaimSource;
  transformer: TransformerName;
  transformerArgs?: TransformerArgs;
  destinations: ClaimDestination[];
};

/**
 * `sub`, `iss`, `aud`, `exp`, `iat` en `azp` staan hier bewust niet in: die
 * horen bij het protocol en worden door de plugin zelf gezet.
 *
 * Standaard-OIDC-claims houden hun standaardnaam; VTK-eigen claims krijgen het
 * `vtk:`-voorvoegsel (zie 11.4 in het ontwerpdocument).
 */
export const CLAIMS: readonly ClaimDefinition[] = [
  // --- profile -------------------------------------------------------------
  {
    name: 'name',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'name' },
    transformer: 'string',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'given_name',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'firstName' },
    transformer: 'string',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'family_name',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'lastName' },
    transformer: 'string',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'preferred_username',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'email' },
    transformer: 'localPart',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'picture',
    scope: 'profile',
    source: { kind: 'COMPUTED', resolver: 'picture' },
    transformer: 'storageUrl',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'locale',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'locale' },
    transformer: 'bcp47',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'updated_at',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'updatedAt' },
    transformer: 'unixSeconds',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:onboarded',
    scope: 'profile',
    source: { kind: 'USER_FIELD', field: 'onboardedAt' },
    transformer: 'isNotNull',
    destinations: ['userinfo'],
  },

  // --- email ---------------------------------------------------------------
  // VTK heeft drie adressen (universitair, persoonlijk, en een voorkeur die
  // kiest); welk adres `email` betekent, moet daarom vastliggen. Zie 11.6.
  {
    // Altijd het universitaire adres, nooit het voorkeursadres: dit is de
    // identiteitsclaim van OIDC. Een client die accounts matcht op `email` ziet
    // die anders veranderen zodra een lid zijn voorkeur omzet, en koppelt de
    // volgende login aan niets of aan het verkeerde account.
    name: 'email',
    scope: 'email',
    source: { kind: 'USER_FIELD', field: 'email' },
    transformer: 'string',
    destinations: ['id_token', 'userinfo'],
  },
  {
    name: 'email_verified',
    scope: 'email',
    source: { kind: 'USER_FIELD', field: 'emailVerified' },
    transformer: 'boolean',
    destinations: ['id_token', 'userinfo'],
  },
  {
    // Het adres waarop de kring dit lid effectief contacteert, als aparte claim
    // naast `email` en niet in de plaats ervan: een mailing wil dit adres, een
    // identiteitskoppeling wil het universitaire. Allebei uitgeven laat de
    // client kiezen; één van de twee uitgeven geeft de helft van de clients
    // stilzwijgend het verkeerde antwoord.
    name: 'vtk:preferred_email',
    scope: 'email',
    source: { kind: 'COMPUTED', resolver: 'preferredEmail' },
    transformer: 'string',
    destinations: ['userinfo'],
  },

  // --- address -------------------------------------------------------------
  {
    name: 'address',
    scope: 'address',
    source: { kind: 'COMPUTED', resolver: 'oidcAddress' },
    transformer: 'identity',
    destinations: ['userinfo'],
  },

  // --- vtk:contact ---------------------------------------------------------
  {
    name: 'birthdate',
    scope: 'vtk:contact',
    source: { kind: 'USER_FIELD', field: 'birthDate' },
    transformer: 'isoDate',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:personal_email',
    scope: 'vtk:contact',
    source: { kind: 'USER_FIELD', field: 'personalEmail' },
    transformer: 'string',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:email_preference',
    scope: 'vtk:contact',
    source: { kind: 'USER_FIELD', field: 'emailPreference' },
    transformer: 'enumValue',
    destinations: ['userinfo'],
  },

  // --- studie (drie aparte scopes, zie lib/scopes.ts) -----------------------
  {
    name: 'vtk:study_programmes',
    scope: 'vtk:study_programme',
    source: { kind: 'USER_FIELD', field: 'studyProgrammes' },
    transformer: 'enumArray',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:not_at_faculty',
    scope: 'vtk:study_programme',
    source: { kind: 'USER_FIELD', field: 'notAtFaculty' },
    transformer: 'boolean',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:study_years',
    scope: 'vtk:study_year',
    source: { kind: 'USER_FIELD', field: 'studyYears' },
    transformer: 'enumArray',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:study_confirmed_year',
    scope: 'vtk:study_year',
    source: { kind: 'USER_FIELD', field: 'studyConfirmedYear' },
    transformer: 'identity',
    destinations: ['userinfo'],
  },
  {
    name: 'vtk:student_number',
    scope: 'vtk:student_number',
    source: { kind: 'USER_FIELD', field: 'rNumber' },
    transformer: 'string',
    destinations: ['userinfo'],
  },

  // --- entitlements --------------------------------------------------------
  // Bewust leeg tot fase 5. `entitlements` gaat over wat een lid mag *binnen
  // die ene client*, en die vocabulaire bestaat nog niet; de scope staat er al
  // zodat clients en toestemmingen niet hoeven te wijzigen zodra ze er is.
  //
  // Wat hier NIET terugkomt: `vtk:roles`, `vtk:permissions`, `vtk:groups`.
  // Dat is VTK's interne organisatiestructuur, geen antwoord op "wat mag dit
  // lid in jouw toepassing". Een client hoort te beslissen op een permissie die
  // hij zelf gedefinieerd heeft, niet op het feit dat iemand in het praesidium
  // zit; anders schrijft hij onze postenstructuur in zijn code en breekt hij
  // wanneer wij die hernoemen.
] as const;

export const CLAIM_NAMES: readonly string[] = CLAIMS.map((claim) => claim.name);

/** Alle claimnamen die onder een bepaalde scope kunnen vrijkomen. */
export function claimsForScope(scope: string): ClaimDefinition[] {
  return CLAIMS.filter((claim) => claim.scope === scope);
}
