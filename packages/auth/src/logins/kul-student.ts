/**
 * Is deze KU Leuven-login een studentenaccount?
 *
 * Dat is de vraag die een SSO-client met `kulRequirement: STUDENT` stelt
 * (Burgieclan). Twee voorwaarden, allebei uit wat KU Leuven bij elke login
 * meestuurt:
 *
 *   1. de accountnaam is een r-nummer (`r` en zeven cijfers). Personeel en
 *      proffen hebben een u-nummer en vallen hier dus af;
 *   2. het adres staat op `student.kuleuven.be`. Personeel heeft een adres op
 *      `kuleuven.be`.
 *
 * Wat dit níét kan: een doctoraatsonderzoeker die met een r-nummer inlogt, is
 * aan deze twee niet van een andere student te onderscheiden. Daarvoor zou de
 * opleidingscode (`KULopl`) nodig zijn, en welke codes doctoraatsopleidingen
 * zijn, weten we niet. Zie docs/sso.md.
 */
import "server-only";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";

export const KUL_STUDENT_EMAIL_DOMAIN = "student.kuleuven.be";

/** Een KU Leuven-accountnaam: een letter en zeven cijfers (r0123456, u0012345). */
const KUL_ACCOUNT_NAME = /^[a-z]\d{7}$/i;
const STUDENT_ACCOUNT_NAME = /^r\d{7}$/i;

/** De claims die de accountnaam van de login dragen; `sub` is `r0123456@kuleuven.be`. */
const ACCOUNT_CLAIMS = ["sub", "uid", "preferred_username"] as const;

function accountNames(profile: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const claim of ACCOUNT_CLAIMS) {
    const value = profile[claim];
    if (typeof value !== "string") continue;
    const local = value.trim().split("@")[0] ?? "";
    // Enkel wat op een accountnaam lijkt telt. Een ondoorzichtige `sub` (zoals
    // een pairwise id, mocht KU Leuven daar ooit naar overstappen) zegt niets
    // over het soort account en mag de uitkomst dus niet bepalen.
    if (KUL_ACCOUNT_NAME.test(local)) names.push(local);
  }
  return names;
}

/**
 * `true` enkel wanneer de login een r-nummer is en het adres op
 * student.kuleuven.be staat. Noemt één van de accountclaims een u-nummer, dan
 * is het geen studentenaccount, ook als een andere claim een r-nummer draagt.
 *
 * @param email het adres van de login zoals `kul.ts` het leest (kleine letters).
 */
export function kulStudentFromProfile(
  profile: Record<string, unknown>,
  email: string | undefined,
): boolean {
  if (!email || !email.toLowerCase().endsWith(`@${KUL_STUDENT_EMAIL_DOMAIN}`)) return false;
  const names = accountNames(profile);
  return names.length > 0 && names.every((name) => STUDENT_ACCOUNT_NAME.test(name));
}

/**
 * Mag deze login de student- en FirW-status van het account zetten?
 *
 * Een account kan twee KU Leuven-logins dragen: het r-nummer en het u-nummer
 * van een doctoraatsstudent of van een student die ook bij de KU Leuven werkt
 * (gekoppeld vanaf /account). De studentenlogin is dan de bron. Een
 * personeelslogin zet de status enkel wanneer ze de enige KU Leuven-login van
 * het account is, zoals bij een prof.
 */
export function kulStatusFromThisLogin(
  kulStudent: boolean,
  accountHasOtherKulLogin: boolean,
): boolean {
  return kulStudent || !accountHasOtherKulLogin;
}

type UpdateMany = (args: Prisma.UserUpdateManyArgs) => Promise<{ count: number }>;

const updateManyUsers: UpdateMany = (args) => prisma.user.updateMany(args);

/**
 * Zet de status op een bestaand account, zoals `syncFirwStudent`: enkel bij de
 * eerste controle of een echte wijziging, zodat `User.updatedAt` niet bij elke
 * login verschuift.
 */
export async function syncKulStudent(
  userId: string,
  kulStudent: boolean,
  changedAt: Date,
  updateMany: UpdateMany = updateManyUsers,
): Promise<boolean> {
  const result = await updateMany({
    where: {
      id: userId,
      OR: [{ kulStudent: !kulStudent }, { kulStudentChangedAt: null }],
    },
    data: { kulStudent, kulStudentChangedAt: changedAt },
  });
  return result.count > 0;
}
