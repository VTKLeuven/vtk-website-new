import { beforeEach, describe, expect, it, vi } from "vitest";
import { signCudiRequest } from "@/lib/cudi/signature";

/**
 * De cursusdienst in de app: vtk.be spreekt ondertekend met cudi
 * (`lib/cudi/client.ts`). De vector hieronder staat letterlijk ook in
 * `tests/unit/vtk-app-signature.test.ts` bij cudi: wijzigt het schema aan één
 * kant, dan faalt een van de twee in plaats van dat de app stil 401's krijgt.
 */

const mocks = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession, getCurrentSession: mocks.requireSession }));
vi.mock("@vtk/db", () => ({ prisma: { user: { findUnique: vi.fn() }, setting: { findUnique: vi.fn() } } }));

import { GET as overview } from "@/app/api/app/v1/cudi/route";
import { POST as placeOrder } from "@/app/api/app/v1/cudi/bestellen/route";

describe("cudi in de app", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.requireSession.mockResolvedValue({ user: { id: "u1" }, permissions: [], groups: [] });
  });

  it("tekent zoals cudi nakijkt", () => {
    expect(
      signCudiRequest({
        secret: "x".repeat(40),
        method: "post",
        path: "/api/integrations/vtk-app/orders",
        timestamp: 1700000000,
        user: "eyJzdWIiOiJ1MSJ9",
        body: '{"items":[]}',
      }),
    ).toBe("sha256=836fc6a32d56d285722b75ec85107e147fc90cf5df67eda30ad1dbefd537adc7");
  });

  it("zegt dat de cursusdienst niet gekoppeld is zonder geheim, in plaats van te falen", async () => {
    vi.stubEnv("CUDI_APP_SECRET", "");
    const response = await overview(new Request("https://vtk.test/api/app/v1/cudi"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: false, orders: [], ordering: { open: false } });
  });

  it("vraagt een login", async () => {
    mocks.requireSession.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const response = await overview(new Request("https://vtk.test/api/app/v1/cudi"));
    expect(response.status).toBe(401);
  });

  it("weigert een bestelling zonder artikels voor ze cudi bereikt", async () => {
    vi.stubEnv("CUDI_APP_SECRET", "s".repeat(40));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await placeOrder(
      new Request("https://vtk.test/api/app/v1/cudi/bestellen", { method: "POST", body: JSON.stringify({ items: [] }) }),
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
