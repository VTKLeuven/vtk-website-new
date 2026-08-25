import { prisma } from "@vtk/db";
import { z } from "zod";

import { corsPreflight } from "@/lib/cors";
import { readBarStatus } from "@/lib/elixir/status";
import { rewardProgress } from "@/lib/fakscanner";
import { registerCheckin } from "@/lib/fakscanner-server";
import { requireSession } from "@/lib/session";
import type { AppFakCheckin } from "@/lib/app-api/contract";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { verifyFakCheckinToken } from "@/lib/app-api/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inchecken aan de bar met je telefoon in plaats van met je studentenkaart.
 *
 * Naast de kaartlezer hangt een QR met een ondertekende code erin; wie ze scant,
 * krijgt dezelfde check-in als wie zijn kaart voorlegt. Dat is de bedoeling: de
 * kaartlezer blijft, dit is er een tweede weg naartoe voor wie zijn kaart niet op
 * zak heeft.
 *
 * **De eerlijke beperking.** Een code die daar maanden hangt, kan gefotografeerd
 * worden, en dan check je in vanuit je zetel. Daarom staan er drie grendels op,
 * en geen ervan zit in het token zelf:
 *
 * 1. **De bar moet open gemeten worden.** `readBarStatus` leest de geluidsmeting
 *    van 't ElixIr; is die verouderd of stil, dan telt er niets. Dat is de
 *    grendel die er echt toe doet, want hij maakt de code buiten de openingsuren
 *    waardeloos.
 * 2. **Eén keer per bardag**, precies zoals bij de kaartlezer. Dat zit in
 *    `registerCheckin` en wordt hier niet overgedaan.
 * 3. **Er moet een account met een r-nummer achter zitten.** De stand hangt aan
 *    het r-nummer; wie er geen heeft, kan niet meesparen.
 *
 * Wie de code doorstuurt naar iemand die niet in de bar staat, geeft die persoon
 * dus hoogstens een check-in op een avond dat de bar toch openstaat. Dat is een
 * bewuste afweging en ze staat in `docs/design-decisions.md`.
 */

const schema = z.object({ code: z.string().min(8).max(512) });

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { code } = schema.parse(await readAppJson(request));

    const spot = verifyFakCheckinToken(code);
    if (!spot) {
      return appError(request, "INVALID_CODE", 400, {
        message: "Deze code hoort niet bij de fakbar.",
      });
    }

    const now = new Date();
    const bar = await readBarStatus(now);
    if (!bar || bar.stale || !bar.isOpen) {
      return appError(request, "BAR_CLOSED", 409, {
        message: "'t ElixIr staat nu niet als open geregistreerd. Inchecken kan enkel in de bar.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, rNumber: true },
    });
    if (!user?.rNumber) {
      return appError(request, "NO_RNUMBER", 409, {
        message: "Je account heeft geen r-nummer, dus je stand kan nergens aan hangen.",
      });
    }

    const outcome = await registerCheckin(user.rNumber, now);
    const { toNext } = rewardProgress(outcome.config, outcome.total);

    const payload: AppFakCheckin = {
      counted: outcome.counted,
      name: user.name,
      total: outcome.total,
      points: outcome.points,
      double: outcome.double,
      freeBeer: outcome.reward,
      toNextBeer: toNext,
      message: outcome.counted ? null : "Je was vanavond al ingecheckt.",
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
