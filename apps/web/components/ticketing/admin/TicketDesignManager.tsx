"use client";

/* The storage preview is an editor-only arbitrary local asset; next/image
 * cannot know its dimensions before the upload. */
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, ImagePlus, LoaderCircle, Palette, Save, Send, Upload } from "lucide-react";
import {
  publishTicketDesignAction,
  saveTicketDesignDraftAction,
} from "@/app/actions/tickets";
import {
  DEFAULT_TICKET_DESIGN,
  TICKET_DESIGN_TEMPLATES,
  type TicketDesignDraft,
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
  const busy = pending || Boolean(uploading);

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
        await saveTicketDesignDraftAction(eventId, locale, design);
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
        const result = await publishTicketDesignAction(eventId, locale, design);
        setLiveRevision(result.revision);
        setNotice(message(locale, `Ontwerpversie ${result.revision} gepubliceerd.`, `Design revision ${result.revision} published.`));
      } catch (publishError) {
        console.error("Ticket design publish failed", publishError);
        setError(message(locale, "Het ontwerp kon niet worden gepubliceerd.", "The design could not be published."));
      }
    });
  }

  async function preview() {
    setError(null);
    try {
      const response = await fetch(`/api/tickets/events/${encodeURIComponent(eventId)}/design/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(design),
      });
      if (!response.ok) throw new Error("PREVIEW_FAILED");
      const objectUrl = URL.createObjectURL(await response.blob());
      const previewWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!previewWindow) window.location.assign(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (previewError) {
      console.error("Ticket design preview failed", previewError);
      setError(message(locale, "De PDF-voorvertoning kon niet worden gemaakt.", "The PDF preview could not be generated."));
    }
  }

  const artworkUrl = assetUrl(design.artwork?.key);
  return (
    <section className="ticket-admin-section ticket-design-manager">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon"><Palette aria-hidden="true" size={17} /></span>
          <div>
            <h2>{message(locale, "Ticketontwerp", "Ticket design")}</h2>
            <p>{message(locale, "Elke download is één A4-pagina. QR-code en ticketgegevens blijven steeds leesbaar en scanbaar.", "Every download is one A4 page. The QR code and ticket details always remain readable and scannable.")}</p>
          </div>
        </div>
        {liveRevision ? <span className="ticket-admin-status" data-tone="success">{message(locale, `Live: versie ${liveRevision}`, `Live: revision ${liveRevision}`)}</span> : null}
      </div>

      <div className="ticket-admin-form-grid ticket-design-grid">
        <fieldset className="ticket-admin-field" data-span="2">
          <legend>{message(locale, "Sjabloon", "Template")}</legend>
          <div className="ticket-design-templates">
            {TICKET_DESIGN_TEMPLATES.map((template) => (
              <label key={template} className={design.template === template ? "is-selected" : ""}>
                <input type="radio" checked={design.template === template} onChange={() => update("template", template)} />
                <strong>{template === "CLASSIC" ? message(locale, "Classic", "Classic") : template === "POSTER_ARTWORK" ? message(locale, "Poster artwork", "Poster artwork") : message(locale, "Gesplitste artwork", "Split artwork")}</strong>
                <span>{template === "CLASSIC" ? message(locale, "Rustige klassieke indeling", "Clean classic layout") : template === "POSTER_ARTWORK" ? message(locale, "Grote afbeelding bovenaan", "Large artwork header") : message(locale, "Artwork naast de ticketinfo", "Artwork beside ticket details")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <ColourField label={message(locale, "Achtergrondkleur", "Background colour")} value={design.backgroundColor} onChange={(value) => update("backgroundColor", value)} />
        <ColourField label={message(locale, "Accentkleur", "Accent colour")} value={design.accentColor} onChange={(value) => update("accentColor", value)} />
        <ColourField label={message(locale, "Tekstkleur", "Text colour")} value={design.textColor} onChange={(value) => update("textColor", value)} />

        <AssetField label={message(locale, "Achtergrond / hero artwork", "Background / hero artwork")} kind="artwork" url={artworkUrl} uploading={uploading === "artwork"} onFile={(file) => upload("artwork", file)} locale={locale} />
        {design.artwork ? <>
          <RangeField label={message(locale, "Focus horizontaal", "Horizontal focal point")} value={design.artwork.focalX} onChange={(focalX) => update("artwork", { ...design.artwork!, focalX })} />
          <RangeField label={message(locale, "Focus verticaal", "Vertical focal point")} value={design.artwork.focalY} onChange={(focalY) => update("artwork", { ...design.artwork!, focalY })} />
        </> : null}
        <AssetField label={message(locale, "Eventlogo", "Event logo")} kind="eventLogo" url={assetUrl(design.eventLogoKey)} uploading={uploading === "eventLogo"} onFile={(file) => upload("eventLogo", file)} locale={locale} />
        <AssetField label={message(locale, "Sponsorlogo (optioneel)", "Sponsor logo (optional)")} kind="sponsorLogo" url={assetUrl(design.sponsorLogoKey)} uploading={uploading === "sponsorLogo"} onFile={(file) => upload("sponsorLogo", file)} locale={locale} />
        <label className="ticket-admin-field" data-span="2">
          <span>{message(locale, "Footer (NL, optioneel)", "Footer (NL, optional)")}</span>
          <textarea value={design.footerNl ?? ""} maxLength={280} onChange={(event) => update("footerNl", event.target.value || undefined)} />
        </label>
        <label className="ticket-admin-field" data-span="2">
          <span>{message(locale, "Footer (EN, optioneel)", "Footer (EN, optional)")}</span>
          <textarea value={design.footerEn ?? ""} maxLength={280} onChange={(event) => update("footerEn", event.target.value || undefined)} />
        </label>
      </div>

      {error ? <p className="ticket-design-message is-error">{error}</p> : null}
      {notice ? <p className="ticket-design-message"><CheckCircle2 aria-hidden="true" size={16} />{notice}</p> : null}
      <div className="ticket-admin-section-actions">
        <button className="ticket-admin-button" type="button" disabled={busy} onClick={save}>{pending ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}{message(locale, "Concept opslaan", "Save draft")}</button>
        <button className="ticket-admin-button" type="button" disabled={busy} onClick={preview}><Eye size={16} />{message(locale, "A4-PDF bekijken", "Preview A4 PDF")}</button>
        <button className="ticket-admin-button" data-variant="primary" type="button" disabled={busy} onClick={publish}><Send size={16} />{message(locale, "Ontwerp publiceren", "Publish design")}</button>
      </div>
    </section>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="ticket-admin-field"><span>{label}</span><span className="ticket-design-colour"><input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /><input value={value} pattern="#[0-9A-Fa-f]{6}" maxLength={7} onChange={(event) => onChange(event.target.value)} /></span></label>;
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="ticket-admin-field"><span>{label}: {value}%</span><input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function AssetField({ label, kind, url, uploading, onFile, locale }: { label: string; kind: AssetKind; url: string | null; uploading: boolean; onFile: (file: File) => void; locale: AdminLocale }) {
  return <div className="ticket-admin-field ticket-design-asset"><span>{label}</span><div>{url ? <img src={url} alt="" /> : <ImagePlus aria-hidden="true" size={22} />}<label className="ticket-admin-button"><Upload size={16} />{uploading ? message(locale, "Bezig…", "Uploading…") : message(locale, "Uploaden", "Upload")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }} /></label></div>{kind === "artwork" ? <small>{message(locale, "JPG, PNG of WebP, max. 12 MB", "JPG, PNG or WebP, max. 12 MB")}</small> : null}</div>;
}
