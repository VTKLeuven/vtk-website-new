import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const slug = process.env.TICKETING_E2E_EVENT_SLUG;
const adminEmail = process.env.TICKETING_E2E_ADMIN_EMAIL;
const adminPassword = process.env.TICKETING_E2E_ADMIN_PASSWORD;
const eventId = process.env.TICKETING_E2E_EVENT_ID;
const outputDir = process.env.TICKETING_E2E_OUTPUT_DIR ?? "/tmp/vtk-ticketing-e2e";

test("access exchange scrubs credentials before the request and retains them for retry", async ({ page }) => {
  const orderId = "order_access_e2e";
  const access = "a".repeat(64);
  let requestCount = 0;
  let urlAtExchange = "";

  await page.route(`**/api/tickets/orders/${orderId}/access`, async (route) => {
    requestCount += 1;
    urlAtExchange = page.url();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "ACCESS_EXCHANGE_FAILED" }),
    });
  });

  await page.goto(`/tickets/toegang?orderId=${orderId}#access=${access}`);
  await expect.poll(() => requestCount).toBeGreaterThan(0);
  expect(urlAtExchange).not.toContain("orderId=");
  expect(urlAtExchange).not.toContain("access=");
  await expect(page).toHaveURL(/\/tickets\/toegang$/);

  const requestsBeforeRetry = requestCount;
  await page.getByRole("button", { name: "Opnieuw proberen" }).click();
  await expect.poll(() => requestCount).toBeGreaterThan(requestsBeforeRetry);
});

test("public purchase, admin dashboard and scanner", async ({ page }) => {
  test.skip(!slug || !adminEmail || !adminPassword || !eventId, "Ticketing E2E environment is not configured");
  await mkdir(outputDir, { recursive: true });

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "Galabal VTK 2027" })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "catalog-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "catalog-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`/tickets/${slug}`);
  await page.getByRole("button", { name: /Meer Studententicket/ }).click();
  await page.getByLabel("Naam aanwezige *").fill("E2E Deelnemer");
  await page.getByLabel("E-mail aanwezige *").fill("attendee-e2e@example.test");
  await page.getByLabel("Volledige naam *").fill("E2E Koper");
  await page.getByLabel("E-mailadres *").fill("buyer-e2e@example.test");
  await page.locator(".ticket-terms-check input[type=checkbox]").check();
  await page.screenshot({ path: path.join(outputDir, "checkout-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "checkout-mobile.png"), fullPage: true });
  const buyerSection = await page.locator("#buyer-heading").locator("xpath=ancestor::section").boundingBox();
  const orderSummary = await page.locator(".ticket-order-summary").boundingBox();
  expect(buyerSection).not.toBeNull();
  expect(orderSummary).not.toBeNull();
  expect(orderSummary!.y).toBeGreaterThan(buyerSection!.y);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Veilig betalen/ }).click();
  await page.waitForURL(/\/tickets\/bestelling\//);
  await expect(page.getByRole("heading", { name: "Je tickets zijn klaar" })).toBeVisible();
  await expect(page.getByAltText("QR-code van ticket")).toBeVisible();
  expect(page.url()).not.toContain("access=");
  const ticketNumber = await page.getByText(/^Ticketnummer · /).textContent();
  const ticketCode = ticketNumber?.split("·", 2)[1]?.trim();
  expect(ticketCode).toBeTruthy();

  const pdfUrl = await page.getByRole("link", { name: "Open ticket" }).getAttribute("href");
  expect(pdfUrl).toBeTruthy();
  const pdfResponse = await page.context().request.get(pdfUrl!);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  await page.screenshot({ path: path.join(outputDir, "issued-ticket.png"), fullPage: true });

  await page.goto(`/inloggen?next=/admin/tickets/${eventId}`);
  await page.getByLabel("E-mailadres").fill(adminEmail!);
  await page.getByLabel("Wachtwoord").fill(adminPassword!);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL(new RegExp(`/admin/tickets/${eventId}`));
  await expect(page.getByRole("heading", { name: "Galabal VTK 2027" })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "admin-dashboard.png"), fullPage: true });

  await page.goto(`/admin/tickets/${eventId}/deelnemers`);
  await expect(page.getByText("E2E Deelnemer").first()).toBeVisible();
  const exportResponse = await page.context().request.get(`/api/tickets/events/${eventId}/exports/attendees`);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");

  await page.goto(`/scan/${eventId}`);
  await expect(page.getByRole("heading", { name: "Galabal VTK 2027" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Camera starten/ }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "scanner-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Handmatig" }).click();
  await page.getByLabel("Ticketcode").fill(ticketCode!);
  await page.getByRole("button", { name: "Controleren" }).click();
  await expect(page.getByText("Ticket aanvaard")).toBeVisible();
  await expect(page.getByRole("button", { name: /Check-in van E2E Deelnemer terugdraaien/ })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "scanner-accepted-mobile.png"), fullPage: true });

  await expect(page.getByText("Ticket aanvaard")).toBeHidden();
  await page.waitForTimeout(800);
  await page.getByLabel("Ticketcode").fill(ticketCode!);
  await page.getByRole("button", { name: "Controleren" }).click();
  await expect(page.getByText("Ticket al gescand")).toBeVisible();

  await page.getByRole("button", { name: /Check-in van E2E Deelnemer terugdraaien/ }).click();
  await expect(page.getByText("Check-in teruggedraaid").first()).toBeVisible();
});
