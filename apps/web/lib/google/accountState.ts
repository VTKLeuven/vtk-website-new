import "server-only";

import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import {
  disableForwarding,
  enableForwarding,
  ensureDefaultSendAs,
  getUser,
  moveUser,
  resetDefaultSendAs,
  setUserSuspended,
} from "./client";

/**
 * Wat een `@vtk.be`-account mag, afgeleid uit de posten en de kiesploeg.
 *
 * Zie docs/design-decisions.md, "De accountstaat is afgeleid, met een override".
 * De kern: dit wordt **berekend** en niet als losse knoppen bijgehouden, zodat
 * er één plek is waar staat wanneer iemand mag mailen.
 */

export type AccountState = "RESTRICTED" | "ALIAS_SENDER" | "FULL" | "SUSPENDED";

export type StateInput = {
  /** Zit dit lid dit werkingsjaar in een post of werkgroep? */
  hasCurrentPost: boolean;
  /** Lidmaatschap van een actieve kiesploeg, of `null`. */
  kiesploeg: {
    /** Mag mailen, maar enkel vanaf het kiesploegadres. */
    sendFromAlias: boolean;
    /** Is 15 juli van het werkingsjaar van de ploeg voorbij? */
    tookOffice: boolean;
    /** Een beheerder hief de schorsing bewust op. */
    keepAccount: boolean;
  } | null;
  /**
   * Mag de sync iemand schorsen? Enkel wanneer de postverdeling van het nieuwe
   * werkingsjaar effectief ingevoerd is. Zonder die voorwaarde schorst de
   * eerste reconcile na 15 juli de hele ploeg wanneer niemand de posten op tijd
   * invulde.
   */
  suspensionAllowed: boolean;
};

/**
 * `null` betekent "wij hebben geen mening": geen post en geen kiesploeg. Dat is
 * bewust iets anders dan RESTRICTED. Een oud-praesidiumlid valt op 15 juli in
 * deze toestand, en dan hoort er niets te gebeuren in plaats van dat het zijn
 * mailbox verliest.
 */
export function desiredAccountState(input: StateInput): AccountState | null {
  if (input.hasCurrentPost) return "FULL";
  const kiesploeg = input.kiesploeg;
  if (!kiesploeg) return null;
  if (!kiesploeg.tookOffice) return kiesploeg.sendFromAlias ? "ALIAS_SENDER" : "RESTRICTED";
  // De ploeg trad aan en dit lid kreeg geen post: verkozen maar niet in het
  // praesidium. Zie docs/design-decisions.md, "Na de verkiezing".
  if (kiesploeg.keepAccount || !input.suspensionAllowed) return null;
  return "SUSPENDED";
}

/**
 * Mag de sync van `current` naar `desired` gaan zonder dat een mens erom vroeg?
 *
 * **Automatisch upgraden mag, automatisch degraderen niet.** Zonder die regel
 * verliest op 15 juli het hele vertrekkende praesidium in één reconcile zijn
 * mailbox en zijn verzendrecht, want hun memberships van vorig jaar tellen dan
 * niet meer mee. Een volwaardig account wordt dus nooit vanzelf beperkt of
 * geschorst.
 *
 * Schorsen mag enkel bij een account dat de kiesploeg maakte (beperkt of
 * afzender vanaf de alias). Een account waarvan we de staat nooit zetten
 * (`null`), raken we ook niet aan: dat is van iemand anders.
 */
export function transitionAllowed(current: AccountState | null, desired: AccountState): boolean {
  if (current === desired) return false;
  if (current === "FULL") return false;
  if (desired === "SUSPENDED") return current === "RESTRICTED" || current === "ALIAS_SENDER";
  return true;
}

/**
 * Staat het account in een organisatie-eenheid die de site gebruikt om te
 * beperken (enkel ontvangen, of enkel mailen vanaf het kiesploegadres)? Enkel
 * dan haalt "volwaardig maken" het eruit. Een account in een eigen OU van de
 * kring (/Praesidium, /Statix) blijft daar.
 */
export function isInLimitingOrgUnit(
  orgUnitPath: string | null | undefined,
  ous: { restrictedOrgUnit: string | null; aliasSenderOrgUnit: string | null },
): boolean {
  if (!orgUnitPath) return false;
  return [ous.restrictedOrgUnit, ous.aliasSenderOrgUnit].some(
    (ou) => Boolean(ou) && ou !== "/" && (orgUnitPath === ou || orgUnitPath.startsWith(`${ou}/`)),
  );
}

/**
 * Zette de site zelf het doorsturen en de standaardafzender? Enkel bij een
 * account dat ze beperkte (kiesploeg). Bij een account waarvan de staat nog
 * leeg was, zijn die instellingen van de persoon zelf en blijven ze staan.
 */
export function setBySite(current: AccountState | null): boolean {
  return current === "RESTRICTED" || current === "ALIAS_SENDER" || current === "SUSPENDED";
}

export type ApplyInput = {
  userId: string;
  name: string;
  googleEmail: string;
  /** Huidige, laatst toegepaste staat; `null` als er nog niets toegepast is. */
  current: AccountState | null;
  /** Kiesploegalias die de standaardafzender wordt bij ALIAS_SENDER. */
  alias?: string | null;
  /** Waar de mail naartoe gaat zolang het lid niet volwaardig is. */
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
 * Wat mag zonder dat iemand erom vroeg, staat in {@link transitionAllowed}. Een
 * beheerder die bewust degradeert of een schorsing opheft, geeft `force` mee.
 */
export async function applyAccountState(
  cfg: GoogleConfig,
  input: ApplyInput,
  desired: AccountState,
  { force = false }: { force?: boolean } = {},
): Promise<ApplyOutcome> {
  if (input.current === desired) return { changed: false, warnings: [] };
  if (!force && !transitionAllowed(input.current, desired)) {
    return { changed: false, warnings: [] };
  }

  const warnings: string[] = [];

  // Een geschorst account eerst terug openzetten; anders lukken de Gmail-stappen
  // hieronder niet.
  if (input.current === "SUSPENDED" && desired !== "SUSPENDED") {
    await setUserSuspended(cfg, input.googleEmail, false);
  }

  if (desired === "SUSPENDED") {
    await setUserSuspended(cfg, input.googleEmail, true);
  } else if (desired === "RESTRICTED" || desired === "ALIAS_SENDER") {
    const orgUnit = desired === "RESTRICTED" ? cfg.restrictedOrgUnit : cfg.aliasSenderOrgUnit;
    if (orgUnit) {
      await moveUser(cfg, input.googleEmail, orgUnit);
    } else {
      // Zonder OU is er geen plek waar de routing-regel hangt, dus is er ook
      // niets dat het verzenden tegenhoudt. Dat hoort zichtbaar te zijn.
      warnings.push(
        desired === "RESTRICTED"
          ? "geen organisatie-eenheid voor kiesploegleden die enkel ontvangen; verzenden is niet geblokkeerd"
          : "geen organisatie-eenheid voor kiesploegafzenders; het account bleef staan waar het stond",
      );
    }
    // De Gmail-stappen mogen falen zonder de verhuizing ongedaan te maken: die
    // eerste is de afdwinging, deze twee zijn het comfort.
    if (desired === "ALIAS_SENDER" && input.alias) {
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
          warnings.push(`doorsturen wacht op de bevestigingsmail bij ${input.forwardTo}`);
        }
      } catch (err) {
        warnings.push(`doorsturen niet ingesteld: ${message(err)}`);
      }
    }
  } else {
    // Volwaardig maken is iets terugdraaien wat de site zelf deed, niet het
    // account naar een vaste plek zetten. Vroeger ging elk account dat FULL
    // werd naar `fullOrgUnit` ("/"), ook bij de eerste keer dat de sync het
    // zag: na het koppelen verhuisde zo iedereen uit /Praesidium, /Statix en
    // /Oude Zakken naar /, en ging zijn eigen doorsturen uit. Zie
    // docs/google-workspace.md, "Vallen".
    const account = await getUser(cfg, input.googleEmail);
    if (account && isInLimitingOrgUnit(account.orgUnitPath, cfg)) {
      await moveUser(cfg, input.googleEmail, cfg.fullOrgUnit);
    }
    if (setBySite(input.current)) {
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
    summary: `${STATE_SUMMARY[desired]} (${input.googleEmail})`,
  });

  return { changed: true, warnings };
}

const STATE_SUMMARY: Record<AccountState, string> = {
  FULL: "Google-account volwaardig gemaakt",
  RESTRICTED: "Google-account beperkt: enkel ontvangen",
  ALIAS_SENDER: "Google-account beperkt: mailen enkel vanaf het kiesploegadres",
  SUSPENDED: "Google-account geschorst: geen post na de verkiezing",
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
