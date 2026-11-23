import { describe, expect, it } from "vitest";
import { RESEND_COOLDOWN_MS, resendDecision } from "@/lib/ticketing/resendDecision";

const now = new Date("2026-11-22T22:42:10Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const row = (
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "DEAD",
  sentAt: Date | null = null,
  id = status.toLowerCase(),
) => ({ id, status, sentAt, availableAt: now });

describe("bevestiging opnieuw versturen", () => {
  it("zet er een in de rij wanneer er nog niets is", () => {
    expect(resendDecision([], now)).toEqual({ kind: "queue" });
  });

  it("zet er geen tweede bij terwijl de eerste nog in de rij staat", () => {
    // Zo kreeg een koper 132 keer dezelfde mail: elke klik maakte een rij bij.
    expect(resendDecision([row("PENDING")], now)).toEqual({ kind: "alreadyQueued" });
    expect(resendDecision([row("PROCESSING")], now)).toEqual({ kind: "alreadyQueued" });
  });

  it("weigert vlak na een verstuurde mail", () => {
    const sentAt = ago(30_000);
    expect(resendDecision([row("SENT", sentAt)], now)).toEqual({ kind: "recentlySent", sentAt });
  });

  it("verstuurt opnieuw wanneer de vorige lang genoeg geleden vertrok", () => {
    expect(resendDecision([row("SENT", ago(RESEND_COOLDOWN_MS + 1))], now)).toEqual({ kind: "queue" });
  });

  it("kijkt naar de laatste verstuurde, niet naar de eerste", () => {
    const rows = [row("SENT", ago(3 * 86_400_000), "oud"), row("SENT", ago(10_000), "net")];
    expect(resendDecision(rows, now).kind).toBe("recentlySent");
  });

  it("probeert een mislukte poging meteen opnieuw in plaats van er een naast te zetten", () => {
    expect(resendDecision([row("FAILED", null, "f1")], now)).toEqual({ kind: "retry", messageId: "f1" });
  });

  it("negeert een opgegeven poging (DEAD)", () => {
    expect(resendDecision([row("DEAD")], now)).toEqual({ kind: "queue" });
  });
});
