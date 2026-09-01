import "server-only";

import { prisma } from "@vtk/db";
import { defaultMailFrom } from "@vtk/mail";
import type { Expense } from "@prisma/client";
import type { SessionPayload } from "@vtk/auth";
import { getCurrentSession, requireSession } from "@/lib/session";

/**
 * Toegang en configuratie voor de rekeningen. De permissies zelf staan in
 * `packages/db/src/permissions.ts`; hier staat wat ze concreet mogen.
 *
 * De les uit billsheet: daar liet `requireAdmin` een post-beheerder door voor
 * `setPaid`, `setBooked`, `updateBill` én `deleteBill` zonder ooit te kijken of
 * de rekening bij zijn post hoorde. Enkel de *lijst* werd clientside gefilterd,
 * dus wie een id kende, kon met een POST elke rekening van de hele kring op
 * betaald zetten. Elke check hieronder is daarom serverkant en op de rekening
 * zelf, niet op het scherm.
 */

export type ExpenseAccess = {
  session: SessionPayload;
  /** Mag indienen en zijn eigen rekeningen zien. */
  canSubmit: boolean;
  /** Alles: alle posten, terugbetalen, inboeken, doorsturen, instellingen. */
  canManageAll: boolean;
  /** Beheert de rekeningen van de eigen post(en): bekijken, bewerken, wissen. */
  canManagePost: boolean;
  /** De post-id's waarvoor `canManagePost` geldt (leeg bij `canManageAll`). */
  postScope: string[];
  /** Ziet het beheeroverzicht (alle posten of enkel de eigen). */
  canSeeOverview: boolean;
};

export async function getExpenseAccess(): Promise<ExpenseAccess | null> {
  const session = await getCurrentSession();
  return session ? accessFor(session) : null;
}

/**
 * Voor beheerschermen: de sessie is verplicht (anders naar het aanmeldscherm),
 * de rechten niet. Het scherm zegt zelf "geen toegang", wat leesbaarder is dan
 * de error boundary die een gegooide `FORBIDDEN` oplevert.
 */
export async function expenseAccess(redirectTo: string): Promise<ExpenseAccess> {
  return accessFor(await requireSession(redirectTo));
}

function accessFor(session: SessionPayload): ExpenseAccess {
  const has = (code: string) =>
    session.user.isSuperAdmin || session.permissions.includes(code);

  const canManageAll = has("expenses.manage");
  const canManagePost = !canManageAll && has("expenses.managePost");

  return {
    session,
    // Wie mag beheren mag per definitie ook indienen; anders staat een
    // penningmeester met een bonnetje in de hand voor een gesloten formulier.
    canSubmit: has("expenses.submit") || canManageAll || canManagePost,
    canManageAll,
    canManagePost,
    postScope: canManagePost ? session.groups.map((group) => group.id) : [],
    canSeeOverview: canManageAll || canManagePost,
  };
}

/**
 * Voor server actions en API-routes: gooit `UNAUTHENTICATED` of `FORBIDDEN`, die
 * `authErrorResponse` in een 401/403 omzet. Geen redirect, want een fetch heeft
 * niets aan een aanmeldpagina.
 */
export async function requireExpenseAccess(): Promise<ExpenseAccess> {
  const access = await getExpenseAccess();
  if (!access) throw new Error("UNAUTHENTICATED");
  if (!access.canSubmit && !access.canSeeOverview) throw new Error("FORBIDDEN");
  return access;
}

/**
 * Het `where`-fragment dat de rekeningen afbakent die deze gebruiker mag zien.
 * `undefined` = geen beperking (volledig beheer).
 */
export function visibilityWhere(access: ExpenseAccess) {
  if (access.canManageAll) return undefined;
  if (access.canManagePost) {
    // Eigen posten plus wat je zelf indiende: anders verdwijnt je eigen rekening
    // uit beeld zodra je ze op naam van een andere post zet.
    return {
      OR: [
        { groupId: { in: access.postScope } },
        { submittedById: access.session.user.id },
      ],
    };
  }
  return { submittedById: access.session.user.id };
}

type ExpenseGate = Pick<Expense, "groupId" | "submittedById" | "paidAt" | "sentAt" | "bookedAt">;

/** Mag deze gebruiker deze rekening openen (bonnetje, blad, detail)? */
export function canView(access: ExpenseAccess, expense: ExpenseGate): boolean {
  if (access.canManageAll) return true;
  if (expense.submittedById === access.session.user.id) return true;
  return access.canManagePost && expense.groupId !== null && access.postScope.includes(expense.groupId);
}

/**
 * Mag deze gebruiker deze rekening nog wijzigen of wissen?
 *
 * Billsheet blokkeerde bewerken zodra `paid` aan stond ("Paid bills cannot be
 * edited"): het bedrag op het blad moet overeenkomen met wat er uitbetaald is.
 * Diezelfde grens geldt hier, en ze loopt door tot na het doorsturen en
 * inboeken; een indiener mag daarnaast zijn eigen rekening corrigeren zolang er
 * niets van dat alles gebeurd is.
 */
export function canEdit(access: ExpenseAccess, expense: ExpenseGate): boolean {
  if (expense.paidAt || expense.sentAt || expense.bookedAt) {
    // Enkel wie alles beheert kan een verwerkte rekening nog rechtzetten, en dan
    // nog: eerst het vinkje weghalen. Zie `canManageState`.
    return false;
  }
  if (access.canManageAll) return true;
  if (expense.submittedById === access.session.user.id) return true;
  return access.canManagePost && expense.groupId !== null && access.postScope.includes(expense.groupId);
}

/** Terugbetalen, inboeken en doorsturen: enkel volledig beheer. */
export function canManageState(access: ExpenseAccess): boolean {
  return access.canManageAll;
}

// -----------------------------------------------------------------------------
// Configuratie (Setting-tabel)
// -----------------------------------------------------------------------------

export const EXPENSE_CONFIG_KEY = "expenses.config";

export type ExpenseConfig = {
  /** Het adres van de boekhouder waar het blad standaard naartoe gaat. */
  accountantEmail: string;
  /** Afzender van die mail. Leeg = de standaardafzender van de site. */
  fromEmail: string;
  /** Regels die de indiener boven het formulier te zien krijgt. Markdown. */
  guidelinesNl: string;
  guidelinesEn: string;
};

export const DEFAULT_EXPENSE_CONFIG: ExpenseConfig = {
  accountantEmail: "",
  fromEmail: "",
  guidelinesNl: "",
  guidelinesEn: "",
};

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function parseExpenseConfig(raw: unknown): ExpenseConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_EXPENSE_CONFIG;
  const value = raw as Record<string, unknown>;
  return {
    accountantEmail: str(value.accountantEmail, DEFAULT_EXPENSE_CONFIG.accountantEmail).trim(),
    fromEmail: str(value.fromEmail, DEFAULT_EXPENSE_CONFIG.fromEmail).trim(),
    guidelinesNl: str(value.guidelinesNl, DEFAULT_EXPENSE_CONFIG.guidelinesNl),
    guidelinesEn: str(value.guidelinesEn, DEFAULT_EXPENSE_CONFIG.guidelinesEn),
  };
}

/**
 * De afzender waarmee het blad vertrekt, zoals ze in de inbox van de boekhouder
 * staat. Leeg gelaten in de instellingen betekent: de standaardafzender van de
 * site. Het voorbeeldvenster toont deze tekst, dus ze moet kloppen.
 */
export function expenseSenderLabel(config: ExpenseConfig): string {
  return config.fromEmail.trim() || defaultMailFrom();
}

export async function getExpenseConfig(): Promise<ExpenseConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: EXPENSE_CONFIG_KEY } });
    return parseExpenseConfig(row?.value);
  } catch {
    return DEFAULT_EXPENSE_CONFIG;
  }
}
