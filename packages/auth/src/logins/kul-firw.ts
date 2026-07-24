/**
 * Synchronises the authoritative KU Leuven faculty status on every successful
 * KU Leuven userinfo response.
 */
import "server-only";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";

export const FIRW_ORG_UNIT_NUMBER = "50000486";

const ORG_UNIT_CLAIM = /eduPersonOrgUnitDN/i;
const ORG_UNIT_OID = "urn:oid:1.3.6.1.4.1.5923.1.1.1.4";
const FIRW_VALUE = new RegExp(`(^|\\D)${FIRW_ORG_UNIT_NUMBER}(\\D|$)`);

function containsFirwUnit(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number") {
    return FIRW_VALUE.test(String(value));
  }
  if (Array.isArray(value)) return value.some(containsFirwUnit);
  return false;
}

/** Derives FirW membership solely from KU Leuven's organisation-unit claim. */
export function firwStudentFromProfile(profile: Record<string, unknown>): boolean {
  return Object.entries(profile).some(
    ([claim, value]) =>
      (ORG_UNIT_CLAIM.test(claim) || claim.toLowerCase() === ORG_UNIT_OID) &&
      containsFirwUnit(value),
  );
}

type UpdateMany = (
  args: Prisma.UserUpdateManyArgs,
) => Promise<{ count: number }>;

const updateManyFirwUsers: UpdateMany = (args) => prisma.user.updateMany(args);

/**
 * Initialises or changes the stored status atomically. When the status is
 * already equal and a change timestamp exists, the UPDATE matches no rows and
 * therefore leaves both firwStudentChangedAt and User.updatedAt untouched.
 */
export async function syncFirwStudent(
  email: string,
  firwStudent: boolean,
  changedAt: Date,
  updateMany: UpdateMany = updateManyFirwUsers,
): Promise<boolean> {
  const result = await updateMany({
    where: {
      email,
      OR: [
        { firwStudent: !firwStudent },
        { firwStudentChangedAt: null },
      ],
    },
    data: {
      firwStudent,
      firwStudentChangedAt: changedAt,
    },
  });
  return result.count > 0;
}
