"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowLeftRight, Languages, Loader2 } from "lucide-react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { useAiTranslateConfig } from "@/components/admin/AiTranslateContext";
import { useToast } from "@/components/ui/toast";
import { useReportFormBusy } from "@/components/ui/formBusy";
import { parseBilingualFieldName } from "@/lib/ai/fieldNames";
import type { TranslateDirection } from "@/lib/ai/translate";

export { parseBilingualFieldName };

export type TranslatableFieldAdapter = {
  name: string;
  getValue: () => string;
  setValue: (next: string) => void;
  markdown?: boolean;
};

export type BilingualFieldPair = {
  base: string;
  nl: TranslatableFieldAdapter;
  en: TranslatableFieldAdapter;
};

type RegisterFn = (adapter: TranslatableFieldAdapter) => () => void;

type FormTranslateContextValue = {
  register: RegisterFn;
  markInlinePresent: () => () => void;
};

const FormTranslateRegistryContext = createContext<FormTranslateContextValue | null>(null);

/**
 * Laat een `<BilingualGroup>` melden dat dit formulier al een eigen inline
 * vertaalknop heeft, zodat `SaveForm` geen dubbele fallback-knop onderaan toont.
 */
export function useMarkInlineTranslate(): void {
  const ctx = useContext(FormTranslateRegistryContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.markInlinePresent();
  }, [ctx]);
}

/**
 * Laat een custom gecontroleerde editor (zoals `MarkdownEditorField` of
 * `PageContentEditor`) zichzelf aanmelden bij de omliggende `SaveForm`, zodat
 * de universele vertaalknop haar waarde kan lezen en invullen zonder DOM-hacks.
 * Buiten een `SaveForm` doet deze hook niets.
 */
export function useRegisterTranslatableField(
  name: string | undefined,
  getValue: () => string,
  setValue: (next: string) => void,
  options?: { markdown?: boolean },
): void {
  const ctx = useContext(FormTranslateRegistryContext);
  const getValueRef = useRef(getValue);
  const setValueRef = useRef(setValue);
  const markdown = options?.markdown ?? false;

  useEffect(() => {
    getValueRef.current = getValue;
    setValueRef.current = setValue;
  }, [getValue, setValue]);

  useEffect(() => {
    if (!ctx || !name) return;
    return ctx.register({
      name,
      getValue: () => getValueRef.current(),
      setValue: (next) => setValueRef.current(next),
      markdown,
    });
  }, [ctx, name, markdown]);
}

export function useFormTranslateRegistry() {
  const fieldsRef = useRef<Map<string, TranslatableFieldAdapter>>(new Map());
  const [version, setVersion] = useState(0);
  const [inlineCount, setInlineCount] = useState(0);

  const register = useCallback<RegisterFn>((adapter) => {
    fieldsRef.current.set(adapter.name, adapter);
    setVersion((v) => v + 1);
    return () => {
      if (fieldsRef.current.get(adapter.name) === adapter) {
        fieldsRef.current.delete(adapter.name);
        setVersion((v) => v + 1);
      }
    };
  }, []);

  const markInlinePresent = useCallback(() => {
    setInlineCount((c) => c + 1);
    return () => setInlineCount((c) => Math.max(0, c - 1));
  }, []);

  return {
    fieldsRef,
    version,
    hasInlineTranslate: inlineCount > 0,
    register,
    markInlinePresent,
  };
}

export function FormTranslateProvider({
  register,
  markInlinePresent,
  children,
}: {
  register: RegisterFn;
  markInlinePresent: () => () => void;
  children: ReactNode;
}) {
  const [ctxValue] = useState<FormTranslateContextValue>(() => ({
    register,
    markInlinePresent,
  }));
  return (
    <FormTranslateRegistryContext.Provider value={ctxValue}>
      {children}
    </FormTranslateRegistryContext.Provider>
  );
}

const NON_TEXT_INPUT_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "file",
  "password",
  "email",
  "url",
  "tel",
  "range",
  "submit",
  "button",
  "reset",
  "image",
]);

/**
 * Schrijft een waarde naar een native input/textarea op een manier die zowel
 * uncontrolled (`defaultValue`) als React-controlled (`value` + `onChange`)
 * velden bijwerkt.
 */
function setNativeFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Vindt alle `*Nl` / `*En`-paren in een formulier door zowel geregistreerde
 * custom editors (bv. `MarkdownEditorField`) als gewone tekstvelden en
 * textareas te scannen.
 */
export function discoverBilingualPairs(
  form: HTMLFormElement | null,
  registered: ReadonlyMap<string, TranslatableFieldAdapter>,
): BilingualFieldPair[] {
  const byBase = new Map<
    string,
    { nl?: TranslatableFieldAdapter; en?: TranslatableFieldAdapter }
  >();

  function addAdapter(adapter: TranslatableFieldAdapter) {
    const parsed = parseBilingualFieldName(adapter.name);
    if (!parsed) return;
    const entry = byBase.get(parsed.base) ?? {};
    if (!entry[parsed.lang]) {
      entry[parsed.lang] = adapter;
      byBase.set(parsed.base, entry);
    }
  }

  for (const adapter of registered.values()) {
    addAdapter(adapter);
  }

  if (form) {
    const elements = Array.from(form.elements);
    for (const raw of elements) {
      if (raw instanceof HTMLInputElement) {
        const type = (raw.getAttribute("type") ?? "text").toLowerCase();
        if (NON_TEXT_INPUT_TYPES.has(type)) continue;
        if (raw.disabled || raw.readOnly || !raw.name) continue;
        if (registered.has(raw.name)) continue;
        const input = raw;
        addAdapter({
          name: input.name,
          getValue: () => input.value,
          setValue: (next) => setNativeFieldValue(input, next),
        });
      } else if (raw instanceof HTMLTextAreaElement) {
        if (raw.disabled || raw.readOnly || !raw.name) continue;
        if (registered.has(raw.name)) continue;
        const textarea = raw;
        addAdapter({
          name: textarea.name,
          getValue: () => textarea.value,
          setValue: (next) => setNativeFieldValue(textarea, next),
        });
      }
    }
  }

  const pairs: BilingualFieldPair[] = [];
  for (const [base, entry] of byBase.entries()) {
    if (entry.nl && entry.en) {
      pairs.push({ base, nl: entry.nl, en: entry.en });
    }
  }
  return pairs;
}

type TranslateApiResult =
  | { ok: true; translations: Record<string, string> }
  | { ok: false; error: string };

export async function requestFieldTranslation(
  direction: TranslateDirection,
  fields: Array<{ key: string; text: string; markdown?: boolean }>,
): Promise<TranslateApiResult> {
  try {
    const response = await fetch("/api/admin/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, fields }),
    });
    const data = (await response.json().catch(() => null)) as
      | { translations?: Record<string, string>; error?: string }
      | null;
    if (!response.ok || !data?.translations) {
      return { ok: false, error: data?.error ?? "UPSTREAM_ERROR" };
    }
    return { ok: true, translations: data.translations };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

export function translateErrorMessage(code: string, nl: boolean): string {
  switch (code) {
    case "RATE_LIMITED":
      return nl
        ? "Even rustig aan: te veel vertaalaanvragen na elkaar. Probeer over een minuutje opnieuw."
        : "Too many translation requests in a row. Please try again in a minute.";
    case "TIMEOUT":
      return nl
        ? "De AI-server reageerde niet op tijd (mogelijk laadt het model nog). Probeer zo opnieuw."
        : "The AI server timed out (the model may still be loading). Please try again shortly.";
    case "TOO_LARGE":
      return nl
        ? "De tekst is te groot om in één keer te vertalen."
        : "The text is too large to translate in one request.";
    case "NOT_CONFIGURED":
      return nl
        ? "AI-vertaling is nog niet ingesteld onder Admin → IT."
        : "AI translation is not configured under Admin → IT yet.";
    default:
      return nl
        ? "Vertalen via AI is niet gelukt. Controleer of de AI-server bereikbaar is."
        : "AI translation failed. Please check whether the AI server is reachable.";
  }
}

/**
 * Universele vertaalknop die automatisch in `SaveForm` verschijnt zodra een
 * adminformulier minstens één `*Nl`/`*En`-veldpaar bevat en AI geconfigureerd is.
 */
export function FormTranslateControl({
  formRef,
  registeredFieldsRef,
  registryVersion,
  disabled,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  registeredFieldsRef: RefObject<Map<string, TranslatableFieldAdapter>>;
  registryVersion: number;
  disabled?: boolean;
}) {
  const { enabled, locale } = useAiTranslateConfig();
  const nl = locale === "nl";
  const showToast = useToast();
  const [hasPairs, setHasPairs] = useState(false);
  const [direction, setDirection] = useState<TranslateDirection>("nl-to-en");
  const [translating, setTranslating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<BilingualFieldPair[] | null>(null);

  useReportFormBusy(translating);

  useEffect(() => {
    if (!enabled) return;
    const form = formRef.current;
    const check = () => {
      const pairs = discoverBilingualPairs(form, registeredFieldsRef.current);
      setHasPairs(pairs.length > 0);
    };
    const raf = requestAnimationFrame(check);
    if (!form) return () => cancelAnimationFrame(raf);
    const observer = new MutationObserver(check);
    observer.observe(form, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [enabled, formRef, registeredFieldsRef, registryVersion]);

  if (!enabled || !hasPairs) return null;

  async function runTranslation(pairs: BilingualFieldPair[], overwriteAll: boolean) {
    const sourceLang = direction === "nl-to-en" ? "nl" : "en";
    const targetLang = direction === "nl-to-en" ? "en" : "nl";

    const toTranslate = pairs.filter((pair) => {
      const src = pair[sourceLang].getValue().trim();
      if (!src) return false;
      if (overwriteAll) return true;
      return pair[targetLang].getValue().trim().length === 0;
    });

    if (toTranslate.length === 0) return;

    setTranslating(true);
    try {
      const result = await requestFieldTranslation(
        direction,
        toTranslate.map((pair, idx) => ({
          key: pair.base || `field_${idx}`,
          text: pair[sourceLang].getValue(),
          markdown: Boolean(pair[sourceLang].markdown || pair[targetLang].markdown),
        })),
      );

      if (!result.ok) {
        showToast({ message: translateErrorMessage(result.error, nl), variant: "error", duration: 0 });
        return;
      }

      let updated = 0;
      toTranslate.forEach((pair, idx) => {
        const key = pair.base || `field_${idx}`;
        const translated = result.translations[key];
        if (typeof translated === "string" && translated.length > 0) {
          pair[targetLang].setValue(translated);
          updated += 1;
        }
      });

      const targetLabel =
        direction === "nl-to-en"
          ? nl
            ? "het Engels"
            : "English"
          : nl
            ? "het Nederlands"
            : "Dutch";

      showToast({
        message: nl
          ? `${updated} ${updated === 1 ? "veld" : "velden"} vertaald naar ${targetLabel} — kijk even na voor je opslaat.`
          : `Translated ${updated} ${updated === 1 ? "field" : "fields"} to ${targetLabel} — please review before saving.`,
        variant: "success",
      });
    } finally {
      setTranslating(false);
    }
  }

  function handleClick() {
    const pairs = discoverBilingualPairs(formRef.current, registeredFieldsRef.current);
    const sourceLang = direction === "nl-to-en" ? "nl" : "en";
    const targetLang = direction === "nl-to-en" ? "en" : "nl";

    const withSource = pairs.filter((p) => p[sourceLang].getValue().trim().length > 0);
    if (withSource.length === 0) {
      showToast({
        message:
          direction === "nl-to-en"
            ? nl
              ? "Vul eerst minstens één Nederlands veld in om te vertalen."
              : "Fill in at least one Dutch field first to translate."
            : nl
              ? "Vul eerst minstens één Engels veld in om te vertalen."
              : "Fill in at least one English field first to translate.",
        variant: "error",
      });
      return;
    }

    const withEmptyTarget = withSource.filter((p) => p[targetLang].getValue().trim().length === 0);
    if (withEmptyTarget.length === 0) {
      // Alle doelvelden zijn al ingevuld: vraag expliciet bevestiging voor we overschrijven.
      setConfirmOverwrite(withSource);
      return;
    }

    void runTranslation(withSource, false);
  }

  const label =
    direction === "nl-to-en"
      ? nl
        ? "Vertaal → EN"
        : "Translate → EN"
      : nl
        ? "Vertaal → NL"
        : "Translate → NL";

  const flipTitle =
    direction === "nl-to-en"
      ? nl
        ? "Wissel richting naar EN → NL"
        : "Switch direction to EN → NL"
      : nl
        ? "Wissel richting naar NL → EN"
        : "Switch direction to NL → EN";

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || translating}
          onClick={handleClick}
        >
          {translating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Languages className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {translating ? (nl ? "Vertalen…" : "Translating…") : label}
        </Button>
        <button
          type="button"
          disabled={disabled || translating}
          onClick={() => setDirection((d) => (d === "nl-to-en" ? "en-to-nl" : "nl-to-en"))}
          title={flipTitle}
          aria-label={flipTitle}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-vtk-blue/15 text-[#5c667f] transition hover:bg-vtk-blue-soft/60 hover:text-vtk-ink disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {confirmOverwrite && (
        <ConfirmDialog
          open
          title={
            direction === "nl-to-en"
              ? nl
                ? "Engelse velden overschrijven?"
                : "Overwrite English fields?"
              : nl
                ? "Nederlandse velden overschrijven?"
                : "Overwrite Dutch fields?"
          }
          description={
            direction === "nl-to-en"
              ? nl
                ? "Alle Engelse velden in dit formulier zijn al ingevuld. Wil je ze vervangen door een nieuwe AI-vertaling? Er wordt nog niets opgeslagen."
                : "All English fields in this form already have content. Replace them with a new AI translation? Nothing is saved yet."
              : nl
                ? "Alle Nederlandse velden in dit formulier zijn al ingevuld. Wil je ze vervangen door een nieuwe AI-vertaling? Er wordt nog niets opgeslagen."
                : "All Dutch fields in this form already have content. Replace them with a new AI translation? Nothing is saved yet."
          }
          confirmLabel={nl ? "Overschrijven" : "Overwrite"}
          cancelLabel={nl ? "Annuleren" : "Cancel"}
          pending={translating}
          onConfirm={() => {
            const pairs = confirmOverwrite;
            setConfirmOverwrite(null);
            void runTranslation(pairs, true);
          }}
          onCancel={() => setConfirmOverwrite(null)}
        />
      )}
    </>
  );
}
