"use client";

/* The storage preview is an editor-only arbitrary local asset; next/image
 * cannot know its dimensions before the upload. */
/* eslint-disable @next/next/no-img-element */

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Upload,
  X,
} from "lucide-react";
import {
  publishTicketDesignAction,
  saveTicketDesignDraftAction,
} from "@/app/actions/tickets";
import {
  DEFAULT_TICKET_DESIGN,
  TICKET_POSTER_RATIOS,
  type TicketDesignDraft,
  type TicketPdfVariant,
  type TicketPosterRatio,
} from "@/lib/ticketing/design";
import type { AdminLocale } from "./format";

type AssetKind = "artwork" | "eventLogo" | "sponsorLogo";

function assetUrl(key: string | undefined) {
  return key ? `/api/media/${key.split("/").map(encodeURIComponent).join("/")}` : null;
}

function message(locale: AdminLocale, nl: string, en: string) {
  return locale === "nl" ? nl : en;
}

export function TicketDesignManager({
  eventId,
  initialDraft,
  publishedRevision,
  locale,
}: {
  eventId: string;
  initialDraft?: TicketDesignDraft;
  publishedRevision?: number;
  locale: AdminLocale;
}) {
  const [design, setDesign] = useState<TicketDesignDraft>(initialDraft ?? DEFAULT_TICKET_DESIGN);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<AssetKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveRevision, setLiveRevision] = useState(publishedRevision);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<TicketPdfVariant>("colour");
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);
  const hasGeneratedRef = useRef(false);
  const busy = pending || Boolean(uploading);

  async function refreshPreview() {
    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/tickets/events/${encodeURIComponent(eventId)}/design/preview?variant=${previewVariant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(design),
      });
      if (!response.ok) throw new Error("PREVIEW_FAILED");
      const blob = await response.blob();
      // A later edit may have started its own request while this one was in
      // flight; only the most recent request may still update the preview.
      if (requestId !== previewRequestRef.current) return;
      const nextUrl = URL.createObjectURL(blob);
      const previous = previewUrlRef.current;
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setPreviewError(false);
      if (previous) URL.revokeObjectURL(previous);
    } catch (previewFetchError) {
      if (requestId !== previewRequestRef.current) return;
      console.error("Ticket design preview failed", previewFetchError);
      setPreviewError(true);
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }

  // `design` is a fresh object on every edit (and the colour/print switch
  // swaps the preview), so those are the right dependencies: the first change fires immediately, later ones debounce so
  // typing doesn't refetch a full PDF on every keystroke. `refreshPreview` is
  // recreated each render and always closes over this same `design`, so
  // omitting it from the deps array does not risk a stale preview.
  useEffect(() => {
    if (!hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      refreshPreview();
      return;
    }
    const timer = setTimeout(refreshPreview, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, previewVariant]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function update<K extends keyof TicketDesignDraft>(key: K, value: TicketDesignDraft[K]) {
    setDesign((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  async function upload(kind: AssetKind, file: File) {
    setUploading(kind);
    setError(null);
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    try {
      const response = await fetch(`/api/tickets/events/${encodeURIComponent(eventId)}/design/upload`, { method: "POST", body: form });
      const data = await response.json() as { key?: string; error?: string };
      if (!response.ok || !data.key) throw new Error(data.error || "UPLOAD_FAILED");
      setDesign((current) => kind === "artwork"
        ? { ...current, artwork: { key: data.key!, focalX: current.artwork?.focalX ?? 50, focalY: current.artwork?.focalY ?? 50 } }
        : { ...current, [kind === "eventLogo" ? "eventLogoKey" : "sponsorLogoKey"]: data.key! });
      setNotice(message(locale, "Afbeelding geüpload. Sla je ontwerp op om het te bewaren.", "Image uploaded. Save the draft to keep it."));
    } catch (uploadError) {
      setError(message(locale, "Uploaden lukte niet. Gebruik een JPG, PNG of WebP binnen de limiet.", "Upload failed. Use a JPG, PNG or WebP within the size limit."));
      console.error("Ticket design upload failed", uploadError);
    } finally {
      setUploading(null);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        if ((await unsentGuard.run(() => saveTicketDesignDraftAction(eventId, locale, design))) === UNSENT) return;
        setNotice(message(locale, "Concept opgeslagen.", "Draft saved."));
      } catch (saveError) {
        console.error("Ticket design draft save failed", saveError);
        setError(message(locale, "Het concept kon niet worden opgeslagen.", "The draft could not be saved."));
      }
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unsentGuard.run(() => publishTicketDesignAction(eventId, locale, design));
        if (result === UNSENT) return;
        setLiveRevision(result.revision);
        setNotice(message(locale, `Ontwerpversie ${result.revision} gepubliceerd.`, `Design revision ${result.revision} published.`));
      } catch (publishError) {
        console.error("Ticket design publish failed", publishError);
        setError(message(locale, "Het ontwerp kon niet worden gepubliceerd.", "The design could not be published."));
      }
    });
  }

  const artworkUrl = assetUrl(design.artwork?.key);
  return (
    <section className="ticket-admin-section ticket-design-manager">
      {/* De titel staat in de kop van het venster eromheen; hier blijft enkel de
          uitleg en welke versie er live staat. */}
      <div className="ticket-admin-section-head">
        <p className="ticket-admin-help">{message(locale, "Elk ticket bestaat in twee versies uit dit ene ontwerp: in kleur om te tonen, en een printversie in zwart-wit zonder inktvlakken. Allebei één A4-pagina per ticket; de QR-code en de gegevens blijven altijd leesbaar en scanbaar.", "Every ticket comes in two versions from this one design: in colour to show, and a black-and-white print version without areas of ink. Both are one A4 page per ticket; the QR code and the details always stay readable and scannable.")}</p>
        {liveRevision ? <span className="ticket-admin-status" data-tone="success">{message(locale, `Live: versie ${liveRevision}`, `Live: revision ${liveRevision}`)}</span> : null}
      </div>

      <div className="ticket-design-layout">
        <div className="ticket-design-layout-form">
          <div className="ticket-admin-form-grid ticket-design-grid">
            <SectionTitle>{message(locale, "Kleuren", "Colours")}</SectionTitle>
            <ColourField label={message(locale, "Achtergrond (kleurversie)", "Background (colour version)")} value={design.backgroundColor} fallback={DEFAULT_TICKET_DESIGN.backgroundColor} onChange={(value) => update("backgroundColor", value)} locale={locale} />
            <ColourField label={message(locale, "Accent (datumpin, streep, rand)", "Accent (date pin, rule, edge)")} value={design.accentColor} fallback={DEFAULT_TICKET_DESIGN.accentColor} onChange={(value) => update("accentColor", value)} locale={locale} />
            <ColourField label={message(locale, "Tekstkleur", "Text colour")} value={design.textColor} fallback={DEFAULT_TICKET_DESIGN.textColor} onChange={(value) => update("textColor", value)} locale={locale} />

            <SectionTitle>{message(locale, "Affiche (kleurversie)", "Poster (colour version)")}</SectionTitle>
            <AssetField label={message(locale, "Affiche", "Poster")} kind="artwork" url={artworkUrl} uploading={uploading === "artwork"} onFile={(file) => upload("artwork", file)} onClear={design.artwork ? () => update("artwork", undefined) : undefined} locale={locale} hint={message(locale, "Zonder affiche: de banner van het ticketevent, en zonder banner een navy vlak met het technische patroon en het VTK-logo.", "Without a poster: the banner of the ticket event, and without a banner a navy panel with the technical pattern and the VTK logo.")} />
            {design.artwork ? <>
              <RangeField label={message(locale, "Focus horizontaal", "Horizontal focal point")} value={design.artwork.focalX} onChange={(focalX) => update("artwork", { ...design.artwork!, focalX })} />
              <RangeField label={message(locale, "Focus verticaal", "Vertical focal point")} value={design.artwork.focalY} onChange={(focalY) => update("artwork", { ...design.artwork!, focalY })} />
            </> : null}
            <fieldset className="ticket-admin-field" data-span="2">
              <legend>{message(locale, "Vorm van de affiche", "Poster shape")}</legend>
              <div className="ticket-design-templates" data-count="4">
                {TICKET_POSTER_RATIOS.map((ratio) => (
                  <label key={ratio} className={design.posterRatio === ratio ? "is-selected" : ""}>
                    <input type="radio" name="posterRatio" checked={design.posterRatio === ratio} onChange={() => update("posterRatio", ratio)} />
                    <strong>{ratio}</strong>
                    <span>{ratioLabel(ratio, locale)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <CheckField label={message(locale, "Gele datumpin over de affiche", "Yellow date pin over the poster")} checked={design.showDatePin} onChange={(value) => update("showDatePin", value)} />

            <SectionTitle>{message(locale, "Logo's", "Logos")}</SectionTitle>
            <AssetField label={message(locale, "Eventlogo (rechtsboven)", "Event logo (top right)")} kind="eventLogo" url={assetUrl(design.eventLogoKey)} uploading={uploading === "eventLogo"} onFile={(file) => upload("eventLogo", file)} onClear={design.eventLogoKey ? () => update("eventLogoKey", undefined) : undefined} locale={locale} />
            <AssetField label={message(locale, "Sponsorlogo (onderaan)", "Sponsor logo (bottom)")} kind="sponsorLogo" url={assetUrl(design.sponsorLogoKey)} uploading={uploading === "sponsorLogo"} onFile={(file) => upload("sponsorLogo", file)} onClear={design.sponsorLogoKey ? () => update("sponsorLogoKey", undefined) : undefined} locale={locale} />

            <SectionTitle>{message(locale, "Wat er op het ticket staat", "What the ticket shows")}</SectionTitle>
            <div className="ticket-admin-field" data-span="2">
              <CheckField label={message(locale, "Locatie", "Location")} checked={design.showLocation} onChange={(value) => update("showLocation", value)} />
              <CheckField label={message(locale, "Prijs", "Price")} checked={design.showPrice} onChange={(value) => update("showPrice", value)} />
              <CheckField label={message(locale, "Bestelnummer", "Order number")} checked={design.showOrderNumber} onChange={(value) => update("showOrderNumber", value)} />
            </div>
            <label className="ticket-admin-field">
              <span>{message(locale, "Aan de ingang (NL, optioneel)", "At the entrance (NL, optional)")}</span>
              <textarea value={design.noteNl ?? ""} maxLength={280} placeholder={message(locale, "Bv. deuren open om 19:30, enkel 18+", "E.g. doors open at 19:30, 18+ only")} onChange={(event) => update("noteNl", event.target.value || undefined)} />
            </label>
            <label className="ticket-admin-field">
              <span>{message(locale, "Aan de ingang (EN, optioneel)", "At the entrance (EN, optional)")}</span>
              <textarea value={design.noteEn ?? ""} maxLength={280} onChange={(event) => update("noteEn", event.target.value || undefined)} />
            </label>
            <p className="ticket-admin-help" data-span="2">{message(locale, "Vervangt de standaardtekst over het scannen. Leeg laten houdt die standaardtekst.", "Replaces the default text about scanning. Leave empty to keep the default.")}</p>
            <label className="ticket-admin-field">
              <span>{message(locale, "Voettekst (NL, optioneel)", "Footer (NL, optional)")}</span>
              <textarea value={design.footerNl ?? ""} maxLength={280} onChange={(event) => update("footerNl", event.target.value || undefined)} />
            </label>
            <label className="ticket-admin-field">
              <span>{message(locale, "Voettekst (EN, optioneel)", "Footer (EN, optional)")}</span>
              <textarea value={design.footerEn ?? ""} maxLength={280} onChange={(event) => update("footerEn", event.target.value || undefined)} />
            </label>

            <SectionTitle>{message(locale, "Printversie", "Print version")}</SectionTitle>
            <div className="ticket-admin-field" data-span="2">
              <CheckField label={message(locale, "Technisch patroon in de kop (dunne grijze lijnen)", "Technical pattern in the header (thin grey lines)")} checked={design.printPattern} onChange={(value) => update("printPattern", value)} />
              <CheckField label={message(locale, "Accentstreep onder de kop (op zwart-wit een lichtgrijze lijn)", "Accent rule under the header (a light grey line in black and white)")} checked={design.printAccent} onChange={(value) => update("printAccent", value)} />
            </div>
          </div>

          {error ? <p className="ticket-design-message is-error">{error}</p> : null}
          {notice ? <p className="ticket-design-message"><CheckCircle2 aria-hidden="true" size={16} />{notice}</p> : null}
          <div className="ticket-admin-section-actions">
            <button className="ticket-admin-button" type="button" disabled={busy} onClick={save}>{pending ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}{message(locale, "Concept opslaan", "Save draft")}</button>
            <button className="ticket-admin-button" data-variant="primary" type="button" disabled={busy} onClick={publish}><Send size={16} />{message(locale, "Ontwerp publiceren", "Publish design")}</button>
          </div>
        </div>

        <aside className="ticket-design-preview">
          <div className="ticket-design-preview-head">
            <span className="ticket-design-variants" role="group" aria-label={message(locale, "Welke versie", "Which version")}>
              {(["colour", "print"] as const).map((variant) => (
                <button key={variant} type="button" aria-pressed={previewVariant === variant} onClick={() => setPreviewVariant(variant)}>
                  {variant === "colour" ? message(locale, "Kleur", "Colour") : message(locale, "Print", "Print")}
                </button>
              ))}
            </span>
            <div className="ticket-design-preview-actions">
              <button className="ticket-admin-button" type="button" disabled={previewLoading} onClick={refreshPreview}>
                {previewLoading ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                {message(locale, "Bijwerken", "Refresh")}
              </button>
              {previewUrl ? (
                <a className="ticket-admin-button" href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />{message(locale, "Volledig", "Full size")}
                </a>
              ) : null}
            </div>
          </div>
          <div className="ticket-design-preview-frame">
            {/* `key` forces a fresh <iframe> element per preview: React would
                otherwise reuse the node and only swap `src`, which Chrome's
                built-in PDF viewer ignores, leaving the previous ticket on
                screen while the new one had already been fetched. */}
            {previewUrl ? <iframe key={previewUrl} src={previewUrl} title={message(locale, "Voorbeeld van het ticket", "Ticket preview")} /> : null}
            {previewLoading ? <div className="ticket-design-preview-overlay"><LoaderCircle className="animate-spin" size={20} /></div> : null}
            {previewError && !previewLoading ? (
              <div className="ticket-design-preview-overlay">
                <span>{message(locale, "Voorvertoning mislukt", "Preview failed")}</span>
              </div>
            ) : null}
          </div>
          <p className="ticket-design-preview-note">{message(locale, "Toont het concept met voorbeeldgegevens; werkt vanzelf bij na een wijziging, of meteen via Bijwerken.", "Shows the draft with sample data; updates by itself after a change, or immediately via Refresh.")}</p>
        </aside>
      </div>
    </section>
  );
}

/** The reset button only appears once the colour actually differs from the
 * VTK default, so it never sits there as a control that does nothing. It is
 * outside the <label> on purpose: a button nested in a label would also fire
 * when someone clicks the label text to focus the field. */
function ColourField({
  label,
  value,
  fallback,
  onChange,
  locale,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  locale: AdminLocale;
}) {
  const isDefault = value.toUpperCase() === fallback.toUpperCase();
  const resetLabel = message(locale, "Terug naar de standaardkleur", "Reset to the default colour");
  return (
    <div className="ticket-admin-field">
      <div className="ticket-design-colour-head">
        <label htmlFor={`colour-${label}`}>{label}</label>
        {isDefault ? null : (
          <button
            type="button"
            className="ticket-design-colour-reset"
            onClick={() => onChange(fallback)}
            title={resetLabel}
            aria-label={`${resetLabel}: ${label}`}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {message(locale, "Standaard", "Default")}
          </button>
        )}
      </div>
      <span className="ticket-design-colour">
        <input type="color" value={value} aria-label={label} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        <input id={`colour-${label}`} value={value} pattern="#[0-9A-Fa-f]{6}" maxLength={7} onChange={(event) => onChange(event.target.value)} />
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="ticket-design-section-title">{children}</h3>;
}

function ratioLabel(ratio: TicketPosterRatio, locale: AdminLocale): string {
  switch (ratio) {
    case "16:9": return message(locale, "Zoals op de kalender", "As on the calendar");
    case "3:2": return message(locale, "Hoger, meer affiche", "Taller, more poster");
    case "2:1": return message(locale, "Breed", "Wide");
    case "3:1": return message(locale, "Smalle band", "Narrow band");
  }
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="ticket-admin-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="ticket-admin-field"><span>{label}: {value}%</span><input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function AssetField({ label, kind, url, uploading, onFile, onClear, hint, locale }: { label: string; kind: AssetKind; url: string | null; uploading: boolean; onFile: (file: File) => void; onClear?: () => void; hint?: string; locale: AdminLocale }) {
  return (
    <div className="ticket-admin-field ticket-design-asset">
      <span>{label}</span>
      <div>
        {url ? <img src={url} alt="" /> : <ImagePlus aria-hidden="true" size={22} />}
        <label className="ticket-admin-button">
          <Upload size={16} />
          {uploading ? message(locale, "Bezig…", "Uploading…") : message(locale, "Uploaden", "Upload")}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }} />
        </label>
        {onClear ? (
          <button type="button" className="ticket-admin-button" onClick={onClear} title={message(locale, "Weghalen uit het ontwerp", "Remove from the design")} aria-label={`${message(locale, "Weghalen uit het ontwerp", "Remove from the design")}: ${label}`}>
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {kind === "artwork" ? <small>{message(locale, "JPG, PNG of WebP, max. 12 MB", "JPG, PNG or WebP, max. 12 MB")}</small> : null}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
