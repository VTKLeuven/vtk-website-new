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
export async function createShift(data: ShiftInput, options: { audit?: boolean } = {}) {
  const shift = await prisma.shift.create({ data });

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
