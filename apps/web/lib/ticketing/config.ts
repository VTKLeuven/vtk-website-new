import "server-only";

const DEFAULT_RESERVATION_MINUTES = 31;
const MAX_RESERVATION_MINUTES = 24 * 60;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function ticketingBaseUrl(): string {
  const raw =
    process.env.TICKETING_PUBLIC_URL ??
    process.env.VTK_MAIN_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";

  return new URL(raw).origin;
}

export function reservationMinutes(): number {
  return Math.min(
    MAX_RESERVATION_MINUTES,
    Math.max(
      DEFAULT_RESERVATION_MINUTES,
      positiveInteger(process.env.TICKETING_RESERVATION_MINUTES, DEFAULT_RESERVATION_MINUTES)
    )
  );
}

export function ticketTokenSecret(): string {
  const secret = process.env.TICKETING_TOKEN_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    assertProductionSecret("TICKETING_TOKEN_SECRET", secret);
    return secret!;
  }
  return secret || process.env.BETTER_AUTH_SECRET?.trim() || "vtk-local-ticketing-secret-change-me";
}

export type PaymentProviderName = "mollie" | "bancontact" | "mock";

const PAYMENT_PROVIDER_NAMES: readonly string[] = ["mollie", "bancontact", "mock"];

export function configuredPaymentProvider(): PaymentProviderName {
  const configured = process.env.TICKETING_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (configured === "mollie") return "mollie";
  if (configured === "bancontact") return "bancontact";
  if (configured === "mock" && process.env.NODE_ENV !== "production") return "mock";
  if (!configured && process.env.NODE_ENV !== "production") return "mock";
  throw new Error("TICKETING_PAYMENT_PROVIDER must be set to mollie in production");
}

/**
 * De betaalwijzen die een koper te zien krijgt, in de volgorde waarin ze
 * geconfigureerd zijn. `TICKETING_PAYMENT_METHODS=bancontact,mollie`.
 *
 * Blijft die leeg, dan valt dit terug op de ene provider uit
 * `TICKETING_PAYMENT_PROVIDER`. Dat is bewust: zolang het
 * Bancontact-contract er niet is, gedraagt de site zich precies zoals
 * voordien, en is er geen keuzescherm voor een keuze van één.
 *
 * De volgorde hier is de technische volgorde (welke methodes bestaan), niet de
 * volgorde op het scherm: die hangt aan de taal en staat in
 * `lib/ticketing/paymentMethods.ts`.
 */
export function enabledPaymentMethods(): PaymentProviderName[] {
  const raw = process.env.TICKETING_PAYMENT_METHODS?.trim();
  if (!raw) return [configuredPaymentProvider()];

  const methods: PaymentProviderName[] = [];
  for (const entry of raw.split(",")) {
    const name = entry.trim().toLowerCase();
    if (!name) continue;
    if (!PAYMENT_PROVIDER_NAMES.includes(name)) {
      throw new Error(`TICKETING_PAYMENT_METHODS contains an unknown method: ${name}`);
    }
    if (name === "mock" && process.env.NODE_ENV === "production") {
      throw new Error("TICKETING_PAYMENT_METHODS may not contain mock in production");
    }
    if (!methods.includes(name as PaymentProviderName)) {
      methods.push(name as PaymentProviderName);
    }
  }
  if (methods.length === 0) {
    throw new Error("TICKETING_PAYMENT_METHODS must name at least one payment method");
  }
  return methods;
}

export function maintenanceSecret(): string | null {
  const secret = process.env.TICKETING_MAINTENANCE_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    assertProductionSecret("TICKETING_MAINTENANCE_SECRET", secret);
  }
  return secret || null;
}

function assertProductionSecret(name: string, secret: string | undefined): void {
  if (
    !secret ||
    secret.length < 43 ||
    /(replace|change.?me|example|placeholder|your.?secret)/i.test(secret)
  ) {
    throw new Error(`${name} must contain at least 32 random bytes in production`);
  }
}
