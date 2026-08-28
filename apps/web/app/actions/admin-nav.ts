"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { ADMIN_NAV_KEYS } from "@/lib/admin-nav";
import { requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * Pint een admin-tab vast bovenaan de zijbalk, of maakt hem weer los. Elke
 * ingelogde gebruiker doet dit voor zichzelf; er is geen permissie aan
 * verbonden, want een pin toont niets wat je nog niet mocht zien (de zijbalk
 * rendert enkel de tabs die je rechten je geven).
 *
 * Geen `SaveForm` hier: de bevestiging is dat de tab zichtbaar naar Vastgepind
 * verhuist. De client toont enkel een toast wanneer het misloopt.
 */
export async function toggleAdminNavPinAction(key: string, pinned: boolean): Promise<SaveState> {
  const session = await requireSession();
  if (!ADMIN_NAV_KEYS.has(key)) return saveError("UNKNOWN_TAB");

  const userId = session.user.id;

  if (pinned) {
    // Achteraan toevoegen, zodat een nieuwe pin de bestaande volgorde niet
    // omgooit. `order` telt vanaf het hoogste bestaande nummer.
    const last = await prisma.userAdminNavPin.findFirst({
      where: { userId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await prisma.userAdminNavPin.upsert({
      where: { userId_key: { userId, key } },
      update: {},
      create: { userId, key, order: (last?.order ?? -1) + 1 },
    });
  } else {
    await prisma.userAdminNavPin.deleteMany({ where: { userId, key } });
  }

  // De zijbalk zit in de admin-layout, dus elke adminpagina toont hem. Het
  // segment hervalideren volstaat om de nieuwe pinnen overal te tonen.
  revalidatePath("/[locale]/admin", "layout");
  return saveOk();
}
