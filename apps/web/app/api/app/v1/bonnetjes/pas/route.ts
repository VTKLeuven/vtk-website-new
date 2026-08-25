import { prisma } from "@vtk/db";
import { z } from "zod";

import { corsPreflight } from "@/lib/cors";
import { requirePermission } from "@/lib/session";
import { SANDWICH_VOUCHER_COST } from "@/lib/theokot";
import { pickupForUser } from "@/lib/theokot-pickup";
import type { AppPassHolder } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { verifyPassToken } from "@/lib/app-api/tokens";
import { voucherBalance } from "@/lib/app-api/vouchers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wie is dit, en hoeveel heeft die staan.
 *
 * Bewust een stap apart van het afboeken. Wie achter een toog een QR scant, hoort
 * eerst de naam en het saldo te zien en dan pas een bedrag in te tikken; één
 * gecombineerde aanroep zou betekenen dat je afboekt bij iemand die je nog niet
 * herkend hebt. Het kost een halve seconde en het scheelt de discussie achteraf.
 *
 * De broodjesbestelling zit erbij voor wie ook aan de afhaalbalie mag staan. Dan
 * is het één beweging: scan de pas, geef het broodje, en boek de bonnetjes af.
 * Wie enkel `shift.rewardRedeem` heeft, krijgt dat stuk niet te zien, want dat is
 * andermans bestelling.
 */

const schema = z.object({ pass: z.string().min(10).max(512) });

export async function POST(request: Request) {
  try {
    const session = await requirePermission("shift.rewardRedeem");
    const { pass } = schema.parse(await readAppJson(request));

    const verified = verifyPassToken(pass);
    if (!verified.ok) {
      return appError(request, verified.reason, 400, {
        message:
          verified.reason === "PASS_EXPIRED"
            ? "Deze code is verlopen. Laat ze opnieuw tonen."
            : "Deze code hoort niet bij VTK.",
      });
    }

    const user = await prisma.user.findFirst({
      where: { id: verified.userId, active: true, deletedAt: null },
      select: { id: true, name: true, rNumber: true, avatarKey: true },
    });
    if (!user) {
      return appError(request, "PASS_INVALID", 400, { message: "Dit account bestaat niet meer." });
    }

    const mayHandOut =
      session.user.isSuperAdmin || session.permissions.includes("theokot.pickup" as never);

    const [vouchers, pickup] = await Promise.all([
      voucherBalance(user.id),
      mayHandOut ? pickupForUser(user.id) : Promise.resolve(null),
    ]);

    const order = pickup && pickup.ok ? pickup.orders.find((row) => row.status === "RESERVED") : null;

    const payload: AppPassHolder = {
      userId: user.id,
      name: user.name,
      rNumber: user.rNumber,
      avatarUrl: absoluteMediaUrl(request, user.avatarKey),
      vouchers,
      theokotOrder: order
        ? {
            orderId: order.orderId,
            status: order.status,
            totalCents: order.totalCents,
            lines: order.lines.map((line) => ({
              name: line.nameNl,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
            })),
            canRedeemVouchers:
              order.voucherRedemption === null && vouchers >= SANDWICH_VOUCHER_COST,
            voucherCost: SANDWICH_VOUCHER_COST,
          }
        : null,
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
