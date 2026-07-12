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

export type PaymentProviderName = "stripe" | "mock";

export function configuredPaymentProvider(): PaymentProviderName {
  const configured = process.env.TICKETING_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (configured === "stripe") return "stripe";
  if (configured === "mock" && process.env.NODE_ENV !== "production") return "mock";
  if (!configured && process.env.NODE_ENV !== "production") return "mock";
  throw new Error("TICKETING_PAYMENT_PROVIDER must be set to stripe in production");
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
