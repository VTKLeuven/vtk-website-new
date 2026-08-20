import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/admin/authorization-preview/stop/route";

beforeEach(() => {
  process.env.VTK_MAIN_URL = "https://vtk.be";
});

afterEach(() => {
  delete process.env.VTK_MAIN_URL;
});

function stopRequest(locale: "nl" | "en") {
  const body = new FormData();
  body.set("locale", locale);
  return new Request("http://localhost:3000/api/admin/authorization-preview/stop", {
    method: "POST",
    body,
  });
}

describe("authorization preview stop redirect", () => {
  it("uses the configured public origin instead of the internal request origin", async () => {
    const response = await POST(stopRequest("nl"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://vtk.be/admin/it/preview");
  });

  it("keeps the English locale in the return path", async () => {
    const response = await POST(stopRequest("en"));
    expect(response.headers.get("location")).toBe("https://vtk.be/en/admin/it/preview");
  });
});
