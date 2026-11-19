import type { CreatedAccount } from "@/lib/google/provision";

/**
 * De uitkomst van "Accounts aanmaken". Staat apart van `actions.ts`: een
 * `"use server"`-bestand mag enkel async functies exporteren, en een object
 * ernaast liet de hele pagina crashen ("Deze pagina kon niet geladen worden").
 */
export type ProvisionState =
  | { status: "idle" }
  | { status: "error"; code: string; nonce: number }
  | { status: "done"; created: CreatedAccount[]; nonce: number };

export const PROVISION_IDLE: ProvisionState = { status: "idle" };
