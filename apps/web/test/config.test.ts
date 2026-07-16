import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maintenanceSecret,
  reservationMinutes,
  ticketTokenSecret,
} from "@/lib/ticketing/config";

afterEach(() => vi.unstubAllEnvs());

describe("ticket production secrets", () => {
  it("rejects documented placeholders and short secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TICKETING_TOKEN_SECRET", "replace-with-a-separate-random-secret");
    vi.stubEnv("TICKETING_MAINTENANCE_SECRET", "too-short");
    expect(() => ticketTokenSecret()).toThrow("32 random bytes");
    expect(() => maintenanceSecret()).toThrow("32 random bytes");
  });

  it("accepts separately configured long random-looking values", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TICKETING_TOKEN_SECRET", "fR2kB7vM9pQ4xT8zN3cD6sH1jL5wY0uA2eG7iK9oP4r");
    vi.stubEnv("TICKETING_MAINTENANCE_SECRET", "mA8vC2xZ6qW1nR5tY9uI3oP7sD4fG0hJ2kL6bN8eV1c");
    expect(ticketTokenSecret()).toHaveLength(43);
    expect(maintenanceSecret()).toHaveLength(43);
  });
});

describe("ticket reservation duration", () => {
  it("stays within the payment provider checkout expiry window", () => {
    vi.stubEnv("TICKETING_RESERVATION_MINUTES", "10");
    expect(reservationMinutes()).toBe(31);

    vi.stubEnv("TICKETING_RESERVATION_MINUTES", "2000");
    expect(reservationMinutes()).toBe(24 * 60);
  });
});
