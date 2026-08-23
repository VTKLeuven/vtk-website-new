import "server-only";

import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import {
  disableForwarding,
  enableForwarding,
  ensureDefaultSendAs,
  moveUser,
  resetDefaultSendAs,
} from "./client";

/**
 * Wat een `@vtk.be`-account mag, afgeleid uit de posten en de kiesploeg.
 *
 * Zie docs/design-decisions.md, "De accountstaat is afgeleid, met een override".
 * De kern: dit wordt **berekend** en niet als losse knoppen bijgehouden, zodat
 * er één plek is waar staat wanneer iemand mag mailen.
 */

export type AccountState = "RESTRICTED" | "FULL";

export type StateInput = {
  /** Zit dit lid dit werkingsjaar in een post of werkgroep? */
  hasCurrentPost: boolean;
  /** Lidmaatschap van een kiesploeg, of `null`. */
  kiesploeg: { mailboxActive: boolean } | null;
};

/**
 * `null` betekent "wij hebben geen mening": geen post en geen kiesploeg. Dat is
 * bewust iets anders dan RESTRICTED. Een oud-praesidiumlid valt op 15 juli in
 * deze toestand, en dan hoort er niets te gebeuren in plaats van dat het zijn
 * mailbox verliest.
 */
export function desiredAccountState(input: StateInput): AccountState | null {
  if (input.hasCurrentPost) return "FULL";
  if (input.kiesploeg) return input.kiesploeg.mailboxActive ? "FULL" : "RESTRICTED";
  return null;
}

export type ApplyInput = {
  userId: string;
  name: string;
  googleEmail: string;
  /** Huidige, laatst toegepaste staat; `null` als er nog niets toegepast is. */
  current: AccountState | null;
  /** Kiesploegalias die de standaardafzender wordt in de beperkte staat. */
  alias?: string | null;
  /** Waar de mail naartoe gaat in de beperkte staat. */
  forwardTo?: string | null;
};

export type ApplyOutcome = {
  changed: boolean;
  /** Deelstappen die niet lukten; de OU-verhuizing is de enige die echt telt. */
  warnings: string[];
};

/**
 * Zet de staat van één account in Google.
 *
 * **Automatisch upgraden mag, automatisch degraderen niet.** Zonder die regel
 * verliest op 15 juli het hele vertrekkende praesidium in één reconcile zijn
 * mailbox en zijn verzendrecht, want hun memberships van vorig jaar tellen dan
 * niet meer mee. Een beheerder die de override uitzet, doet dat wél bewust en
 * geeft `allowDowngrade` mee.
 */
export async function applyAccountState(
  cfg: GoogleConfig,
  input: ApplyInput,
  desired: AccountState,
  { allowDowngrade = false }: { allowDowngrade?: boolean } = {},
): Promise<ApplyOutcome> {
  if (input.current === desired) return { changed: false, warnings: [] };
  if (input.current === "FULL" && desired === "RESTRICTED" && !allowDowngrade) {
    return { changed: false, warnings: [] };
  }

  const warnings: string[] = [];

  if (desired === "RESTRICTED") {
    if (cfg.restrictedOrgUnit) {
      await moveUser(cfg, input.googleEmail, cfg.restrictedOrgUnit);
    } else {
      // Zonder OU is er geen plek waar de routing-regel hangt, dus is er ook
      // niets dat het verzenden tegenhoudt. Dat hoort zichtbaar te zijn.
      warnings.push("geen beperkte organisatie-eenheid ingesteld; verzenden is niet geblokkeerd");
    }
    // De Gmail-stappen mogen falen zonder de verhuizing ongedaan te maken: die
    // eerste is de afdwinging, deze twee zijn het comfort.
    if (input.alias) {
      try {
        await ensureDefaultSendAs(cfg, input.googleEmail, input.alias);
      } catch (err) {
        warnings.push(`afzenderadres niet gezet: ${message(err)}`);
      }
    }
    if (input.forwardTo) {
      try {
        const { pending } = await enableForwarding(cfg, input.googleEmail, input.forwardTo);
        if (pending) {
          warnings.push(
            `doorsturen wacht op de bevestigingsmail bij ${input.forwardTo}`,
          );
        }
      } catch (err) {
        warnings.push(`doorsturen niet ingesteld: ${message(err)}`);
      }
    }
  } else {
    await moveUser(cfg, input.googleEmail, cfg.fullOrgUnit);
    try {
      await resetDefaultSendAs(cfg, input.googleEmail);
    } catch (err) {
      warnings.push(`standaardafzender niet teruggezet: ${message(err)}`);
    }
    try {
      await disableForwarding(cfg, input.googleEmail);
    } catch (err) {
      warnings.push(`doorsturen niet uitgezet: ${message(err)}`);
    }
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { googleAccountState: desired },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: input.userId,
    target: input.name,
    summary:
      desired === "FULL"
        ? `Google-account volwaardig gemaakt (${input.googleEmail})`
        : `Google-account beperkt (${input.googleEmail})`,
  });

  return { changed: true, warnings };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
