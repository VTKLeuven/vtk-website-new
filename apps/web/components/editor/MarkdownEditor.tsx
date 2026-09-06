"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import { withImageSize } from "@/lib/gallery";
import { Markdown } from "@/components/ui/Markdown";
import { useReportFormBusy } from "@/components/ui/formBusy";

/**
 * Herbruikbare markdown-editor met werkbalk en visueel voorbeeld. De werkbalk
 * ondersteunt H1, H2, H3, links, afbeeldingen, bestanden/documenten (zoals PDF),
 * vet, cursief, code, lijsten, citaten en horizontale lijnen. Het voorbeeld
 * gebruikt exact dezelfde Markdown-component als de publieke pagina's.
 *
 * Afbeeldingen en bestanden gaan via POST /api/admin/upload en worden als
 * markdown-syntax op de cursorpositie ingevoegd; zet `allowImages` of `allowFiles`
 * uit voor plekken waar uploads niet thuishoren.
 *
 * De galerijknop uploadt meerdere foto's tegelijk en zet ze onder elkaar. Dat is
 * geen aparte syntax: de renderkant maakt van afbeeldingen die tegen elkaar aan
 * staan één uitgevulde strook (zie lib/gallery.ts).
 */
export function MarkdownEditor({
  value,
  onChange,
  locale,
  rows = 18,
  allowImages = true,
  allowFiles,
  acceptFiles = ".pdf,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.zip",
  textareaId,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  rows?: number;
  allowImages?: boolean;
  allowFiles?: boolean;
  acceptFiles?: string;
  /** Optioneel id voor het textarea, zodat een <Label htmlFor> eraan kan hangen. */
  textareaId?: string;
  maxLength?: number;
}) {
  const canUploadFiles = allowFiles ?? allowImages;
  const nl = locale === "nl";
  const uid = useId();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [uploadingKind, setUploadingKind] = useState<"image" | "file" | "gallery" | null>(null);
  const [galleryProgress, setGalleryProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const valueRef = useRef(value);
  useReportFormBusy(uploadingKind !== null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /** Vervangt [from, to) door `text` en herstelt focus + selectie. */
  function replaceRange(from: number, to: number, text: string, select?: { start: number; end: number }) {
    const ta = textareaRef.current;
    if (!ta) return;
    const currentValue = valueRef.current;
    onChange(currentValue.slice(0, from) + text + currentValue.slice(to));
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

  function insertVideo() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end).trim() || (nl ? "Video" : "Video");
    const inputUrl = window.prompt(
      nl
        ? "Voer de YouTube- of Vimeo-URL in (bv. https://www.youtube.com/watch?v=...):"
        : "Enter YouTube or Vimeo URL (e.g. https://www.youtube.com/watch?v=...):",
      "https://www.youtube.com/watch?v="
    );
    if (inputUrl === null) return;
    const targetUrl = inputUrl.trim() || "https://www.youtube.com/watch?v=";
    const text = `![${selected}](${targetUrl})`;
    if (!inputUrl.trim() || targetUrl === "https://www.youtube.com/watch?v=") {
      const urlStart = start + selected.length + 4;
      replaceRange(start, end, text, { start: urlStart, end: urlStart + targetUrl.length });
    } else {
      replaceRange(start, end, text, { start: start + text.length, end: start + text.length });
    }
  }

  function insertCode() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end);

    if (selected.includes("\n")) {
      const text = `\`\`\`\n${selected}\n\`\`\``;
      replaceRange(start, end, text, {
        start: start + 4,
        end: start + 4 + selected.length,
      });
      return;
    }

    surroundSelection("`", "`", "code");
  }

  function insertHorizontalRule() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const before = start > 0 && value[start - 1] !== "\n" ? "\n\n" : start > 0 ? "\n" : "";
    const after =
      end < value.length && value[end] !== "\n" ? "\n\n" : end < value.length ? "\n" : "";
    const text = `${before}---${after}`;
    const cursor = start + before.length + 3 + after.length;
    replaceRange(start, end, text, { start: cursor, end: cursor });
  }

  /**
   * Uploadt één afbeelding en geeft de URL terug, met de maten eraan. Die maten
   * laten een fotostrook haar rijen uitvullen voor de foto's geladen zijn.
   */
  async function postImage(file: File): Promise<string> {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", "image");
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    if (!res.ok) {
      if (res.status === 413) {
        throw new Error(nl ? "Afbeelding is te groot (max. 45 MB)." : "Image is too large (max. 45 MB).");
      }
      if (res.status === 415) {
        throw new Error(nl ? "Ongeldige afbeelding." : "Invalid image.");
      }
      if (res.status === 403) {
        throw new Error(nl ? "Geen rechten om afbeeldingen te uploaden." : "No permission to upload images.");
      }
      throw new Error(nl ? "Upload mislukt, probeer opnieuw." : "Upload failed, try again.");
    }
    const data = (await res.json()) as {
      url: string | null;
      width: number | null;
      height: number | null;
    };
    if (!data.url) throw new Error("upload returned no url");
    return data.width && data.height ? withImageSize(data.url, data.width, data.height) : data.url;
  }

  async function uploadImage(file: File) {
    setUploadingKind("image");
    setUploadError(null);
    try {
      const url = await postImage(file);
      const ta = textareaRef.current;
      const pos = ta ? ta.selectionStart : valueRef.current.length;
      const altEnd = pos + 2;
      replaceRange(pos, pos, `![](${url})`, { start: altEnd, end: altEnd });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : nl ? "Upload mislukt." : "Upload failed.");
    } finally {
      setUploadingKind(null);
    }
  }

  /** Zet een blok op `at` neer, met een lege regel ervoor en erna. */
  function insertBlock(at: number, text: string) {
    const current = valueRef.current;
    const head = current.slice(0, at);
    const tail = current.slice(at);
    const before = head === "" || head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
    const after = tail === "" || tail.startsWith("\n\n") ? "" : tail.startsWith("\n") ? "\n" : "\n\n";
    const cursor = at + before.length + text.length;
    replaceRange(at, at, `${before}${text}${after}`, { start: cursor, end: cursor });
  }

  /**
   * Meerdere foto's tegelijk. Ze komen als gewone afbeeldingen onder elkaar in
   * de markdown te staan, want dat is precies wat de renderkant als één strook
   * toont; een lege regel ertussen splitst ze weer in losse foto's.
   */
  async function uploadGallery(files: File[]) {
    if (files.length === 0) return;
    const ta = textareaRef.current;
    const at = ta ? ta.selectionStart : valueRef.current.length;

    setUploadingKind("gallery");
    setUploadError(null);
    setGalleryProgress({ done: 0, total: files.length });

    const urls: string[] = [];
    let failure: string | null = null;
    try {
      for (const file of files) {
        urls.push(await postImage(file));
        setGalleryProgress({ done: urls.length, total: files.length });
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : nl ? "Upload mislukt." : "Upload failed.";
    }

    // Wat wél geüpload is, gaat alsnog in de tekst: opnieuw beginnen met vijf
    // foto's omdat de zesde faalde, helpt niemand.
    if (urls.length > 0) insertBlock(at, urls.map((url) => `![](${url})`).join("\n"));
    setUploadError(failure);
    setGalleryProgress(null);
    setUploadingKind(null);
  }

  function handleDocumentUploadClick() {
    const ta = textareaRef.current;
    if (ta) {
      savedSelectionRef.current = {
        start: ta.selectionStart,
        end: ta.selectionEnd,
      };
    }
    docFileRef.current?.click();
  }

  async function uploadFile(file: File) {
    setUploadingKind("file");
    setUploadError(null);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const kind = isPdf ? "pdf" : "file";
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error(nl ? "Bestand is te groot (max. 40 MB)." : "File is too large (max. 40 MB).");
        }
        if (res.status === 415) {
          throw new Error(nl ? "Ongeldig bestandstype." : "Invalid file type.");
        }
        if (res.status === 403) {
          throw new Error(nl ? "Geen rechten om bestanden te uploaden." : "No permission to upload files.");
        }
        throw new Error(nl ? "Upload mislukt, probeer opnieuw." : "Upload failed, try again.");
      }
      const data = (await res.json()) as { url: string | null };
      if (!data.url) throw new Error("upload returned no url");

      const ta = textareaRef.current;
      const currentVal = valueRef.current;
      const saved = savedSelectionRef.current;
      const pos = ta ? ta.selectionStart : currentVal.length;
      const start = saved ? saved.start : pos;
      const end = saved ? saved.end : pos;

      const rawSelected = currentVal.slice(start, end);
      const leadingSpace = rawSelected.match(/^\s*/)?.[0] ?? "";
      const trailingSpace = rawSelected.match(/\s*$/)?.[0] ?? "";
      let trimmed = rawSelected.trim();

      // Als de selectie al een link was, bv [tekst](https://), haal dan de tekst eruit
      const linkMatch = trimmed.match(/^\[(.*?)\](?:\(.*?\))?$/);
      if (linkMatch) {
        trimmed = linkMatch[1];
      }

      const fileUrl = `${data.url}?filename=${encodeURIComponent(file.name)}`;

      if (trimmed.length > 0) {
        // Er was tekst geselecteerd: maak van die tekst een link naar het geüploade bestand.
        const inserted = `${leadingSpace}[${trimmed}](${fileUrl})${trailingSpace}`;
        const newCursor = start + inserted.length;
        replaceRange(start, end, inserted, { start: newCursor, end: newCursor });
      } else {
        // Geen selectie: voeg [bestandsnaam](url) in en selecteer de naam zodat
        // de beheerder die desgewenst meteen kan overtypen.
        const label = file.name;
        const inserted = `[${label}](${fileUrl})`;
        replaceRange(start, start, inserted, {
          start: start + 1,
          end: start + 1 + label.length,
        });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : nl ? "Upload mislukt." : "Upload failed.");
    } finally {
      setUploadingKind(null);
      savedSelectionRef.current = null;
    }
  }

  const strip = {
    heading: /^#{1,6} /,
    list: /^(?:[-*+]|\d+\.)\s+/,
    quote: /^>\s?/,
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
            <ToolbarButton label={nl ? "Code" : "Code"} onClick={insertCode}>
              <CodeGlyph />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton label={nl ? "Link invoegen" : "Insert link"} onClick={insertLink}>
              <LinkGlyph />
            </ToolbarButton>
            {allowImages && (
              <ToolbarButton
                label={nl ? "Afbeelding uploaden" : "Upload image"}
                onClick={() => imageFileRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                <ImageGlyph />
              </ToolbarButton>
            )}
            {allowImages && (
              <ToolbarButton
                label={
                  nl
                    ? "Fotogalerij: meerdere foto's naast elkaar"
                    : "Photo gallery: several photos side by side"
                }
                onClick={() => galleryFileRef.current?.click()}
                disabled={uploadingKind !== null}
              >
                <GalleryGlyph />
              </ToolbarButton>
            )}
            {canUploadFiles && (
              <ToolbarButton
                label={nl ? "Document of bestand uploaden (bv. PDF)" : "Upload document or file (e.g. PDF)"}
                onClick={handleDocumentUploadClick}
                disabled={uploadingKind !== null}
              >
                <FileGlyph />
              </ToolbarButton>
            )}
            <ToolbarButton
              label={nl ? "Video invoegen (YouTube / Vimeo)" : "Insert video (YouTube / Vimeo)"}
              onClick={insertVideo}
              disabled={uploadingKind !== null}
            >
              <VideoGlyph />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              label={nl ? "Opsomming" : "Bullet list"}
              onClick={() => prefixSelectedLines("- ", strip.list)}
            >
              <ListGlyph />
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Genummerde lijst" : "Numbered list"}
              onClick={() => prefixSelectedLines((i) => `${i + 1}. `, strip.list)}
            >
              <OrderedListGlyph />
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Citaat" : "Blockquote"}
              onClick={() => prefixSelectedLines("> ", strip.quote)}
            >
              <QuoteGlyph />
            </ToolbarButton>
            <ToolbarButton
              label={nl ? "Horizontale lijn" : "Horizontal rule"}
              onClick={insertHorizontalRule}
            >
              <HorizontalRuleGlyph />
            </ToolbarButton>
            {uploadingKind === "image" && (
              <span className="ml-2 text-xs text-[#5c667f]">
                {nl ? "Afbeelding uploaden..." : "Uploading image..."}
              </span>
            )}
            {uploadingKind === "file" && (
              <span className="ml-2 text-xs text-[#5c667f]">
                {nl ? "Bestand uploaden..." : "Uploading file..."}
              </span>
            )}
            {uploadingKind === "gallery" && galleryProgress && (
              <span className="ml-2 text-xs text-[#5c667f]">
                {nl
                  ? `Foto ${Math.min(galleryProgress.done + 1, galleryProgress.total)} van ${galleryProgress.total} uploaden...`
                  : `Uploading photo ${Math.min(galleryProgress.done + 1, galleryProgress.total)} of ${galleryProgress.total}...`}
              </span>
            )}
            {uploadError && !uploadingKind && (
              <span className="ml-2 text-xs text-red-600">
                {uploadError}
              </span>
            )}
          </>
        )}
      </div>

      {allowImages && (
        <input
          ref={imageFileRef}
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

      {allowImages && (
        <input
          ref={galleryFileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void uploadGallery(files);
          }}
        />
      )}

      {canUploadFiles && (
        <input
          ref={docFileRef}
          type="file"
          accept={acceptFiles}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadFile(file);
          }}
        />
      )}

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          id={textareaId ?? `${uid}-md`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) {
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.kind === "file") {
                const file = item.getAsFile();
                if (!file) continue;
                if (file.type.startsWith("image/") && allowImages) {
                  e.preventDefault();
                  void uploadImage(file);
                  return;
                }
                if (canUploadFiles) {
                  e.preventDefault();
                  void uploadFile(file);
                  return;
                }
              }
            }
          }}
          onDrop={(e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 1 && allowImages) {
              // Meerdere foto's in één keer laten vallen is een galerij; dat is
              // wat je bedoelt als je er vier tegelijk op de tekst gooit.
              const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
              if (images.length === files.length) {
                e.preventDefault();
                void uploadGallery(images);
                return;
              }
            }
            if (files && files.length > 0) {
              const file = files[0];
              if (file.type.startsWith("image/") && allowImages) {
                e.preventDefault();
                void uploadImage(file);
                return;
              }
              if (canUploadFiles) {
                e.preventDefault();
                void uploadFile(file);
                return;
              }
            }
          }}
          rows={rows}
          maxLength={maxLength}
          spellCheck={false}
          className="block w-full resize-y bg-white p-4 font-mono text-sm leading-relaxed text-vtk-ink outline-none"
          placeholder={
            allowImages && canUploadFiles
              ? nl
                ? "Schrijf hier in markdown. Gebruik de knoppen hierboven voor koppen, vet, links, afbeeldingen en documenten."
                : "Write markdown here. Use the buttons above for headings, bold, links, images and documents."
              : allowImages
                ? nl
                  ? "Schrijf hier in markdown. Gebruik de knoppen hierboven voor koppen, vet, links en afbeeldingen."
                  : "Write markdown here. Use the buttons above for headings, bold, links and images."
                : canUploadFiles
                  ? nl
                    ? "Schrijf hier in markdown. Gebruik de knoppen hierboven voor koppen, vet, links en documenten."
                    : "Write markdown here. Use the buttons above for headings, bold, links and documents."
                  : nl
                    ? "Schrijf hier in markdown. Gebruik de knoppen hierboven voor koppen, vet en links."
                    : "Write markdown here. Use the buttons above for headings, bold and links."
          }
        />
      ) : (
        <div className="prose-vtk min-h-32 p-4" style={{ minHeight: `${rows * 1.4}em` }}>
          {value.trim() ? (
            <Markdown locale={locale}>{value}</Markdown>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Nog geen inhoud." : "No content yet."}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Formuliervariant van MarkdownEditor. De component beheert haar eigen waarde en
 * verstuurt die via een hidden input met de opgegeven veldnaam.
 */
export function MarkdownEditorField({
  name,
  defaultValue = "",
  ...editorProps
}: {
  name: string;
  defaultValue?: string | null;
  locale: Locale;
  rows?: number;
  allowImages?: boolean;
  allowFiles?: boolean;
  acceptFiles?: string;
  textareaId?: string;
  maxLength?: number;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function changeValue(next: string) {
    setValue(next);
    // Ook werkbalkacties wijzigen Markdown zonder een native textarea-event.
    // Meld dit expliciet aan een eventuele autosave-schil.
    requestAnimationFrame(() => {
      inputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  return (
    <>
      <input ref={inputRef} type="hidden" name={name} value={value} />
      <MarkdownEditor {...editorProps} value={value} onChange={changeValue} />
    </>
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

function GalleryGlyph() {
  return (
    <Glyph>
      <rect x="2" y="6" width="6" height="12" rx="1.5" />
      <rect x="9" y="6" width="6" height="12" rx="1.5" />
      <rect x="16" y="6" width="6" height="12" rx="1.5" />
    </Glyph>
  );
}

function FileGlyph() {
  return (
    <Glyph>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </Glyph>
  );
}

function VideoGlyph() {
  return (
    <Glyph>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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

function CodeGlyph() {
  return (
    <Glyph>
      <path d="m8 9-3 3 3 3" />
      <path d="m16 9 3 3-3 3" />
      <path d="m14 5-4 14" />
    </Glyph>
  );
}

function QuoteGlyph() {
  return (
    <Glyph>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h3c0 3-1 4-4 5v3z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h3c0 3-1 4-4 5v3z" />
    </Glyph>
  );
}

function HorizontalRuleGlyph() {
  return (
    <Glyph>
      <path d="M4 12h16" />
    </Glyph>
  );
}
