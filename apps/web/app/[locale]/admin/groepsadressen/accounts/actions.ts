"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getGoogleConfig } from "@/lib/google/config";
import { applyAccountState, desiredAccountState } from "@/lib/google/accountState";
import { type CreatedAccount, createAccounts } from "@/lib/google/provision";
import { collectTargets, parseSourceKey } from "./targets";

/**
 * Accounts aanmaken. Zie `lib/google/provision.ts` voor het waarom.
 *
 * De uitkomst is meer dan "gelukt": er komen wachtwoorden uit die je één keer
 * te zien krijgt. Daarom een eigen state en geen `SaveForm`.
 */

export type ProvisionState =
  | { status: "idle" }
  | { status: "error"; code: string; nonce: number }
  | { status: "done"; created: CreatedAccount[]; nonce: number };

export const PROVISION_IDLE: ProvisionState = { status: "idle" };

export async function createGoogleAccountsAction(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  await requirePermission("googleAccounts.manage");

  const sourceKey = String(formData.get("bron") ?? "");
  const source = parseSourceKey(sourceKey);
  if (!source) return { status: "error", code: "INVALID_INPUT", nonce: Date.now() };

  const selected = new Set(formData.getAll("userId").map(String));
  if (selected.size === 0) return { status: "error", code: "NOTHING_SELECTED", nonce: Date.now() };

  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED", nonce: Date.now() };

  // Het plan wordt hier opnieuw berekend en niet uit het formulier gelezen: een
  // adres dat de browser meestuurt, is een adres dat de browser kan wijzigen.
  let plan;
  try {
    plan = await collectTargets(cfg, source);
  } catch {
    return { status: "error", code: "GOOGLE_UNREACHABLE", nonce: Date.now() };
  }

  const rows = plan.rows
    .filter((row) => row.blocked === null && selected.has(row.userId))
    .map((row) => ({ userId: row.userId, email: row.email, alias: row.alias }));
  if (rows.length === 0) return { status: "error", code: "NOTHING_SELECTED", nonce: Date.now() };

  const created = await createAccounts(cfg, rows, {
    // Een kiesploegaccount komt meteen in de beperkte OU terecht; daar hangt de
    // routing-regel die het verzenden vanaf het primaire adres tegenhoudt.
    orgUnitPath:
      plan.kiesploeg && cfg.restrictedOrgUnit ? cfg.restrictedOrgUnit : cfg.fullOrgUnit,
  });

  // De staat meteen zetten in plaats van op de reconcile te wachten: wie net
  // een account kreeg, hoort niet vijf minuten lang te kunnen mailen.
  const year = currentWorkingYear();
  for (const account of created) {
    if (account.error || !account.password) continue;
    const member = plan.rows.find((row) => row.userId === account.userId);
    const hasPost =
      (await prisma.groupMembership.count({
        where: { userId: account.userId, year },
      })) > 0;
    // Dezelfde regel als de reconcile gebruikt, en niet een tweede kopie ervan:
    // twee implementaties van "wanneer mag iemand mailen" lopen gegarandeerd
    // uit elkaar.
    const desired =
      desiredAccountState({
        hasCurrentPost: hasPost,
        kiesploeg: plan.kiesploeg ? { mailboxActive: member?.mailboxActive ?? false } : null,
      }) ?? "FULL";
    try {
      await applyAccountState(
        cfg,
        {
          userId: account.userId,
          name: account.name,
          googleEmail: account.email,
          current: null,
          alias: member?.alias ?? null,
          forwardTo: member?.forwardTo ?? null,
        },
        desired,
      );
    } catch {
      // Het account bestaat; de staat probeert de reconcile straks opnieuw.
    }
  }

  await logAudit({
    action: "create",
    entity: "user",
    target: "Google-accounts",
    summary: `${created.filter((c) => !c.error).length} accounts aangemaakt`,
  });

  revalidatePath("/admin/groepsadressen/accounts");
  revalidatePath("/admin/kiesploeg");
  return { status: "done", created, nonce: Date.now() };
}
