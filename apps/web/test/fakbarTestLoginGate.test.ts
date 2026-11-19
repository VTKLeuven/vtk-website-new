import { describe, expect, it } from "vitest";
import { mayUseTestLogin, testLoginMode } from "../../fakbar/lib/test-login-gate";

/**
 * De poort van de test-login van de Fakbar. Staat in `apps/web` omdat
 * `npm run verify` enkel de suites van @vtk/web en @vtk/logistiek draait.
 *
 * Vroeger kende de Fakbar enkel `true`, en dat liet iedereen de persona `it`
 * (superadmin) spelen. Nu betekent `true` hetzelfde als bij de uitleendienst.
 */
describe("testLoginMode (fakbar)", () => {
  it("kent drie standen en valt anders terug op uit", () => {
    expect(testLoginMode({ FAKBAR_TEST_LOGIN: "true" })).toBe("gated");
    expect(testLoginMode({ FAKBAR_TEST_LOGIN: "open" })).toBe("open");
    expect(testLoginMode({ FAKBAR_TEST_LOGIN: "" })).toBe("off");
    expect(testLoginMode({})).toBe("off");
    expect(testLoginMode({ FAKBAR_TEST_LOGIN: "TRUE" })).toBe("off");
  });
});

describe("mayUseTestLogin (fakbar)", () => {
  it("laat niemand door wanneer het uit staat", () => {
    expect(mayUseTestLogin("off", { canManage: true })).toBe(false);
  });

  it("laat in de ongegrendelde stand ook een bezoeker zonder sessie door", () => {
    expect(mayUseTestLogin("open", null)).toBe(true);
  });

  it("laat met true enkel wie de fakbar beheert door", () => {
    expect(mayUseTestLogin("gated", { canManage: true })).toBe(true);
    expect(mayUseTestLogin("gated", { canManage: false })).toBe(false);
    expect(mayUseTestLogin("gated", null)).toBe(false);
  });
});
