/**
 * De ondergrens op de appversie.
 *
 * Staat een geïnstalleerde app hieronder, dan toont ze een bijwerkscherm in
 * plaats van schermen die stuk kunnen zijn. Bewust een omgevingsvariabele en
 * geen `Setting`-rij met een beheerscherm: dit hoort bij een release van de
 * server, niet bij het dagelijkse beheer, en een verkeerd getikte waarde in een
 * adminveld zet iedereen buiten.
 *
 * De meeste wijzigingen vragen dit niet. Verhoog het enkel wanneer een oudere
 * app effectief niet meer werkt op deze server, en niet bij elke release.
 */

const FALLBACK = "1.0.0";
const SEMVER = /^\d+\.\d+\.\d+$/;

export function minimumAppVersion(): string {
  const raw = process.env.APP_MINIMUM_VERSION?.trim();
  return raw && SEMVER.test(raw) ? raw : FALLBACK;
}

/**
 * Vergelijkt twee `major.minor.patch`-versies. Negatief wanneer `a` ouder is.
 * Staat hier en niet in `contract.ts` omdat de app zijn eigen vergelijking doet
 * op de waarde die ze binnenkrijgt; dit is er voor de tests aan deze kant.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number(part) || 0);
  const right = b.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
