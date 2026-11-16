/**
 * Houdt testdata weg van de productiedatabase.
 *
 * `prisma/seed.ts` maakt prototype-accounts (`<post>@vtk.prototype` met
 * wachtwoord `prototype`), zet die in de posten van het werkingsjaar, en
 * voegt verzonnen shiften, kalenderevents en een demoformulier toe. Op de
 * echte site staan die mensen dan op /praesidium en kan iedereen met het
 * wachtwoord uit de repo aanmelden. De seed is daarom op productie geweigerd,
 * zonder uitzondering en zonder vlag om het toch te doen.
 *
 * Productie herkennen we op twee manieren, en één volstaat:
 *
 * 1. De env van het proces: `BETTER_AUTH_URL` of `VTK_MAIN_URL` wijst naar
 *    vtk.be. Zo staat het in de root-`.env` op liv.
 * 2. De database zelf: de rij `instance.environment` in `Setting` zegt
 *    `production`. `prisma/sync.ts` schrijft die bij elke start van de
 *    webcontainer op productie. Daardoor weigert de seed ook wanneer iemand ze
 *    vanaf een laptop tegen de productiedatabase draait (een tunnel, een
 *    gekopieerde `DATABASE_URL`), waar de env naar localhost wijst.
 *
 * Wat de seed op productie nodig leek te maken (nieuwe permissies, de rechten
 * van de rol admin, de gebouwen), doet `sync.ts` al bij elke start.
 */
import type { PrismaClient } from "@prisma/client";

export const INSTANCE_SETTING_KEY = "instance.environment";

/** De hosts waarop de echte site draait. dev.vtk.be en de rest zijn geen productie. */
const PRODUCTION_HOSTS = new Set(["vtk.be", "www.vtk.be"]);

function hostOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim().replace(/^["']|["']$/g, "")).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Zegt de env van dit proces dat we op productie draaien? */
export function envSaysProduction(
  env: { readonly [key: string]: string | undefined } = process.env,
): boolean {
  return [env.BETTER_AUTH_URL, env.VTK_MAIN_URL].some((value) => {
    const host = hostOf(value);
    return host !== null && PRODUCTION_HOSTS.has(host);
  });
}

/** Zegt de database zelf dat ze de productiedatabase is? */
export async function databaseSaysProduction(prisma: PrismaClient): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: INSTANCE_SETTING_KEY } });
  return row !== null && (row.value as { kind?: unknown } | null)?.kind === "production";
}

/** Markeert de database als productie. Enkel aanroepen wanneer `envSaysProduction()`. */
export async function markDatabaseAsProduction(prisma: PrismaClient): Promise<boolean> {
  if (await databaseSaysProduction(prisma)) return false;
  await prisma.setting.upsert({
    where: { key: INSTANCE_SETTING_KEY },
    create: { key: INSTANCE_SETTING_KEY, value: { kind: "production" } },
    update: { value: { kind: "production" } },
  });
  return true;
}

/**
 * Stopt het proces wanneer dit de productiedatabase is. `what` zegt in de
 * foutmelding wat er geweigerd werd.
 */
export async function refuseOnProduction(prisma: PrismaClient, what: string): Promise<void> {
  const byEnv = envSaysProduction();
  const byDb = byEnv ? false : await databaseSaysProduction(prisma);
  if (!byEnv && !byDb) return;

  console.error(
    [
      `Weigert te draaien: ${what} schrijft testdata, en dit is de productiedatabase.`,
      byEnv
        ? "  (BETTER_AUTH_URL of VTK_MAIN_URL wijst naar vtk.be)"
        : `  (de rij "${INSTANCE_SETTING_KEY}" in Setting zegt "production")`,
      "",
      "Permissies, de rechten van de rol admin en de gebouwen zet prisma/sync.ts",
      "al bij elke start van de webcontainer; daarvoor is de seed niet nodig.",
      "Testdata hoort op dev.vtk.be of lokaal. Zie docs/dev-testdata.md.",
    ].join("\n"),
  );
  await prisma.$disconnect();
  process.exit(1);
}
