/**
 * Opt-in debuglogging voor de KU Leuven OIDC-login.
 *
 * Een superadmin kan onder Admin -> IT aanzetten dat we bij elke KU Leuven-login
 * de ruwe claims bewaren die better-auth aan `mapProfileToUser` doorgeeft (zie
 * kul.ts). Zo is zichtbaar welke attributen ICTS effectief vrijgeeft, bijvoorbeeld
 * of `KULeuvenEmployeeType` (de faculteit) binnenkomt. De toggle en de log leven
 * in de database (respectievelijk de `Setting`-tabel en `KulAuthLog`), niet in de
 * omgeving, zodat je ze zonder redeploy aan/uit zet.
 *
 * Belangrijk: dit bevat persoonsgegevens (naam, e-mail, r-nummer, faculteit).
 * Daarom staat het standaard uit, bewaren we enkel logins van de laatste
 * `KUL_LOG_RETENTION_DAYS` (7) dagen, en mag het loggen nooit een login breken
 * (alles hieronder faalt dicht).
 */
import "server-only";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";

/** Setting-sleutel voor de debugtoggle. JSON-vorm: `{ enabled: boolean }`. */
export const KUL_DEBUG_SETTING_KEY = "kul.debug";

/** Hoeveel dagen we bewaarde logins bijhouden; oudere rijen worden gesnoeid. */
export const KUL_LOG_RETENTION_DAYS = 7;

/** @deprecated Gebruik `KUL_LOG_RETENTION_DAYS`. */
export const KUL_LOG_KEEP = KUL_LOG_RETENTION_DAYS;

type KulDebugSetting = { enabled?: boolean };

/** Eén bewaarde login: de ruwe claims plus twee uitgelichte velden voor de UI. */
export type KulAuthLogEntry = {
  id: string;
  at: Date;
  email: string | null;
  rNumber: string | null;
  claims: Record<string, unknown>;
};

/** Of het loggen van KU Leuven-claims aanstaat. Faalt dicht (uit) bij DB-fouten. */
export async function isKulDebugEnabled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KUL_DEBUG_SETTING_KEY } });
    const value = (row?.value ?? null) as KulDebugSetting | null;
    return Boolean(value?.enabled);
  } catch {
    return false;
  }
}

/**
 * Bewaart de ruwe claims van één KU Leuven-login wanneer de toggle aanstaat, en
 * snoeit daarna rijen ouder dan `KUL_LOG_RETENTION_DAYS` dagen. `email` en `rNumber` komen
 * van de aanroeper (kul.ts leidt ze al af) zodat de UI ze zonder de volledige
 * claims kan tonen. Gooit nooit: een mislukte log mag een login niet breken.
 */
export async function recordKulProfile(
  profile: Record<string, unknown>,
  meta: { email?: string; rNumber?: string },
): Promise<void> {
  try {
    if (!(await isKulDebugEnabled())) return;

    await prisma.kulAuthLog.create({
      data: {
        email: meta.email ?? null,
        rNumber: meta.rNumber ?? null,
        claims: profile as Prisma.InputJsonValue,
      },
    });

    // Snoei rijen ouder dan de bewaartermijn. Aparte query zodat een fout hier de login
    // (en de zonet bewaarde rij) niet raakt.
    const cutoff = new Date(Date.now() - KUL_LOG_RETENTION_DAYS * 86_400_000);
    await prisma.kulAuthLog.deleteMany({
      where: { at: { lt: cutoff } },
    });
  } catch {
    // Debuglogging mag de authenticatie nooit breken; bewust ingeslikt.
  }
}

/** De bewaarde logins van de voorbije dagen, nieuwste eerst, voor het overzicht in Admin -> IT. */
export async function getKulAuthLogs(days = KUL_LOG_RETENTION_DAYS): Promise<KulAuthLogEntry[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.kulAuthLog.findMany({
    where: { at: { gte: cutoff } },
    orderBy: { at: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    email: row.email,
    rNumber: row.rNumber,
    claims: (row.claims ?? {}) as Record<string, unknown>,
  }));
}

/** Snoeit bewaarde logins ouder dan de bewaartermijn. */
export async function pruneKulAuthLogs(days = KUL_LOG_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const { count } = await prisma.kulAuthLog.deleteMany({
    where: { at: { lt: cutoff } },
  });
  return count;
}

/** Wist alle bewaarde logins. De toggle zelf blijft ongewijzigd. */
export async function clearKulAuthLogs(): Promise<void> {
  await prisma.kulAuthLog.deleteMany({});
}
