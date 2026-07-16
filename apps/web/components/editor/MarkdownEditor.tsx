"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";

/**
 * Herbruikbare markdown-editor: platte tekst met een werkbalk voor de basis
 * (koppen, vet, cursief, links, afbeeldingen, lijsten) en een voorbeeld-tab die
 * rendert met dezelfde Markdown-component als de publieke pagina's.
 *
 * Geavanceerdere markdown (tabellen, citaten, codeblokken, ...) werkt gewoon,
 * maar krijgt bewust geen knop: wie het kent, typt het zelf.
 *
 * Afbeeldingen gaan via POST /api/admin/upload (kind=image) en worden als
 * markdown-syntax op de cursorpositie ingevoegd; zet `allowImages` uit voor
 * plekken waar afbeeldingen niet thuishoren.
 */
export function MarkdownEditor({
  value,
  onChange,
  locale,
  rows = 18,
  allowImages = true,
  textareaId,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  rows?: number;
  allowImages?: boolean;
  /** Optioneel id voor het textarea, zodat een <Label htmlFor> eraan kan hangen. */
  textareaId?: string;
}) {
  const nl = locale === "nl";
  const uid = useId();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Vervangt [from, to) door `text` en herstelt focus + selectie. */
  function replaceRange(from: number, to: number, text: string, select?: { start: number; end: number }) {
    const ta = textareaRef.current;
    if (!ta) return;
    onChange(value.slice(0, from) + text + value.slice(to));
    requestAnimationFrame(() => {
      ta.focus();
      if (select) ta.setSelectionRange(select.start, select.end);
    });
  }

  /** Omringt de selectie (of een invulwoord) met before/after, bv. **vet**. */
  function surroundSelection(before: string, after: string, fallback: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end) || fallback;
    replaceRange(start, end, before + selected + after, {
      start: start + before.length,
      end: start + before.length + selected.length,
    });
  }

  /**
   * Zet een regelprefix op elke regel van de selectie (koppen, lijsten). Een
   * bestaande prefix van hetzelfde soort wordt eerst weggehaald, zodat de knop
   * ook wisselt (H2 -> H3) in plaats van te stapelen.
   */
  function prefixSelectedLines(prefix: string | ((index: number) => string), strip: RegExp) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = value.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const next = lines
      .map((line, i) => (typeof prefix === "string" ? prefix : prefix(i)) + line.replace(strip, ""))
      .join("\n");
    replaceRange(lineStart, lineEnd, next, { start: lineStart, end: lineStart + next.length });
  }

  function insertLink() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end) || (nl ? "linktekst" : "link text");
    const text = `[${selected}](https://)`;
    // Cursor op het url-deel, klaar om te overschrijven.
    const urlStart = start + selected.length + 3;
    replaceRange(start, end, text, { start: urlStart, end: urlStart + 8 });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadFailed(false);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "image");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = (await res.json()) as { url: string | null };
      if (!data.url) throw new Error("upload returned no url");
      const ta = textareaRef.current;
      const pos = ta ? ta.selectionStart : value.length;
      const altEnd = pos + 2;
      replaceRange(pos, pos, `![](${data.url})`, { start: altEnd, end: altEnd });
    } catch {
      // Verwachte fout (offline, te groot, geen rechten): melding onder de
      // werkbalk, geen error boundary.
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  }

  const strip = {
    heading: /^#{1,6} /,
    bullet: /^[-*] /,
    ordered: /^\d+\. /,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-vtk-blue/20 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-vtk-blue/10 bg-vtk-blue-soft/30 p-1.5">
        <div className="mr-2 flex rounded-lg border border-vtk-blue/15 p-0.5" role="tablist">
          <ModeTab active={mode === "edit"} onClick={() => setMode("edit")}>
            {nl ? "Bewerken" : "Edit"}
          </ModeTab>
          <ModeTab active={mode === "preview"} onClick={() => setMode("preview")}>
            {nl ? "Voorbeeld" : "Preview"}
          </ModeTab>
        </div>

        {mode === "edit" && (
          <>
            <ToolbarButton
              label={nl ? "Kop 1" : "Heading 1"}
              onClick={() => prefixSelectedLines("# ", strip.heading)}
            >
              <span className="text-xs font-bold">H1</span>
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Kop 2" : "Heading 2"}
              onClick={() => prefixSelectedLines("## ", strip.heading)}
            >
              <span className="text-xs font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Kop 3" : "Heading 3"}
              onClick={() => prefixSelectedLines("### ", strip.heading)}
            >
              <span className="text-xs font-bold">H3</span>
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              label={nl ? "Vet" : "Bold"}
              onClick={() => surroundSelection("**", "**", nl ? "vette tekst" : "bold text")}
            >
              <span className="text-xs font-extrabold">B</span>
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Cursief" : "Italic"}
              onClick={() => surroundSelection("*", "*", nl ? "cursieve tekst" : "italic text")}
            >
              <span className="text-xs font-semibold italic">I</span>
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton label={nl ? "Link invoegen" : "Insert link"} onClick={insertLink}>
              <LinkGlyph />
            </ToolbarButton>
            {allowImages && (
              <ToolbarButton
                label={nl ? "Afbeelding uploaden" : "Upload image"}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <ImageGlyph />
              </ToolbarButton>
            )}
            <ToolbarDivider />
            <ToolbarButton
              label={nl ? "Opsomming" : "Bullet list"}
              onClick={() => prefixSelectedLines("- ", strip.bullet)}
            >
              <ListGlyph />
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Genummerde lijst" : "Numbered list"}
              onClick={() => prefixSelectedLines((i) => `${i + 1}. `, strip.ordered)}
            >
              <OrderedListGlyph />
            </ToolbarButton>
            {uploading && (
              <span className="ml-2 text-xs text-[#5c667f]">
                {nl ? "Afbeelding uploaden..." : "Uploading image..."}
              </span>
            )}
            {uploadFailed && !uploading && (
              <span className="ml-2 text-xs text-red-600">
                {nl ? "Upload mislukt, probeer opnieuw." : "Upload failed, try again."}
              </span>
            )}
          </>
        )}
      </div>

      {allowImages && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadImage(file);
          }}
        />
      )}

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          id={textareaId ?? `${uid}-md`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          className="block w-full resize-y bg-white p-4 font-mono text-sm leading-relaxed text-vtk-ink outline-none"
          placeholder={
            nl
              ? "Schrijf hier in markdown. Gebruik de knoppen hierboven voor koppen, vet, links en afbeeldingen."
              : "Write markdown here. Use the buttons above for headings, bold, links and images."
          }
        />
      ) : (
        <div className="prose-vtk min-h-32 p-4" style={{ minHeight: `${rows * 1.4}em` }}>
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Nog geen inhoud." : "No content yet."}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-vtk-ink text-white" : "text-[#5c667f] hover:text-vtk-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg border border-transparent text-vtk-ink transition-colors hover:border-vtk-blue/20 hover:bg-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-vtk-blue/15" />;
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function LinkGlyph() {
  return (
    <Glyph>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Glyph>
  );
}

function ImageGlyph() {
  return (
    <Glyph>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Glyph>
  );
}

function ListGlyph() {
  return (
    <Glyph>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Glyph>
  );
}

function OrderedListGlyph() {
  return (
    <Glyph>
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </Glyph>
  );
}
