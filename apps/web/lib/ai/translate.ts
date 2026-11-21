import type { AiConfig } from "./config";

export type TranslateDirection = "nl-to-en" | "en-to-nl";

export type TranslateFieldInput = {
  key: string;
  text: string;
  markdown?: boolean;
};

export type TranslateResult = {
  translations: Record<string, string>;
  model: string;
};

export type AiTranslateErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "BAD_RESPONSE"
  | "UPSTREAM_ERROR";

export class AiTranslateError extends Error {
  readonly code: AiTranslateErrorCode;
  readonly status?: number;

  constructor(code: AiTranslateErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AiTranslateError";
    this.code = code;
    this.status = status;
  }
}

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

/**
 * Bouwt de systeem- en gebruikersprompts voor het vertalen van een batch
 * adminvelden. Meerdere velden gaan samen in één call zodat toon en
 * terminologie consistent blijven over titel, beschrijving en knoppen.
 */
export function buildTranslationMessages(
  direction: TranslateDirection,
  fields: TranslateFieldInput[],
): ChatMessage[] {
  const fromLang = direction === "nl-to-en" ? "Dutch (Belgian/Flemish)" : "English";
  const toLang = direction === "nl-to-en" ? "English" : "Dutch (Belgian/Flemish, natural student-association tone)";
  const hasMarkdown = fields.some((f) => f.markdown);

  const systemLines = [
    `You are a professional translator for VTK (Vlaamse Technische Kring), the engineering student association at KU Leuven in Belgium.`,
    `Translate each value in the provided JSON object from ${fromLang} to ${toLang}.`,
    `Rules:`,
    `- Return ONLY a valid JSON object with a single key "translations" mapping each input key to its translated string. Keep every key identical.`,
    `- Do not add commentary, notes, or markdown code fences around the JSON.`,
    `- Keep proper nouns, VTK-specific names, and untranslatable terms intact: VTK, Vlaamse Technische Kring, Theokot, 't ElixIr, Het Bakske, Ir.Reëel, KU Leuven, Arenberg, 24-urenloop, PAL+, GroCo, Cudi, Fakbar, Alma.`,
    `- Preserve all URLs, email addresses, placeholders (like {{form}}, {{name}}, {count}), dates, times, prices, and numbers verbatim.`,
    `- Match the conciseness and register of the original text (short button labels stay short; formal rules stay clear).`,
  ];

  if (hasMarkdown) {
    systemLines.push(
      `- Some fields contain Markdown. Preserve all Markdown syntax (headings, bold, italics, bullet lists, links [label](url) — translate only the label, never the URL — images, tables, line breaks, and blockquotes).`,
    );
  }

  const payload: Record<string, string> = {};
  for (const field of fields) {
    payload[field.key] = field.text;
  }

  return [
    { role: "system", content: systemLines.join("\n") },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ];
}

/**
 * Haalt het JSON-vertaalobject uit het modelantwoord. Modellen wikkelen JSON
 * soms in ```json ... ```-blokken of laten <think>...</think> voorafgaan; dit
 * stript beide vooraleer we parsen.
 */
export function parseTranslationResponse(
  rawContent: string,
  expectedKeys: string[],
): Record<string, string> {
  const cleaned = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Soms zet een model een korte zin voor of na het JSON-object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new AiTranslateError("BAD_RESPONSE", "AI response did not contain valid JSON");
    }
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new AiTranslateError("BAD_RESPONSE", "AI response contained malformed JSON");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AiTranslateError("BAD_RESPONSE", "AI response JSON was not an object");
  }

  const obj = parsed as Record<string, unknown>;
  let source: Record<string, unknown> =
    obj.translations && typeof obj.translations === "object" && !Array.isArray(obj.translations)
      ? (obj.translations as Record<string, unknown>)
      : obj;
  if (source.fields && typeof source.fields === "object" && !Array.isArray(source.fields)) {
    source = source.fields as Record<string, unknown>;
  }

  const result: Record<string, string> = {};
  for (const key of expectedKeys) {
    const val = source[key];
    if (typeof val === "string") {
      result[key] = val;
    }
  }

  if (Object.keys(result).length === 0) {
    throw new AiTranslateError("BAD_RESPONSE", "AI response did not include any expected translation keys");
  }

  return result;
}

/**
 * Herbruikbare OpenAI-compatible AI-vertaalklasse. Werkt met vLLM (kenny),
 * Open WebUI (`https://llm.vtk.be/api`) en elke andere OpenAI-compatible API.
 */
export class AiTranslator {
  private readonly config: AiConfig;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    config: AiConfig,
    options?: {
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {
    this.config = config;
    this.timeoutMs = options?.timeoutMs ?? 60_000;
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private get chatCompletionsUrl(): string {
    const base = this.config.apiUrl.replace(/\/+$/, "").replace(/\/models$/i, "");
    if (base.endsWith("/chat/completions")) return base;
    return `${base}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      h.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return h;
  }

  async translate(
    direction: TranslateDirection,
    fields: TranslateFieldInput[],
  ): Promise<TranslateResult> {
    if (!this.config.apiUrl) {
      throw new AiTranslateError("NOT_CONFIGURED", "AI translation endpoint is not configured");
    }

    const nonEmpty = fields.filter((f) => f.text.trim().length > 0);
    if (nonEmpty.length === 0) {
      return { translations: {}, model: this.config.model };
    }

    const messages = buildTranslationMessages(direction, nonEmpty);
    const body = {
      model: this.config.model,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
      // Voorkomt dat redeneermodellen (bv. Qwen3/Gemma4 op vLLM) honderden
      // thinking-tokens verbruiken op een eenvoudige vertaling.
      chat_template_kwargs: { enable_thinking: false },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.chatCompletionsUrl, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new AiTranslateError("TIMEOUT", "AI translation request timed out");
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiTranslateError("TIMEOUT", "AI translation request timed out");
      }
      throw new AiTranslateError("UNREACHABLE", "Could not reach AI translation server");
    }

    if (response.status === 401 || response.status === 403) {
      throw new AiTranslateError("UNAUTHORIZED", "AI server rejected the API key", response.status);
    }

    if (!response.ok) {
      throw new AiTranslateError(
        "UPSTREAM_ERROR",
        `AI server returned HTTP ${response.status}`,
        response.status,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AiTranslateError("BAD_RESPONSE", "AI server returned non-JSON response");
    }

    const data = json as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new AiTranslateError("BAD_RESPONSE", "AI server returned an empty completion");
    }

    const translations = parseTranslationResponse(
      content,
      nonEmpty.map((f) => f.key),
    );

    return {
      translations,
      model: typeof data.model === "string" && data.model ? data.model : this.config.model,
    };
  }

  /** Korte eind-tot-eind test voor de Admin -> IT "Test connection"-knop. */
  async testConnection(): Promise<{ ok: true; model: string; sample: string } | { ok: false; error: AiTranslateErrorCode; detail?: string }> {
    try {
      const result = await this.translate("nl-to-en", [
        { key: "test", text: "Welkom bij VTK Leuven." },
      ]);
      return {
        ok: true,
        model: result.model,
        sample: result.translations.test ?? "",
      };
    } catch (error) {
      if (error instanceof AiTranslateError) {
        return { ok: false, error: error.code, detail: error.message };
      }
      return { ok: false, error: "UNREACHABLE" };
    }
  }
}
