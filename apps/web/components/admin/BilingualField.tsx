"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button, ConfirmDialog, Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { useAiTranslateConfig } from "@/components/admin/AiTranslateContext";
import { useReportFormBusy } from "@/components/ui/formBusy";
import { useToast } from "@/components/ui/toast";
import {
  requestFieldTranslation,
  translateErrorMessage,
  useMarkInlineTranslate,
} from "@/components/ui/formTranslate";
import type { TranslateDirection } from "@/lib/ai/translate";

export type BilingualLang = "nl" | "en";

export type BilingualPairHandle = {
  key: string;
  getNl: () => string;
  setNl: (next: string) => void;
  getEn: () => string;
  setEn: (next: string) => void;
  markdown?: boolean;
};

type BilingualGroupContextValue = {
  lang: BilingualLang;
  setLang: (lang: BilingualLang) => void;
  locale: Locale;
  translating: boolean;
  aiEnabled: boolean;
  hasEmptyEn: boolean;
  hasAnyNl: boolean;
  hasAnyEn: boolean;
  registerPair: (handle: BilingualPairHandle) => () => void;
  notifyChange: () => void;
  triggerTranslate: (direction?: TranslateDirection) => void;
};

const BilingualGroupContext = createContext<BilingualGroupContextValue | null>(null);

export function useBilingualGroup(): BilingualGroupContextValue {
  const ctx = useContext(BilingualGroupContext);
  if (!ctx) {
    throw new Error("BilingualInput / BilingualMarkdown / BilingualBar must be inside a BilingualGroup");
  }
  return ctx;
}

/**
 * Registreert een eigen (extern beheerd) NL/EN-veldpaar bij de omliggende
 * `BilingualGroup`, bv. wanneer een formulier eigen controlled state bijhoudt.
 */
export function useRegisterBilingualPair(
  key: string,
  getNl: () => string,
  setNl: (next: string) => void,
  getEn: () => string,
  setEn: (next: string) => void,
  options?: { markdown?: boolean },
): void {
  const ctx = useContext(BilingualGroupContext);
  const refs = useRef({ getNl, setNl, getEn, setEn });
  const markdown = options?.markdown ?? false;

  useEffect(() => {
    refs.current = { getNl, setNl, getEn, setEn };
  }, [getNl, setNl, getEn, setEn]);

  useEffect(() => {
    if (!ctx) return;
    return ctx.registerPair({
      key,
      getNl: () => refs.current.getNl(),
      setNl: (next) => refs.current.setNl(next),
      getEn: () => refs.current.getEn(),
      setEn: (next) => refs.current.setEn(next),
      markdown,
    });
  }, [ctx, key, markdown]);
}

/**
 * Gedeelde container voor een tweetalig blok (bv. Titel + Markdown-tekst +
 * Knoptekst). Schakelt alle onderliggende velden samen tussen Nederlands en
 * Engels en vertaalt ze in één AI-call zodat toon en terminologie kloppen.
 */
export function BilingualGroup({
  locale,
  showBar = true,
  enHint,
  className = "space-y-4",
  children,
}: {
  locale: Locale;
  /** Zet op false om `<BilingualBar />` zelf op een of meer eigen plekken te plaatsen. */
  showBar?: boolean;
  /** Optionele hulptekst onderaan wanneer de Engelse tab actief is. */
  enHint?: string;
  className?: string;
  children: ReactNode;
}) {
  const nl = locale === "nl";
  const { enabled: aiEnabled } = useAiTranslateConfig();
  const showToast = useToast();
  const [lang, setLang] = useState<BilingualLang>("nl");
  const [translating, setTranslating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{
    direction: TranslateDirection;
    pairs: BilingualPairHandle[];
  } | null>(null);
  const [status, setStatus] = useState({ hasEmptyEn: false, hasAnyNl: false, hasAnyEn: false });

  const pairsRef = useRef<Map<string, BilingualPairHandle>>(new Map());

  useMarkInlineTranslate();
  useReportFormBusy(translating);

  const recomputeStatus = useCallback(() => {
    let hasEmptyEn = false;
    let hasAnyNl = false;
    let hasAnyEn = false;
    for (const pair of pairsRef.current.values()) {
      const nlVal = pair.getNl().trim();
      const enVal = pair.getEn().trim();
      if (nlVal.length > 0) hasAnyNl = true;
      if (enVal.length > 0) hasAnyEn = true;
      if (enVal.length === 0) hasEmptyEn = true;
    }
    setStatus((prev) =>
      prev.hasEmptyEn === hasEmptyEn &&
      prev.hasAnyNl === hasAnyNl &&
      prev.hasAnyEn === hasAnyEn
        ? prev
        : { hasEmptyEn, hasAnyNl, hasAnyEn },
    );
  }, []);

  const registerPair = useCallback(
    (handle: BilingualPairHandle) => {
      pairsRef.current.set(handle.key, handle);
      const raf = requestAnimationFrame(recomputeStatus);
      return () => {
        cancelAnimationFrame(raf);
        if (pairsRef.current.get(handle.key) === handle) {
          pairsRef.current.delete(handle.key);
          requestAnimationFrame(recomputeStatus);
        }
      };
    },
    [recomputeStatus],
  );

  const runTranslation = useCallback(
    async (
      direction: TranslateDirection,
      pairs: BilingualPairHandle[],
      overwriteAll: boolean,
    ) => {
      const toTranslate = pairs.filter((p) => {
        const src = (direction === "nl-to-en" ? p.getNl() : p.getEn()).trim();
        if (!src) return false;
        if (overwriteAll) return true;
        const dst = (direction === "nl-to-en" ? p.getEn() : p.getNl()).trim();
        return dst.length === 0;
      });
      if (toTranslate.length === 0) return;

      setTranslating(true);
      try {
        const result = await requestFieldTranslation(
          direction,
          toTranslate.map((p) => ({
            key: p.key,
            text: direction === "nl-to-en" ? p.getNl() : p.getEn(),
            markdown: Boolean(p.markdown),
          })),
        );

        if (!result.ok) {
          showToast({
            message: translateErrorMessage(result.error, nl),
            variant: "error",
            duration: 0,
          });
          return;
        }

        let updated = 0;
        for (const pair of toTranslate) {
          const translated = result.translations[pair.key];
          if (typeof translated === "string" && translated.length > 0) {
            if (direction === "nl-to-en") pair.setEn(translated);
            else pair.setNl(translated);
            updated += 1;
          }
        }

        // Schakel naar de doeltaal zodat de admin de vertaling direct kan nalezen.
        setLang(direction === "nl-to-en" ? "en" : "nl");
        requestAnimationFrame(recomputeStatus);

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
    },
    [nl, recomputeStatus, showToast],
  );

  const triggerTranslate = useCallback(
    (explicitDirection?: TranslateDirection) => {
      const pairs = Array.from(pairsRef.current.values());
      const anyNl = pairs.some((p) => p.getNl().trim().length > 0);
      const anyEn = pairs.some((p) => p.getEn().trim().length > 0);

      const direction: TranslateDirection =
        explicitDirection ??
        (!anyNl && anyEn ? "en-to-nl" : "nl-to-en");

      const withSource = pairs.filter(
        (p) => (direction === "nl-to-en" ? p.getNl() : p.getEn()).trim().length > 0,
      );
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

      const withEmptyTarget = withSource.filter(
        (p) => (direction === "nl-to-en" ? p.getEn() : p.getNl()).trim().length === 0,
      );
      if (withEmptyTarget.length === 0) {
        setConfirmOverwrite({ direction, pairs: withSource });
        return;
      }

      void runTranslation(direction, withSource, false);
    },
    [nl, runTranslation, showToast],
  );

  return (
    <BilingualGroupContext.Provider
      value={{
        lang,
        setLang,
        locale,
        translating,
        aiEnabled,
        hasEmptyEn: status.hasEmptyEn,
        hasAnyNl: status.hasAnyNl,
        hasAnyEn: status.hasAnyEn,
        registerPair,
        notifyChange: recomputeStatus,
        triggerTranslate,
      }}
    >
      <div className={className}>
        {showBar ? <BilingualBar /> : null}
        {children}
        {enHint && lang === "en" ? (
          <p className="text-xs text-[#5c667f]">{enHint}</p>
        ) : null}
      </div>

      {confirmOverwrite ? (
        <ConfirmDialog
          open
          title={
            confirmOverwrite.direction === "nl-to-en"
              ? nl
                ? "Engelse velden overschrijven?"
                : "Overwrite English fields?"
              : nl
                ? "Nederlandse velden overschrijven?"
                : "Overwrite Dutch fields?"
          }
          description={
            confirmOverwrite.direction === "nl-to-en"
              ? nl
                ? "Alle Engelse velden in dit blok zijn al ingevuld. Wil je ze vervangen door een nieuwe AI-vertaling? Er wordt nog niets opgeslagen."
                : "All English fields in this block already have content. Replace them with a new AI translation? Nothing is saved yet."
              : nl
                ? "Alle Nederlandse velden in dit blok zijn al ingevuld. Wil je ze vervangen door een nieuwe AI-vertaling? Er wordt nog niets opgeslagen."
                : "All Dutch fields in this block already have content. Replace them with a new AI translation? Nothing is saved yet."
          }
          confirmLabel={nl ? "Overschrijven" : "Overwrite"}
          cancelLabel={nl ? "Annuleren" : "Cancel"}
          pending={translating}
          onConfirm={() => {
            const payload = confirmOverwrite;
            setConfirmOverwrite(null);
            void runTranslation(payload.direction, payload.pairs, true);
          }}
          onCancel={() => setConfirmOverwrite(null)}
        />
      ) : null}
    </BilingualGroupContext.Provider>
  );
}

/**
 * De `NL | EN`-tabbalk met rechts de subtiele `ghost`-vertaalknop.
 *
 * - Standaard (`compact = false`): volle labels ("Nederlands" / "English") en
 *   een `ghost`-knop met tekst ("Vertaal → EN" of "Vertaal uit NL").
 * - Compact (`compact = true`): korte pill (`NL | EN`) + compact `ghost`-knopje,
 *   ideaal op dezelfde regel rechts naast een veldlabel (zoals in `EventForm`).
 */
export function BilingualBar({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const {
    lang,
    setLang,
    locale,
    translating,
    aiEnabled,
    hasEmptyEn,
    hasAnyNl,
    hasAnyEn,
    triggerTranslate,
  } = useBilingualGroup();
  const nl = locale === "nl";

  // Slimme standaardrichting: normaal NL -> EN, maar als enkel EN gevuld is
  // bieden we meteen EN -> NL aan.
  const direction: TranslateDirection = !hasAnyNl && hasAnyEn ? "en-to-nl" : "nl-to-en";

  const buttonLabel =
    direction === "nl-to-en"
      ? lang === "en"
        ? nl
          ? "Vertaal uit NL"
          : "Translate from NL"
        : nl
          ? "Vertaal → EN"
          : "Translate → EN"
      : lang === "nl"
        ? nl
          ? "Vertaal uit EN"
          : "Translate from EN"
        : nl
          ? "Vertaal → NL"
          : "Translate → NL";

  if (compact) {
    return (
      <div className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
        <span
          className="vtk-ef-langtabs"
          role="group"
          aria-label={nl ? "Taal van dit veld" : "Language of this field"}
        >
          <button
            type="button"
            aria-pressed={lang === "nl"}
            title={nl ? "Nederlands" : "Dutch"}
            onClick={() => setLang("nl")}
          >
            NL
          </button>
          <button
            type="button"
            aria-pressed={lang === "en"}
            title={nl ? "Engels" : "English"}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </span>
        {aiEnabled ? (
          <button
            type="button"
            disabled={translating}
            onClick={() => triggerTranslate(direction)}
            title={buttonLabel}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-vtk-blue/15 bg-white px-2.5 text-[11px] font-medium text-vtk-ink transition-colors hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70 disabled:opacity-50"
          >
            {translating ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Languages className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{translating ? (nl ? "Vertalen…" : "Translating…") : buttonLabel}</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={["flex flex-wrap items-center justify-between gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="flex w-fit rounded-lg border border-vtk-blue/15 p-0.5"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={lang === "nl"}
          onClick={() => setLang("nl")}
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            lang === "nl" ? "bg-vtk-ink text-white" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Nederlands" : "Dutch"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lang === "en"}
          onClick={() => setLang("en")}
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            lang === "en" ? "bg-vtk-ink text-white" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Engels" : "English"}
          {hasEmptyEn ? (
            <span className="ml-1.5 text-[10px] font-normal opacity-70">
              {nl ? "leeg" : "empty"}
            </span>
          ) : null}
        </button>
      </div>

      {aiEnabled ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={translating}
          onClick={() => triggerTranslate(direction)}
        >
          {translating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {translating ? (nl ? "Vertalen…" : "Translating…") : buttonLabel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Eén-regel tweetalig tekstveld binnen een `BilingualGroup`. Beide inputs
 * blijven gemount (de inactieve taal is verborgen) zodat `FormData` altijd
 * zowel `*Nl` als `*En` meestuurt.
 */
export function BilingualInput({
  label,
  nameNl,
  nameEn,
  defaultValueNl = "",
  defaultValueEn = "",
  placeholderNl,
  placeholderEn,
  requiredNl = false,
  requiredEn = false,
  maxLength,
  hintEn,
  idPrefix,
  showBar = false,
  className,
}: {
  label: string;
  nameNl: string;
  nameEn: string;
  defaultValueNl?: string | null;
  defaultValueEn?: string | null;
  placeholderNl?: string;
  placeholderEn?: string;
  requiredNl?: boolean;
  requiredEn?: boolean;
  maxLength?: number;
  hintEn?: string;
  idPrefix?: string;
  /** Toon een compacte `NL | EN` + vertaalknop rechts op de labelregel. */
  showBar?: boolean;
  className?: string;
}) {
  const { lang, notifyChange } = useBilingualGroup();
  const uid = useId();
  const prefix = idPrefix ?? uid;
  const [nlVal, setNlVal] = useState(defaultValueNl ?? "");
  const [enVal, setEnVal] = useState(defaultValueEn ?? "");

  const updateNl = useCallback(
    (next: string) => {
      setNlVal(next);
      notifyChange();
    },
    [notifyChange],
  );
  const updateEn = useCallback(
    (next: string) => {
      setEnVal(next);
      notifyChange();
    },
    [notifyChange],
  );

  useRegisterBilingualPair(nameNl, () => nlVal, updateNl, () => enVal, updateEn);

  return (
    <div className={className}>
      {showBar ? (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={lang === "nl" ? `${prefix}-nl` : `${prefix}-en`} className="mb-0">
            {label} ({lang === "nl" ? "NL" : "EN"})
          </Label>
          <BilingualBar compact />
        </div>
      ) : (
        <Label htmlFor={lang === "nl" ? `${prefix}-nl` : `${prefix}-en`}>
          {label} ({lang === "nl" ? "NL" : "EN"})
        </Label>
      )}
      <div className={lang === "nl" ? undefined : "hidden"}>
        <Input
          id={`${prefix}-nl`}
          name={nameNl}
          value={nlVal}
          onChange={(e) => updateNl(e.target.value)}
          placeholder={placeholderNl}
          required={requiredNl && lang === "nl"}
          maxLength={maxLength}
        />
      </div>
      <div className={lang === "en" ? undefined : "hidden"}>
        <Input
          id={`${prefix}-en`}
          name={nameEn}
          value={enVal}
          onChange={(e) => updateEn(e.target.value)}
          placeholder={placeholderEn}
          required={requiredEn && lang === "en"}
          maxLength={maxLength}
        />
        {hintEn ? <p className="mt-1 text-xs text-[#5c667f]">{hintEn}</p> : null}
      </div>
    </div>
  );
}

/**
 * Tweetalige Markdown-editor binnen een `BilingualGroup`. Ondersteunt zowel
 * uncontrolled (`defaultValueNl`/`defaultValueEn`) als controlled (`valueNl`/
 * `onChangeNl`) gebruik, en stuurt verborgen inputs mee voor `FormData`.
 */
export function BilingualMarkdown({
  label,
  nameNl,
  nameEn,
  defaultValueNl = "",
  defaultValueEn = "",
  valueNl: controlledNl,
  valueEn: controlledEn,
  onChangeNl,
  onChangeEn,
  locale,
  rows = 10,
  allowImages = true,
  allowFiles,
  maxLength,
  hintEn,
  idPrefix,
  showBar = false,
}: {
  label?: string;
  nameNl: string;
  nameEn: string;
  defaultValueNl?: string | null;
  defaultValueEn?: string | null;
  valueNl?: string;
  valueEn?: string;
  onChangeNl?: (value: string) => void;
  onChangeEn?: (value: string) => void;
  locale: Locale;
  rows?: number;
  allowImages?: boolean;
  allowFiles?: boolean;
  maxLength?: number;
  hintEn?: string;
  idPrefix?: string;
  /** Toon een compacte `NL | EN` + vertaalknop rechts op de labelregel. */
  showBar?: boolean;
}) {
  const { lang, notifyChange } = useBilingualGroup();
  const uid = useId();
  const prefix = idPrefix ?? uid;
  const [internalNl, setInternalNl] = useState(defaultValueNl ?? "");
  const [internalEn, setInternalEn] = useState(defaultValueEn ?? "");

  const nlVal = controlledNl ?? internalNl;
  const enVal = controlledEn ?? internalEn;

  const updateNl = useCallback(
    (next: string) => {
      if (onChangeNl) onChangeNl(next);
      else setInternalNl(next);
      notifyChange();
    },
    [onChangeNl, notifyChange],
  );
  const updateEn = useCallback(
    (next: string) => {
      if (onChangeEn) onChangeEn(next);
      else setInternalEn(next);
      notifyChange();
    },
    [onChangeEn, notifyChange],
  );

  useRegisterBilingualPair(nameNl, () => nlVal, updateNl, () => enVal, updateEn, {
    markdown: true,
  });

  return (
    <div>
      <input type="hidden" name={nameNl} value={nlVal} />
      <input type="hidden" name={nameEn} value={enVal} />
      {label ? (
        showBar ? (
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={lang === "nl" ? `${prefix}-nl` : `${prefix}-en`} className="mb-0">
              {label} ({lang === "nl" ? "NL" : "EN"})
            </Label>
            <BilingualBar compact />
          </div>
        ) : (
          <Label htmlFor={lang === "nl" ? `${prefix}-nl` : `${prefix}-en`}>
            {label} ({lang === "nl" ? "NL" : "EN"})
          </Label>
        )
      ) : null}
      <div className={lang === "nl" ? undefined : "hidden"}>
        <MarkdownEditor
          value={nlVal}
          onChange={updateNl}
          locale={locale}
          rows={rows}
          allowImages={allowImages}
          allowFiles={allowFiles}
          maxLength={maxLength}
          textareaId={`${prefix}-nl`}
        />
      </div>
      <div className={lang === "en" ? undefined : "hidden"}>
        <MarkdownEditor
          value={enVal}
          onChange={updateEn}
          locale={locale}
          rows={rows}
          allowImages={allowImages}
          allowFiles={allowFiles}
          maxLength={maxLength}
          textareaId={`${prefix}-en`}
        />
        {hintEn ? <p className="mt-1 text-xs text-[#5c667f]">{hintEn}</p> : null}
      </div>
    </div>
  );
}

/**
 * Shorthand voor één op zichzelf staand tweetalig invoerveld (met compacte
 * `NL | EN`-balk en `ghost`-vertaalknop rechts op de labelregel).
 */
export function BilingualField({
  locale,
  className,
  ...inputProps
}: {
  locale: Locale;
  label: string;
  nameNl: string;
  nameEn: string;
  defaultValueNl?: string | null;
  defaultValueEn?: string | null;
  placeholderNl?: string;
  placeholderEn?: string;
  requiredNl?: boolean;
  requiredEn?: boolean;
  maxLength?: number;
  hintEn?: string;
  idPrefix?: string;
  className?: string;
}) {
  return (
    <BilingualGroup locale={locale} showBar={false} className={className}>
      <BilingualInput {...inputProps} showBar />
    </BilingualGroup>
  );
}
