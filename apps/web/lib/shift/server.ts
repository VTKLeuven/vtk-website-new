import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import type { ShiftInput } from "@/lib/shift";

/**
 * Maakt één shift aan.
 *
 * Dit is de enige plek waar een shift ontstaat. `POST /api/shift` gebruikt het
 * (en daarmee ook het sjabloonscherm, dat die route per shift aanroept), en het
 * aanmaken van een Theokot-verkoopweek gebruikt het rechtstreeks. Komt er ooit
 * iets bij het aanmaken van een shift, dan hoort het hier en krijgt elke weg het
 * vanzelf mee.
 *
 * De invoer is al door {@link parseShift} gegaan; deze functie valideert niet
 * opnieuw.
 */
export async function createShift(
  data: ShiftInput,
  options: {
    audit?: boolean;
    /**
     * Een transactie om in te schrijven, zodat een Theokot-verkoopdag en haar
     * shiften samen slagen of samen falen. Weglaten = de gewone client.
     */
    db?: Prisma.TransactionClient;
    /**
     * De verkoopdag waarvoor deze shift aangemaakt wordt. Bewust een optie en geen
     * veld van `ShiftInput`: dat type komt ook uit een request body, en een
     * koppeling aan een verkoopdag zet enkel "Week aanmaken".
     */
    theokotSessionId?: string;
  } = {},
) {
  const db = options.db ?? prisma;
  const shift = await db.shift.create({
    data: options.theokotSessionId ? { ...data, theokotSessionId: options.theokotSessionId } : data,
  });

  // Uit wanneer de aanroeper zelf één regel schrijft over de hele reeks: vijftien
  // losse regels voor één klik op "week aanmaken" verzuipen het logboek.
  if (options.audit !== false) {
    await logAudit({
      action: "create",
      entity: "shift",
      entityId: shift.id,
      target: shift.name,
      summary: `${shift.maxParticipants} plaats(en), ${shift.reward} bonnetje(s)`,
    });
  }

  return shift;
}
