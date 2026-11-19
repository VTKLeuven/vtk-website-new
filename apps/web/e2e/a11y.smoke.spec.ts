import { expect, test, type Page } from "@playwright/test";

const axeScriptPath = require.resolve("axe-core/axe.min.js");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type AxeNode = {
  target: string[];
  failureSummary?: string;
};

type AxeViolation = {
  id: string;
  impact?: string;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
};

async function expectNoA11yViolations(page: Page, contextLabel: string) {
  await page.addScriptTag({ path: axeScriptPath });
  const violations = await page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: { run: (doc: Document, opts: unknown) => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations;
  }, WCAG_TAGS);

  const summary = violations
    .map(
      (v) =>
        `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.helpUrl})\n` +
        v.nodes
          .slice(0, 5)
          .map((n) => `  - ${n.target.join(" ")}: ${n.failureSummary ?? ""}`)
          .join("\n"),
    )
    .join("\n\n");

  expect(violations, `${contextLabel} failed Axe WCAG 2.2 AA check:\n${summary}`).toEqual([]);
}

const ANONYMOUS_ROUTES = [
  "/",
  "/en",
  "/kalender",
  "/nieuws",
  "/tickets",
  "/formulieren",
  "/fakbar-huren",
  "/en/fakbar-huren",
  "/inloggen",
  "/registreren",
  "/en/contact",
  "/zoeken",
  "/sample",
  "/uitschrijven",
  "/theokot",
  "/pal-plus",
] as const;

test.describe("WCAG 2.2 AA automated smoke suite", () => {
  test("anonymous public routes pass Axe at desktop (1440x900)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of ANONYMOUS_ROUTES) {
      await page.goto(route, { waitUntil: "load" });
      await expect(page.locator("main#main")).toHaveCount(1);
      await expectNoA11yViolations(page, `desktop 1440x900 ${route}`);
    }
  });

  test("mobile reflow (320x640) and mobile menu drawer pass Axe", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const route of ["/", "/kalender", "/tickets", "/inloggen"] as const) {
      await page.goto(route, { waitUntil: "load" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `horizontal overflow on mobile ${route}`).toBeLessThanOrEqual(0);
      await expectNoA11yViolations(page, `mobile 320x640 ${route}`);
    }

    await page.goto("/", { waitUntil: "load" });
    const menuToggle = page.locator("button.nav-menu-trigger");
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    await expectNoA11yViolations(page, "mobile 320x640 / (drawer open)");
    await page.keyboard.press("Escape");
    await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  });

  test("interactive dialogs and locale fallback routes pass Axe", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("button.nav-menu-trigger")).toBeVisible();
    await expect(page.locator(".vtk-site-header .nav-links")).toBeHidden();
    await expectNoA11yViolations(page, "1000x900 /");

    await page.setViewportSize({ width: 1200, height: 900 });
    for (const headerRoute of ["/", "/en"] as const) {
      await page.goto(headerRoute, { waitUntil: "load" });
      await expect(page.locator(".vtk-site-header .nav-links")).toBeVisible();
      const lastItemBox = await page.locator(".vtk-site-header .nav-item").last().boundingBox();
      const navRightBox = await page.locator(".vtk-site-header .nav-right").boundingBox();
      expect(lastItemBox, `last nav-item box on ${headerRoute}`).not.toBeNull();
      expect(navRightBox, `nav-right box on ${headerRoute}`).not.toBeNull();
      expect(
        lastItemBox!.x + lastItemBox!.width,
        `header nav items must not overlap .nav-right at 1200px on ${headerRoute}`,
      ).toBeLessThanOrEqual(navRightBox!.x);
      await expectNoA11yViolations(page, `1200x900 ${headerRoute}`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/kalender", { waitUntil: "load" });
    const subscribeBtn = page.locator("button.subscribe-open");
    await expect(subscribeBtn).toBeVisible();
    await subscribeBtn.click();
    await expect(page.locator("dialog.subscribe-dialog[open]")).toBeVisible();
    await expectNoA11yViolations(page, "/kalender (subscribe dialog open)");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.subscribe-dialog[open]")).toHaveCount(0);
  });

  test("seeded and member routes pass Axe when authenticated", async ({ page }) => {
    test.skip(process.env.A11Y_E2E_SEEDED !== "1", "Requires seeded local dev database");
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/inloggen", { waitUntil: "load" });
    const revealBtn = page.getByRole("button", { name: /klik hier/i });
    if (await revealBtn.isVisible()) {
      await revealBtn.click();
    }
    await page.getByLabel("E-mailadres").fill(process.env.A11Y_E2E_EMAIL ?? "sport@vtk.prototype");
    await page.getByLabel("Wachtwoord").fill(process.env.A11Y_E2E_PASSWORD ?? "prototype");
    await page.getByRole("button", { name: /^Inloggen$/ }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/inloggen"));

    const memberRoutes = [
      "/ledenportaal",
      "/account",
      "/theokot",
      "/pal-plus",
      "/en/shift",
      "/media",
    ] as const;

    for (const route of memberRoutes) {
      await page.goto(route, { waitUntil: "load" });
      await expect(page.locator("main#main")).toHaveCount(1);
      await expectNoA11yViolations(page, `authenticated 1440x900 ${route}`);
    }

    await page.goto("/account", { waitUntil: "load" });
    const detailsTab = page.getByRole("tab", { name: /Mijn gegevens/i });
    if (await detailsTab.isVisible()) {
      await detailsTab.click();
      await expectNoA11yViolations(page, "authenticated /account (Mijn gegevens tab)");
    }
  });
});
