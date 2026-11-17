"use server";

import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getGoogleConfig } from "@/lib/google/config";
import { getUser, listUsers, moveUser } from "@/lib/google/client";
import { knownOrgUnits } from "@/lib/google/orgUnits";
import { type OuPlan, parseOuMoves, planOuRestore } from "@/lib/google/ouRestore";

/**
 * Accounts terugzetten in hun organisatie-eenheid uit geplakte regels van het
 * logboek van de Admin console. Zie `lib/google/ouRestore.ts`.
 *
 * Nakijken en uitvoeren rekenen allebei opnieuw uit de tekst en uit wat Google
 * nu zegt; de knop vertrouwt niet op wat de browser eerder toonde. Een account
 * gaat enkel terug wanneer het nog staat waar de verhuizing het zette: wie
 * intussen bewust ergens anders gezet is, blijft daar.
 */

const MAX_ACCOUNTS = 400;

export type OuRow = OuPlan & {
  current: string | null;
  /** move: gaat terug; done: staat al goed; changed: intussen elders; missing: geen account. */
  status: "move" | "done" | "changed" | "missing";
  error?: string;
};

export type OuResult =
  | { status: "error"; code: "NOT_CONFIGURED" | "NOTHING_FOUND" | "TOO_MANY" }
  | { status: "preview"; rows: OuRow[] }
  | { status: "applied"; rows: OuRow[]; moved: number; failed: number };

async function inspect(text: string): Promise<OuResult> {
  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED" };
  const plans = planOuRestore(parseOuMoves(text));
  if (plans.length === 0) return { status: "error", code: "NOTHING_FOUND" };
  if (plans.length > MAX_ACCOUNTS) return { status: "error", code: "TOO_MANY" };

  const rows: OuRow[] = [];
  await pool(plans, 6, async (plan) => {
    try {
      const account = await getUser(cfg, plan.email);
      const current = account?.orgUnitPath ?? null;
      rows.push({
        ...plan,
        current,
        status: !account
          ? "missing"
          : current === plan.restoreTo
            ? "done"
            : current === plan.movedTo
              ? "move"
              : "changed",
      });
    } catch (err) {
      rows.push({ ...plan, current: null, status: "missing", error: err instanceof Error ? err.message : String(err) });
    }
  });
  rows.sort((a, b) => a.email.localeCompare(b.email));
  return { status: "preview", rows };
}

export async function previewOuRestoreAction(text: string): Promise<OuResult> {
  await requirePermission("googleAccounts.manage");
  return inspect(text);
}

export async function applyOuRestoreAction(text: string): Promise<OuResult> {
  await requirePermission("googleAccounts.manage");
  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED" };
  const preview = await inspect(text);
  if (preview.status !== "preview") return preview;

  let moved = 0;
  let failed = 0;
  const rows = preview.rows;
  await pool(
    rows.filter((r) => r.status === "move"),
    4,
    async (row) => {
      try {
        await moveUser(cfg, row.email, row.restoreTo);
        row.current = row.restoreTo;
        row.status = "done";
        moved++;
      } catch (err) {
        row.error = err instanceof Error ? err.message : String(err);
        failed++;
      }
    },
  );

  await logAudit({
    action: "update",
    entity: "user",
    target: "Organisatie-eenheden",
    summary: `${moved} accounts teruggezet in hun organisatie-eenheid uit het logboek van de Admin console${failed ? `, ${failed} mislukt` : ""}`,
  });
  return { status: "applied", rows, moved, failed };
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

// -----------------------------------------------------------------------------
// Accounts verplaatsen
// -----------------------------------------------------------------------------

export type MoveResult =
  | { status: "error"; code: "NOT_CONFIGURED" | "NOTHING_SELECTED" | "UNKNOWN_OU" | "TOO_MANY" }
  | { status: "done"; moved: number; failed: { email: string; error: string }[] };

/**
 * Verplaatst de aangevinkte accounts naar een organisatie-eenheid. Enkel naar
 * een OU waar nu al iemand in staat (of een van de OU's uit de instellingen):
 * de site mag de lijst van OU's niet lezen, en een tikfout in een pad geeft
 * anders per account een fout van Google.
 */
export async function moveAccountsAction(emails: string[], target: string): Promise<MoveResult> {
  await requirePermission("googleAccounts.manage");
  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED" };
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return { status: "error", code: "NOTHING_SELECTED" };
  if (unique.length > MAX_ACCOUNTS) return { status: "error", code: "TOO_MANY" };

  const directory = await listUsers(cfg);
  const known = knownOrgUnits(directory, cfg);
  if (!known.includes(target)) return { status: "error", code: "UNKNOWN_OU" };
  const byEmail = new Map(directory.map((u) => [u.primaryEmail.toLowerCase(), u]));

  let moved = 0;
  const failed: { email: string; error: string }[] = [];
  await pool(unique, 4, async (email) => {
    const account = byEmail.get(email);
    if (!account) {
      failed.push({ email, error: "geen account in de directory" });
      return;
    }
    if (account.orgUnitPath === target) return;
    try {
      await moveUser(cfg, email, target);
      moved++;
      await logAudit({
        action: "update",
        entity: "user",
        target: email,
        summary: `organisatie-eenheid ${account.orgUnitPath ?? "?"} → ${target}`,
      });
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return { status: "done", moved, failed };
}
