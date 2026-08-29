"use server";

import { requireSession } from "@/lib/session";
import { saveOk, type SaveAction, type SaveState } from "@/lib/saveState";

/**
 * De opslaan-actie van een voorvertoning: valideert de sessie en doet verder
 * niets.
 *
 * De onboarding en de jaarlijkse studiebevestiging zijn de twee schermen die
 * niemand ooit terugziet nadat hij ze één keer heeft doorlopen. Precies daardoor
 * is het moeilijk te controleren of ze nog kloppen: je eigen account is al
 * onboarded, en het jaar rolt maar één keer per jaar om. De voorvertoning onder
 * Admin -> IT draait daarom de **echte** formulieren met deze actie eronder, zodat
 * een beheerder ze kan bekijken en de knoppen kan indrukken zonder zijn profiel
 * te wijzigen of zijn studiebevestiging te stempelen.
 *
 * Bewust een echte server action en geen `onSubmit`-blokkade in de client: zo
 * doorlopen het formulier, de validatie in de browser en de verzending precies
 * hetzelfde pad als bij een echt lid, en zie je dus ook echt wat een lid ziet.
 */
export async function previewNoopAction(
  ...args: Parameters<SaveAction>
): Promise<SaveState> {
  // De handtekening van `SaveAction` ligt vast, maar geen van beide argumenten
  // heeft hier betekenis: er wordt niets gelezen en niets bewaard.
  void args;
  const session = await requireSession();
  // Superadmin-only, net als de rest van de IT-groep. Deze actie schrijft niets,
  // maar ze hoort niet aanroepbaar te zijn vanaf een willekeurige pagina.
  if (!session.user.isSuperAdmin) throw new Error("forbidden");
  return saveOk();
}
