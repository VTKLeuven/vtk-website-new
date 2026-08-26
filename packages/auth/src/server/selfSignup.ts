/**
 * Zelfregistratie met e-mail en wachtwoord, voor wie geen KU Leuven-login (meer)
 * heeft.
 *
 * De site draait op KU Leuven SSO: studenten registreren zichzelf door voor het
 * eerst in te loggen. Een alumnus van 2004 kan dat niet, en die groep is precies
 * wie we op onze evenementen willen. Daarom deze tweede deur.
 *
 * Bewust **niet** better-auths eigen `signUpEmail`. Die staat uit
 * (`emailAndPassword.disableSignUp: true`) en aanzetten zou het endpoint
 * `/api/auth/better/sign-up/email` openzetten voor iedereen, buiten elke controle
 * die we hier doen om. Dit maakt dezelfde twee rijen (`User` +
 * `Account { providerId: "credential" }`) als `createUser`, maar met de
 * beperkingen die bij een zelfgemaakt account horen:
 *
 * - `selfRegisteredAt` wordt gestempeld. Enkel bij zo'n account houdt een
 *   onbevestigd `emailVerified` de login tegen; accounts van een beheerder of via
 *   SSO zijn per definitie vertrouwd en zouden anders allemaal buitenvliegen.
 * - Geen posten, geen rollen, geen permissies. Het account is een gewoon
 *   ingelogd lid; wat aan de faculteit hangt (ledenkorting) volgt uit de
 *   KU Leuven-attributen die dit account nu eenmaal niet heeft.
 * - Bestaat het e-mailadres al, dan maken we **niets** en zeggen we naar buiten
 *   toe hetzelfde als bij een geslaagde registratie. Anders is dit formulier een
 *   manier om te achterhalen wie een account heeft.
 */
import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@vtk/db';
import type { Locale } from '..';
import { AuthError } from '..';
import { fullName } from '../lib/names';
import { hashPassword, verifyPassword } from '../logins/password';

/** Hoe lang een bevestigings- of herstellink geldig blijft. */
const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagen
const RESET_TTL_MS = 60 * 60 * 1000; // 1 uur

export const MIN_PASSWORD_LENGTH = 10;

export type SelfSignupInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  locale: Locale;
  alumni?: boolean;
  /** Vult het alumni-profiel meteen in; het is de reden dat deze deur bestaat. */
  graduationYear?: number | null;
  wasInVtk?: boolean;
  alumniMailOptIn?: boolean;
};

/**
 * Het resultaat van een registratiepoging. `token` is `null` wanneer er niets
 * aangemaakt is (adres al in gebruik); de oproeper mag dat verschil **niet**
 * doorvertellen aan de bezoeker.
 */
export type SelfSignupResult = {
  userId: string | null;
  token: string | null;
  email: string;
  name: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Alleen de hash belandt in de database, net als bij `CalendarFeedToken`. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Maakt een eenmalig token aan en verwijdert eventuele eerdere open tokens voor
 * dezelfde gebruiker en hetzelfde doel. Geeft de platte tekst terug om in de
 * mail te stoppen; in de database bewaren we alleen de SHA-256-hash.
 */
async function issueToken(
  userId: string,
  kind: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ttlMs: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.accountEmailToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.accountEmailToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    }),
  ]);
  return token;
}

export function assertPasswordStrongEnough(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('PASSWORD_TOO_SHORT');
}

export async function registerSelfServiceAccount(
  input: SelfSignupInput,
): Promise<SelfSignupResult> {
  assertPasswordStrongEnough(input.password);

  const email = normalizeEmail(input.email);
  const name = fullName(input.firstName.trim(), input.lastName.trim());

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Geen rij, geen token, geen mail. De oproeper toont hetzelfde scherm als
    // bij een geslaagde registratie; wie het adres al heeft, weet zelf waar de
    // inlogknop staat.
    return { userId: null, token: null, email, name };
  }

  const passwordHash = await hashPassword(input.password);
  const isAlumni = input.alumni ?? Boolean(input.graduationYear != null || input.wasInVtk || input.alumniMailOptIn);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        locale: input.locale,
        emailVerified: false,
        selfRegisteredAt: new Date(),
        // De onboarding hoort er ook voor dit account bij: die vult adres,
        // voorkeuren en het alumni-profiel aan. `onboardedAt` blijft dus null.
        alumni: isAlumni,
        notStudying: isAlumni,
        graduationYear: isAlumni ? (input.graduationYear ?? null) : null,
        wasInVtk: isAlumni ? (input.wasInVtk ?? false) : false,
        alumniMailOptIn: isAlumni ? (input.alumniMailOptIn ?? false) : false,
      },
    });

    await tx.account.create({
      data: {
        id: `credential:${created.id}`,
        accountId: created.id,
        providerId: 'credential',
        userId: created.id,
        password: passwordHash,
      },
    });

    return created;
  });

  const token = await issueToken(user.id, 'EMAIL_VERIFICATION', VERIFICATION_TTL_MS);
  return { userId: user.id, token, email, name };
}

type TokenRow = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: { email: string; name: string; locale: Locale };
};

async function consumeToken(
  token: string,
  kind: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
): Promise<TokenRow | null> {
  if (!token) return null;
  const row = await prisma.accountEmailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      kind: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!row || row.kind !== kind) return null;
  if (row.usedAt || row.expiresAt <= new Date()) return null;
  return row as TokenRow;
}

/**
 * Bevestigt het adres van een zelfgemaakt account. Idempotent aanvoelen kan niet:
 * de token is eenmalig, dus een tweede klik op dezelfde link geeft `null`. De
 * pagina vangt dat op met "deze link is al gebruikt of verlopen" plus een
 * inlogknop, want in verreweg de meeste gevallen is het account gewoon al actief.
 */
export async function confirmEmailToken(
  token: string,
): Promise<{ email: string; name: string } | null> {
  const row = await consumeToken(token, 'EMAIL_VERIFICATION');
  if (!row) return null;

  await prisma.$transaction([
    prisma.accountEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } }),
  ]);

  return { email: row.user.email, name: row.user.name };
}

/**
 * Een nieuwe bevestigingsmail voor een account dat nog niet bevestigd is. Geeft
 * `null` terug wanneer er niets te versturen valt (onbekend adres, al bevestigd,
 * of geen zelfgemaakt account); ook hier mag de oproeper dat verschil niet tonen.
 */
export async function reissueEmailVerification(
  email: string,
): Promise<{ userId: string; token: string; name: string; locale: Locale } | null> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, name: true, locale: true, emailVerified: true, selfRegisteredAt: true },
  });
  if (!user || user.emailVerified || !user.selfRegisteredAt) return null;

  const token = await issueToken(user.id, 'EMAIL_VERIFICATION', VERIFICATION_TTL_MS);
  return { userId: user.id, token, name: user.name, locale: user.locale };
}

/**
 * Wachtwoord vergeten. Enkel voor accounts die een wachtwoord hébben: wie via
 * KU Leuven binnenkomt heeft er geen, en een herstelmail sturen zou hem naar een
 * scherm leiden dat zijn probleem niet oplost.
 */
export async function createPasswordReset(
  email: string,
): Promise<{ userId: string; token: string; name: string; locale: Locale; email: string } | null> {
  const normalized = normalizeEmail(email);
  // Zoeken op allebei de adressen: een afgestudeerde kent zijn KU Leuven-adres
  // vaak niet meer uit het hoofd en tikt het adres in waar hij zijn mail leest.
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ email: normalized }, { personalEmail: normalized }],
    },
    select: {
      id: true,
      name: true,
      locale: true,
      active: true,
      email: true,
      personalEmail: true,
      accounts: { where: { providerId: 'credential' }, select: { id: true } },
    },
  });
  if (!user || !user.active || user.accounts.length === 0) return null;

  const token = await issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
  return {
    userId: user.id,
    token,
    name: user.name,
    locale: user.locale,
    // Naar het persoonlijke adres wanneer dat er is. Dit is precies het geval
    // waarin het universiteitsadres niet meer werkt: wie afstudeert, verliest die
    // mailbox, en een herstelmail daarheen sturen is een link die niemand leest.
    email: user.personalEmail || user.email,
  };
}

/**
 * Maakt vanuit een vertrouwde beheerflow een link waarmee een bestaande
 * gebruiker voor het eerst een wachtwoord kan instellen.
 *
 * In tegenstelling tot `createPasswordReset` hoeft er nog geen credential-rij
 * te bestaan: dat is net het probleem van een alumnus die enkel via KU Leuven
 * inlogde. De bestemming moet wel een niet-KU-Leuven-adres zijn dat al op het
 * profiel staat. Het webproject controleert en bewaart dat adres vóór deze
 * functie wordt aangeroepen; deze tweede controle voorkomt dat een latere
 * aanroeper per ongeluk toch naar de vervallen universiteitsmail stuurt.
 */
export async function createPasswordSetupForUser(
  userId: string,
): Promise<{ userId: string; token: string; name: string; locale: Locale; email: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      locale: true,
      email: true,
      personalEmail: true,
      active: true,
      deletedAt: true,
    },
  });
  if (!user || !user.active || user.deletedAt) return null;

  const email = normalizeEmail(user.personalEmail || user.email);
  if (/@(?:[^@.]+\.)*kuleuven\.be$/i.test(email)) return null;

  const token = await issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
  return { userId: user.id, token, name: user.name, locale: user.locale, email };
}

/**
 * Waar een herstelmail voor dit lid naartoe zou gaan, en of er al een wachtwoord
 * is. Voor het paneel op /account: iemand die zijn KU Leuven-account gaat
 * verliezen, moet vooraf kunnen zien of hij binnen geraakt zonder.
 */
export async function passwordStatus(
  userId: string,
): Promise<{ hasPassword: boolean; resetEmail: string; usesPersonalEmail: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      personalEmail: true,
      accounts: { where: { providerId: 'credential' }, select: { id: true } },
    },
  });
  return {
    hasPassword: user.accounts.length > 0,
    resetEmail: user.personalEmail || user.email,
    usesPersonalEmail: Boolean(user.personalEmail),
  };
}

/**
 * Zelf een wachtwoord instellen op een account dat er nog geen heeft, of het
 * bestaande vervangen.
 *
 * Dit is het migratiepad voor wie via KU Leuven binnenkomt. Dat account
 * verdwijnt een tijd na het afstuderen, en dan is er geen enkele manier meer om
 * in te loggen; een wachtwoord vooraf instellen is het verschil tussen een
 * alumnus die blijft meedoen en een die buiten staat.
 *
 * Bewust géén huidig wachtwoord vereist: verreweg de meesten hebben er nog geen,
 * en wie er wel een heeft, zit hier achter een geldige sessie. Wil je het
 * strenger, dan hoort dat bij een "gevoelige actie"-herauthenticatie die de site
 * nergens anders heeft.
 */
export async function setOwnPassword(userId: string, password: string): Promise<void> {
  assertPasswordStrongEnough(password);
  const passwordHash = await hashPassword(password);
  await prisma.account.upsert({
    where: { id: `credential:${userId}` },
    update: { password: passwordHash },
    create: {
      id: `credential:${userId}`,
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
    },
  });
}

/** Zet een nieuw wachtwoord met een herstellink. `false` = link ongeldig of verlopen. */
export async function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<boolean> {
  assertPasswordStrongEnough(password);
  const row = await consumeToken(token, 'PASSWORD_RESET');
  if (!row) return false;

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.accountEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.account.upsert({
      where: { id: `credential:${row.userId}` },
      update: { password: passwordHash },
      create: {
        id: `credential:${row.userId}`,
        accountId: row.userId,
        providerId: 'credential',
        userId: row.userId,
        password: passwordHash,
      },
    }),
    // Wie zijn wachtwoord kan herstellen, bewijst daarmee dat het adres van hem
    // is. Een zelfgemaakt account dat nooit op de bevestigingslink klikte, raakt
    // zo alsnog binnen zonder een tweede mail.
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } }),
  ]);
  return true;
}

/**
 * Het login-adres dat bij een ingetikt adres hoort.
 *
 * `User.email` is de identiteit (bij een SSO-lid het KU Leuven-adres). Wie
 * afgestudeerd is, kent dat adres vaak niet meer uit het hoofd en tikt het adres
 * in waar hij zijn mail leest. Zonder deze vertaling zou hij een wachtwoord
 * kunnen herstellen via zijn persoonlijke adres en er daarna alsnog niet mee
 * binnen geraken; dat is precies de val die dit migratiepad moest wegnemen.
 *
 * Enkel wanneer het persoonlijke adres **één** account aanwijst. Botst het met
 * een login-adres of met een tweede profiel, dan blijft het ingetikte adres
 * staan en faalt de login als een gewone foute login. Raden doen we hier niet.
 */
export async function resolveLoginEmail(email: string): Promise<string> {
  const normalized = normalizeEmail(email);

  const direct = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  if (direct) return normalized;

  const matches = await prisma.user.findMany({
    where: { personalEmail: normalized, deletedAt: null },
    select: { email: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0]!.email : normalized;
}

/**
 * Waarom een login geweigerd wordt. `UNVERIFIED` komt er enkel uit wanneer het
 * wachtwoord **klopt**: anders zou dit formulier verklappen welke adressen een
 * account hebben.
 */
export type LoginBlock = 'NONE' | 'INVALID' | 'UNVERIFIED';

export async function checkLoginBlocked(email: string, password: string): Promise<LoginBlock> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      active: true,
      emailVerified: true,
      selfRegisteredAt: true,
      accounts: { where: { providerId: 'credential' }, select: { password: true } },
    },
  });
  if (!user || !user.active) return 'INVALID';
  if (user.emailVerified || !user.selfRegisteredAt) return 'NONE';

  const hash = user.accounts[0]?.password;
  if (!hash) return 'INVALID';
  return (await verifyPassword({ hash, password })) ? 'UNVERIFIED' : 'INVALID';
}
