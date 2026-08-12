import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { createTicketCredential, secureTokenHash } from "@/lib/ticketing/crypto";
import { scannerBootstrap, scanTicketBatch } from "@/lib/ticketing/scanner";
import { verifyOffline } from "@/components/ticketing/scanner/offline";
import type { ScannerManifest } from "@/components/ticketing/scanner/types";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@vtk/auth/server", () => ({ getSession: vi.fn(async () => null) }));

/**
 * Offline scannen tegen een echte database.
 *
 * Dit is het pad dat op een fuif of jobbeurs zonder netwerk moet werken: het
 * toestel haalt vooraf een manifest op, beslist daarmee zelf, en stuurt de
 * wachtrij later door. De waarde zit in de combinatie, niet in de losse stukken:
 * dat wat het toestel offline aanvaardt ook echt door de server aanvaard wordt,
 * en dat een tweede scan van hetzelfde ticket alsnog als dubbel terugkomt.
 */
describe.sequential("offline scannen", () => {
  const ids = {
    user: randomUUID(),
    group: randomUUID(),
    event: randomUUID(),
    pool: randomUUID(),
    type: randomUUID(),
    order: randomUUID(),
    device: randomUUID(),
  };
  // Uniek per run. `Ticket.publicCode` is uniek, en opruimen kan niet (zie
  // afterAll), dus een vaste code zou de tweede run blokkeren.
  const run = randomUUID().replace(/-/g, "").slice(0, 10);
  const codes = [`Off${run}A`, `Off${run}B`, `Off${run}C`];

  beforeAll(async () => {
    // Bewust geen superadmin: dan leest lib/session.ts de preview-cookie, en
    // `cookies()` bestaat niet buiten een request. Met een echte grant hieronder
    // loopt de test bovendien door het gewone rechtenpad.
    vi.mocked(getSession).mockResolvedValue({
      user: { id: ids.user, name: "Scanner Test", email: `${ids.user}@example.test`, isSuperAdmin: false },
      groups: [],
      permissions: [],
      roleIds: [],
    } as never);

    await prisma.user.create({
      data: { id: ids.user, name: "Scanner Test", email: `${ids.user}@example.test` },
    });
    await prisma.group.create({
      data: { id: ids.group, code: `scan-${ids.group}`, slug: `scan-${ids.group}`, nameNl: "T", nameEn: "T" },
    });
    await prisma.ticketEvent.create({
      data: {
        id: ids.event,
        ownerGroupId: ids.group,
        slug: `scan-${ids.event}`,
        titleNl: "Offline testevent",
        startsAt: new Date("2027-03-01T18:00:00.000Z"),
        endsAt: new Date("2027-03-02T02:00:00.000Z"),
        status: "PUBLISHED",
        createdById: ids.user,
      },
    });
    await prisma.ticketEventUserGrant.create({
      data: { eventId: ids.event, userId: ids.user, role: "OWNER", grantedById: ids.user },
    });
    await prisma.ticketInventoryPool.create({
      data: { id: ids.pool, eventId: ids.event, code: "GENERAL", nameNl: "Alles", capacity: 50 },
    });
    await prisma.ticketType.create({
      data: {
        id: ids.type,
        eventId: ids.event,
        inventoryPoolId: ids.pool,
        code: "STANDARD",
        nameNl: "Standaard",
        unitPriceCents: 0,
      },
    });
    await prisma.ticketOrder.create({
      data: {
        id: ids.order,
        eventId: ids.event,
        reference: `SCAN-${ids.order.slice(0, 8)}`,
        accessTokenHash: secureTokenHash(`scan-order:${ids.order}`),
        accessExpiresAt: new Date("2027-06-01T00:00:00.000Z"),
        status: "PAID",
        // De database bewaakt dat een betaalde bestelling ook een betaalmoment
        // heeft (TicketOrder_paid_timestamp_check).
        paidAt: new Date("2026-12-01T12:00:00.000Z"),
        buyerName: "Koper",
        buyerEmail: "koper@example.test",
        subtotalCents: 0,
        totalCents: 0,
      },
    });

    for (const [index, code] of codes.entries()) {
      const orderItemId = randomUUID();
      await prisma.ticketOrderItem.create({
        data: {
          id: orderItemId,
          orderId: ids.order,
          eventId: ids.event,
          ticketTypeId: ids.type,
          inventoryPoolId: ids.pool,
          attendeeName: `Bezoeker ${index + 1}`,
          ticketTypeCode: "STANDARD",
          ticketTypeName: "Standaard",
          unitPriceCents: 0,
          totalCents: 0,
        },
      });
      await prisma.ticket.create({
        data: {
          eventId: ids.event,
          orderItemId,
          publicCode: code,
          credentialVersion: 1,
          credentialHash: secureTokenHash(createTicketCredential(code, 1)),
          status: "VALID",
        },
      });
    }
  });

  afterAll(async () => {
    // Bewust geen opruiming. `TicketScanLog` is append-only (databasetrigger) en
    // verwijst met `onDelete: Restrict` naar event, ticket, toestel en gate: zodra
    // deze test één keer gescand heeft, is die keten per ontwerp onverwijderbaar.
    // Daarom draagt elke run eigen id's en eigen ticketcodes, zodat het residu een
    // volgende run nooit in de weg zit.
    vi.mocked(getSession).mockResolvedValue(null as never);
  });

  it("geeft een manifest mee waarmee een toestel offline kan beslissen", async () => {
    const bootstrap = await scannerBootstrap(ids.event);
    expect(bootstrap.manifest.complete).toBe(true);
    expect(bootstrap.manifest.ticketCount).toBe(3);

    const manifest = bootstrap.manifest as ScannerManifest;
    const entry = manifest.tickets.find((t) => t.code === codes[0]);
    expect(entry).toMatchObject({ version: 1, checkedIn: false, type: "Standaard" });

    // Wat het toestel offline zou beslissen voor een echte QR van dit event.
    const verdict = verifyOffline(manifest, createTicketCredential(codes[0]!, 1), new Set());
    expect(verdict.kind).toBe("accepted");
  });

  it("verwerkt de wachtrij en meldt de tweede scan van hetzelfde ticket als dubbel", async () => {
    const scan = (code: string) => ({
      credential: createTicketCredential(code, 1),
      clientScanId: randomUUID(),
      gateId: null,
      deviceId: ids.device,
      clientScannedAt: new Date().toISOString(),
    });

    const eerste = scan(codes[0]!);
    const tweede = scan(codes[0]!); // zelfde ticket, andere deur
    const derde = scan(codes[1]!);

    const { results, stats } = await scanTicketBatch(ids.event, {
      scans: [eerste, tweede, derde],
    });

    expect(results.map((r) => r.result)).toEqual(["ACCEPTED", "ALREADY_USED", "ACCEPTED"]);
    expect(stats.checkedIn).toBe(2);
  });

  it("is veilig om opnieuw te versturen: dezelfde clientScanId telt niet dubbel", async () => {
    const herhaald = {
      credential: createTicketCredential(codes[2]!, 1),
      clientScanId: randomUUID(),
      gateId: null,
      deviceId: ids.device,
      clientScannedAt: new Date().toISOString(),
    };

    const eerste = await scanTicketBatch(ids.event, { scans: [herhaald] });
    expect(eerste.results[0]!.result).toBe("ACCEPTED");
    expect(eerste.stats.checkedIn).toBe(3);

    // Netwerk viel weg na het verwerken maar voor het antwoord aankwam: het
    // toestel stuurt dezelfde scan nog eens.
    const opnieuw = await scanTicketBatch(ids.event, { scans: [herhaald] });
    expect(opnieuw.results[0]!.result).toBe("ACCEPTED");
    expect(opnieuw.stats.checkedIn).toBe(3);
  });

  it("weigert offline een code die niet in het manifest staat", async () => {
    const manifest = (await scannerBootstrap(ids.event)).manifest as ScannerManifest;
    const verdict = verifyOffline(manifest, createTicketCredential("NietBestaand123", 1), new Set());
    expect(verdict).toEqual({ kind: "rejected", reason: "unknown" });
  });
});
