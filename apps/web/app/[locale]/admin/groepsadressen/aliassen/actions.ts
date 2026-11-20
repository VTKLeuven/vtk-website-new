"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig, type GoogleConfig } from "@/lib/google/config";
import {
  addAlias,
  addGroupAlias,
  GoogleError,
  removeAlias,
  removeGroupAlias,
} from "@/lib/google/client";
import { forgetDirectoryCache } from "@/lib/google/directoryCache";
import { directoryAddresses, type AddressOwner } from "@/lib/google/aliases";
import { normaliseAddress } from "@/lib/google/recipients";

/**
 * Aliassen van groepen en accounts beheren (Google Admin › Aliassen).
 *
 * Rechtstreeks in Google: de site bewaart geen aliassen, dus er is niets om
 * gelijk te houden. Enkel de kiesploegadressen zet de sync zelf; het scherm
 * markeert die. Een verwachte fout (een bezet adres, een domein dat Google niet
 * kent) wordt een rode toast, geen error boundary.
 */

const PATH = "/admin/groepsadressen/aliassen";
const ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

function revalidate() {
  forgetDirectoryCache();
  revalidatePath(PATH);
}

async function setup(): Promise<GoogleConfig | null> {
  await requirePermission("mailgroups.manage");
  return getGoogleConfig();
}

function googleCode(err: unknown): string {
  if (err instanceof GoogleError) {
    if (err.status === 409) return "ALIAS_TAKEN";
    if (err.status === 400 || err.status === 412) return "GOOGLE_REFUSED";
    if (err.status === 404) return "OWNER_NOT_FOUND";
  }
  throw err;
}

async function add(cfg: GoogleConfig, owner: AddressOwner, alias: string) {
  if (owner.kind === "group") await addGroupAlias(cfg, owner.email, alias);
  else await addAlias(cfg, owner.email, alias);
}

async function remove(cfg: GoogleConfig, owner: AddressOwner, alias: string) {
  if (owner.kind === "group") await removeGroupAlias(cfg, owner.email, alias);
  else await removeAlias(cfg, owner.email, alias);
}

/** Een nieuwe alias op een groep of een account. */
export async function addAliasAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const alias = normaliseAddress(String(formData.get("alias") ?? ""), cfg.domain);
  const ownerAddress = normaliseAddress(String(formData.get("owner") ?? ""), cfg.domain);
  if (!ADDRESS.test(alias)) return saveError("INVALID_ALIAS");

  const directory = await directoryAddresses(cfg);
  const owner = directory.byAddress.get(ownerAddress);
  if (!owner) return saveError("OWNER_NOT_FOUND");
  const taken = directory.byAddress.get(alias);
  if (taken) return saveError(taken === owner ? "ALREADY_ON_OWNER" : "ALIAS_TAKEN");

  try {
    await add(cfg, owner, alias);
  } catch (err) {
    return saveError(googleCode(err));
  }
  await logAudit({
    action: "create",
    entity: "googleAlias",
    target: alias,
    summary: `alias ${alias} toegevoegd aan ${owner.email}`,
  });
  revalidate();
  return saveOk();
}

/**
 * Een alias wijzigen: een ander adres, een andere eigenaar, of beide.
 *
 * Een nieuw adres komt er eerst bij en pas daarna gaat het oude weg, zodat er
 * nooit een moment is waarop geen van beide werkt. Verhuist hetzelfde adres
 * naar een andere eigenaar, dan kan dat niet (Google aanvaardt een adres maar
 * één keer): dan gaat het eerst weg, en komt het bij een fout terug op zijn
 * oude plaats.
 */
export async function changeAliasAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const oldAlias = normaliseAddress(String(formData.get("oldAlias") ?? ""), cfg.domain);
  const alias = normaliseAddress(String(formData.get("alias") ?? ""), cfg.domain);
  const ownerAddress = normaliseAddress(String(formData.get("owner") ?? ""), cfg.domain);
  if (!ADDRESS.test(alias)) return saveError("INVALID_ALIAS");

  const directory = await directoryAddresses(cfg);
  const current = directory.byAddress.get(oldAlias);
  if (!current || current.email.toLowerCase() === oldAlias) return saveError("ALIAS_NOT_FOUND");
  const owner = directory.byAddress.get(ownerAddress);
  if (!owner) return saveError("OWNER_NOT_FOUND");
  if (alias === oldAlias && owner === current) return saveError("NOTHING_CHANGED");
  const taken = directory.byAddress.get(alias);
  if (taken && alias !== oldAlias) return saveError("ALIAS_TAKEN");

  try {
    if (alias === oldAlias) {
      await remove(cfg, current, oldAlias);
      try {
        await add(cfg, owner, alias);
      } catch (err) {
        await add(cfg, current, oldAlias).catch(() => null);
        return saveError(googleCode(err));
      }
    } else {
      await add(cfg, owner, alias);
      await remove(cfg, current, oldAlias);
    }
  } catch (err) {
    return saveError(googleCode(err));
  }
  await logAudit({
    action: "update",
    entity: "googleAlias",
    target: alias,
    summary: `alias ${oldAlias} (${current.email}) gewijzigd naar ${alias} (${owner.email})`,
  });
  revalidate();
  return saveOk();
}

/** Een alias weghalen. Het hoofdadres van de groep of het account blijft. */
export async function removeAliasAction(formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const alias = normaliseAddress(String(formData.get("alias") ?? ""), cfg.domain);
  const directory = await directoryAddresses(cfg);
  const owner = directory.byAddress.get(alias);
  if (!owner || owner.email.toLowerCase() === alias) return saveError("ALIAS_NOT_FOUND");
  try {
    await remove(cfg, owner, alias);
  } catch (err) {
    return saveError(googleCode(err));
  }
  await logAudit({
    action: "delete",
    entity: "googleAlias",
    target: alias,
    summary: `alias ${alias} weggehaald bij ${owner.email}`,
  });
  revalidate();
  return saveOk();
}
