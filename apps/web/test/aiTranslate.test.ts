import { describe, expect, it } from "vitest";
import {
  AiTranslateError,
  AiTranslator,
  buildTranslationMessages,
  parseTranslationResponse,
} from "@/lib/ai/translate";
import { parseBilingualFieldName } from "@/lib/ai/fieldNames";

describe("parseBilingualFieldName", () => {
  it("herkent camelCase, snake_case en losse taalnamen", () => {
    expect(parseBilingualFieldName("titleNl")).toEqual({ base: "title", lang: "nl" });
    expect(parseBilingualFieldName("titleEn")).toEqual({ base: "title", lang: "en" });
    expect(parseBilingualFieldName("contentMdEn")).toEqual({ base: "contentMd", lang: "en" });
    expect(parseBilingualFieldName("body_nl")).toEqual({ base: "body", lang: "nl" });
    expect(parseBilingualFieldName("body_en")).toEqual({ base: "body", lang: "en" });
    expect(parseBilingualFieldName("nl")).toEqual({ base: "", lang: "nl" });
    expect(parseBilingualFieldName("en")).toEqual({ base: "", lang: "en" });
  });

  it("negeert gewone veldnamen die toevallig op nl/en eindigen in kleine letters", () => {
    expect(parseBilingualFieldName("channel")).toBeNull();
    expect(parseBilingualFieldName("token")).toBeNull();
    expect(parseBilingualFieldName("open")).toBeNull();
    expect(parseBilingualFieldName("slug")).toBeNull();
    expect(parseBilingualFieldName("")).toBeNull();
  });
});

describe("parseTranslationResponse", () => {
  it("parst een standaard JSON-antwoord", () => {
    const out = parseTranslationResponse(
      JSON.stringify({ translations: { title: "24-hour run", cta: "Sign up" } }),
      ["title", "cta"],
    );
    expect(out).toEqual({ title: "24-hour run", cta: "Sign up" });
  });

  it("stript <think>-blokken en markdown-codefences", () => {
    const raw = `<think>Even nadenken over de vertaling...</think>\n\`\`\`json\n{"translations":{"title":"Welcome to Theokot"}}\n\`\`\``;
    expect(parseTranslationResponse(raw, ["title"])).toEqual({ title: "Welcome to Theokot" });
  });

  it("aanvaardt een plat JSON-object zonder translations-wrapper", () => {
    expect(parseTranslationResponse('{"title":"Hello"}', ["title"])).toEqual({ title: "Hello" });
  });

  it("gooit BAD_RESPONSE bij ongeldige of lege JSON", () => {
    expect(() => parseTranslationResponse("Geen json hier", ["title"])).toThrow(AiTranslateError);
    expect(() => parseTranslationResponse('{"translations":{}}', ["title"])).toThrow(
      AiTranslateError,
    );
  });
});

describe("buildTranslationMessages", () => {
  it("voegt enkel markdown-instructies toe wanneer minstens één veld markdown is", () => {
    const plain = buildTranslationMessages("nl-to-en", [{ key: "title", text: "Hallo" }]);
    expect(plain[0].content).not.toContain("Preserve all Markdown syntax");

    const md = buildTranslationMessages("nl-to-en", [
      { key: "body", text: "**Hallo**", markdown: true },
    ]);
    expect(md[0].content).toContain("Preserve all Markdown syntax");
  });
});

describe("AiTranslator", () => {
  it("roept /chat/completions aan met Bearer-header wanneer apiKey gezet is", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    let seenModel = "";

    const mockFetch: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      const headers = new Headers(init?.headers);
      seenAuth = headers.get("authorization");
      const parsedBody = JSON.parse(String(init?.body)) as { model: string };
      seenModel = parsedBody.model;
      return new Response(
        JSON.stringify({
          model: "gemma-4-26b-a4b",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: { title: "Opening hours" },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const translator = new AiTranslator(
      { apiUrl: "https://llm.vtk.be/api/", apiKey: "sk-test", model: "kenny-active" },
      { fetchImpl: mockFetch },
    );
    const res = await translator.translate("nl-to-en", [{ key: "title", text: "Openingsuren" }]);

    expect(seenUrl).toBe("https://llm.vtk.be/api/chat/completions");
    expect(seenAuth).toBe("Bearer sk-test");
    expect(seenModel).toBe("kenny-active");
    expect(res).toEqual({
      model: "gemma-4-26b-a4b",
      translations: { title: "Opening hours" },
    });
  });

  it("laat Authorization weg wanneer apiKey leeg is (Tailscale vLLM)", async () => {
    let seenAuth: string | null = "unset";
    const mockFetch: typeof fetch = async (_input, init) => {
      seenAuth = new Headers(init?.headers).get("authorization");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translations":{"title":"Hi"}}' } }],
        }),
        { status: 200 },
      );
    };

    const translator = new AiTranslator(
      { apiUrl: "http://kenny:8000/v1", apiKey: "", model: "kenny-active" },
      { fetchImpl: mockFetch },
    );
    await translator.translate("nl-to-en", [{ key: "title", text: "Hoi" }]);
    expect(seenAuth).toBeNull();
  });

  it("vertaalt 401 naar UNAUTHORIZED en lege url naar NOT_CONFIGURED", async () => {
    const unconfigured = new AiTranslator({ apiUrl: "", apiKey: "", model: "kenny-active" });
    await expect(
      unconfigured.translate("nl-to-en", [{ key: "a", text: "b" }]),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });

    const unauthorized = new AiTranslator(
      { apiUrl: "https://llm.vtk.be/api", apiKey: "bad", model: "kenny-active" },
      { fetchImpl: async () => new Response("nope", { status: 401 }) },
    );
    await expect(
      unauthorized.translate("nl-to-en", [{ key: "a", text: "b" }]),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
