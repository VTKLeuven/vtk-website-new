import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import { academicYearRangeFor, currentAcademicYear } from "@/lib/shift";

export type GrantManualShiftsInput = {
  userId: string;
  count: number;
  post?: string | null;
  academicYear?: number;
  reason?: string;
  reward?: number;
  payedOut?: boolean;
  date?: Date | string | null;
  actorId?: string | null;
  actorName?: string | null;
};

export class ManualShiftValidationError extends Error {
  constructor(public details: string[]) {
    super(`Validation failed: ${details.join("; ")}`);
    this.name = "ManualShiftValidationError";
  }
}

/**
 * Berekent een veilige start- en eindtijd in het gekozen academiejaar die
 * gegarandeerd in het verleden ligt (`endTime < now`), zodat de gegenereerde
 * shiften meteen als voltooid tellen voor de ranglijst en medewerkersstatus.
 */
export function computeManualShiftDates(
  academicYear: number,
  customDate?: Date | string | null,
): { startTime: Date; endTime: Date } {
  const ay = academicYearRangeFor(academicYear);
  const now = new Date();

  let refDate: Date;
  if (customDate) {
    const parsed = customDate instanceof Date ? customDate : new Date(customDate);
    if (!Number.isNaN(parsed.getTime())) {
      refDate = parsed;
    } else {
      refDate = defaultReferenceDate(ay, now);
    }
  } else {
    refDate = defaultReferenceDate(ay, now);
  }

  // Zorg dat start en end binnen het academiejaar vallen en in het verleden liggen
  let endTime = new Date(refDate.getTime() + 3600 * 1000);
  let startTime = new Date(refDate.getTime());

  if (endTime.getTime() >= now.getTime()) {
    endTime = new Date(now.getTime() - 60 * 1000); // 1 minuut geleden
    startTime = new Date(endTime.getTime() - 3600 * 1000);
  }

  // Als de start vóór de start van het academiejaar zou vallen, klem binnen academiejaar
  if (startTime.getTime() < ay.start.getTime()) {
    startTime = new Date(ay.start.getTime() + 3600 * 1000);
    endTime = new Date(startTime.getTime() + 3600 * 1000);
  }

  return { startTime, endTime };
}

function defaultReferenceDate(ay: { start: Date; end: Date }, now: Date): Date {
  if (ay.end.getTime() < now.getTime()) {
    // Vorig academiejaar: neem bv. september van dat jaar
    return new Date(ay.start.getTime() + 60 * 86400 * 1000);
  }
  // Huidig academiejaar: 2 uur geleden
  return new Date(now.getTime() - 2 * 3600 * 1000);
}

/**
 * Kent manueel extra shiften toe aan een lid (bv. overdracht van de vorige website).
 *
 * Maakt één `ManualShiftGrant`-rij aan en genereert per shift een gekoppelde
 * `Shift` + `ShiftParticipant`-rij met `sourceSystem = "manual"` en `manualGrantId`.
 * Hierdoor tellen deze shiften automatisch mee in álle bestaande queries:
 * - Ranglijst (/admin/shiften, /api/shift/ranking)
 * - Vaste medewerker / voorrang voorverkoop (15 shiften)
 * - Persoonlijke shiftenoverzichten (/shift, /shift/history, app)
 */
export async function grantManualShifts(input: GrantManualShiftsInput) {
  const errors: string[] = [];

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) {
    errors.push("userId is verplicht");
  }

  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    errors.push("Aantal shiften moet een geheel getal zijn tussen 1 en 100");
  }

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
    : null;
  if (userId && !user) {
    errors.push("Gebruiker niet gevonden");
  }

  const academicYear = input.academicYear !== undefined ? Number(input.academicYear) : currentAcademicYear();
  if (!Number.isInteger(academicYear) || academicYear < 2010 || academicYear > 2100) {
    errors.push("Ongeldig academiejaar");
  }

  const reward = input.reward !== undefined ? Number(input.reward) : 0;
  if (!Number.isInteger(reward) || reward < 0) {
    errors.push("Aantal bonnetjes moet een niet-negatief geheel getal zijn");
  }

  const payedOut = input.payedOut ?? true;
  const reason = (input.reason ?? "Overdracht vorige website").trim();
  if (!reason) {
    errors.push("Reden / toelichting is verplicht");
  }

  const post = input.post ? input.post.trim() : null;

  if (errors.length > 0) {
    throw new ManualShiftValidationError(errors);
  }

  const { startTime, endTime } = computeManualShiftDates(academicYear, input.date);

  const grant = await prisma.$transaction(async (tx) => {
    const createdGrant = await tx.manualShiftGrant.create({
      data: {
        userId,
        count,
        post,
        reason,
        academicYear,
        reward,
        payedOut,
        createdById: input.actorId ?? null,
      },
    });

    for (let i = 0; i < count; i++) {
      // Milliseconden verschoven zodat elke shift een uniek tijdstip en sourceId heeft
      const sStart = new Date(startTime.getTime() + i * 1000);
      const sEnd = new Date(endTime.getTime() + i * 1000);

      await tx.shift.create({
        data: {
          name: reason || "Extra shift (manueel)",
          description: `Manueel toegekende shift (${reason})`,
          location: "Vorige website",
          startTime: sStart,
          endTime: sEnd,
          maxParticipants: 1,
          reward,
          post,
          openToInternationals: false,
          sourceSystem: "manual",
          sourceId: `${createdGrant.id}-${i + 1}`,
          manualGrantId: createdGrant.id,
          participants: {
            create: {
              userId,
              payedOut,
              rewardPaid: payedOut ? reward : 0,
              registeredAt: sStart,
            },
          },
        },
      });
    }

    return createdGrant;
  });

  await logAudit({
    action: "create",
    entity: "shiftManual",
    entityId: grant.id,
    target: user?.name ?? userId,
    summary: `${count} extra shift(en) toegekend (${post ? `post: ${post}, ` : ""}academiejaar: ${academicYear}-${academicYear + 1}, reden: ${reason})`,
  });

  return grant;
}

/**
 * Verwijdert een manuele shifttoekenning.
 * Dankzij de `onDelete: Cascade` op `Shift.manualGrant` worden alle gekoppelde
 * `Shift`- en `ShiftParticipant`-rijen automatisch mee opgeruimd.
 */
export async function deleteManualShiftGrant(id: string) {
  const grant = await prisma.manualShiftGrant.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  });

  if (!grant) {
    return null;
  }

  await prisma.manualShiftGrant.delete({
    where: { id },
  });

  await logAudit({
    action: "delete",
    entity: "shiftManual",
    entityId: grant.id,
    target: grant.user.name,
    summary: `${grant.count} extra shift(en) ingetrokken (${grant.post ? `post: ${grant.post}, ` : ""}academiejaar: ${grant.academicYear}-${grant.academicYear + 1})`,
  });

  return grant;
}
