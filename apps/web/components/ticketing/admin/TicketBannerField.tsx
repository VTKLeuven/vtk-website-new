"use client";

/* De previews tonen een upload of een themabanner uit de eigen /api/media-route,
   160 pixels breed; next/image voegt hier niets toe. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { ImageFocusField } from "@/components/admin/ImageFocusField";
import { storageKeyPath } from "@/lib/storageKeyPath";
import { CENTER_FOCUS, focusPosition, type ImageFocus } from "@/lib/imageFocus";
import type { TicketBannerCategory } from "@/lib/ticketing/bannerCategories";
import type { AdminLocale } from "./format";

export type TicketBannerMode = "inherit" | "own" | "category";

/**
 * De banner van een ticketevent: die van het kalenderevent, een eigen foto, of
 * de standaardbanner van een kalenderthema. Welke er wint en waar hij komt,
 * staat in lib/ticketing/poster.ts.
 *
 * De drie keuzes zijn radiokaarten zoals de sjablonen van het ticketontwerp.
 * De uploader blijft gemonteerd wanneer een andere keuze aan staat (enkel
 * verborgen), zodat wie even naar een thema kijkt en terugkomt zijn upload niet
 * kwijt is; de server kijkt eerst naar `bannerMode` en negeert de rest.
 */
export function TicketBannerField({
  eventId,
  locale,
  defaultKey,
  defaultFocus,
  defaultCategoryId,
  categories,
  linked,
  linkedImageUrl,
}: {
  /** Leeg bij aanmaken. */
  eventId?: string;
  locale: AdminLocale;
  defaultKey?: string | null;
  defaultFocus?: ImageFocus | null;
  defaultCategoryId?: string | null;
  categories: TicketBannerCategory[];
  /** Hangt dit ticketevent (al) aan een kalenderevent? */
  linked: boolean;
  /** De foto van dat kalenderevent, als het er een heeft. */
  linkedImageUrl?: string | null;
}) {
  const nl = locale === "nl";
  const [mode, setMode] = useState<TicketBannerMode>(
    defaultKey ? "own" : defaultCategoryId ? "category" : "inherit",
  );
  const [key, setKey] = useState(defaultKey ?? "");
  const [focus, setFocus] = useState<ImageFocus>(defaultFocus ?? CENTER_FOCUS);
  const [categoryId, setCategoryId] = useState(
    categories.some((category) => category.id === defaultCategoryId)
      ? defaultCategoryId!
      : (categories[0]?.id ?? ""),
  );
  const category = categories.find((candidate) => candidate.id === categoryId) ?? null;

  const choices: { mode: TicketBannerMode; title: string; help: string; disabled?: boolean }[] = [
    {
      mode: "inherit",
      title: linked
        ? nl
          ? "Van het kalenderevent"
          : "From the calendar event"
        : nl
          ? "Geen eigen banner"
          : "No banner of its own",
      help: linked
        ? linkedImageUrl
          ? nl
            ? "De foto van het gekoppelde kalenderevent."
            : "The photo of the linked calendar event."
          : nl
            ? "Het kalenderevent heeft geen foto, dus er staat geen banner."
            : "The calendar event has no photo, so there is no banner."
        : eventId
          ? nl
            ? "De shop en /tickets tonen dan geen foto."
            : "The shop and /tickets then show no photo."
          : nl
            ? "Koppel je een kalenderevent, dan komt diens foto hier."
            : "Link a calendar event and its photo is used.",
    },
    {
      mode: "own",
      title: nl ? "Eigen foto" : "Own photo",
      help: nl ? "Een affiche of foto die je hier uploadt." : "A poster or photo you upload here.",
    },
    {
      mode: "category",
      title: nl ? "Standaardbanner van een thema" : "Default banner of a theme",
      help:
        categories.length > 0
          ? nl
            ? "Dezelfde foto die een evenement van dat thema zonder affiche krijgt."
            : "The same photo an event of that theme gets without a poster."
          : nl
            ? "Nog geen enkel thema heeft een banner; dat stel je in bij Kalender, Categorieën."
            : "No theme has a banner yet; set one under Calendar, Categories.",
      disabled: categories.length === 0,
    },
  ];

  return (
    <div className="ticket-admin-field" data-span="2">
      <span className="ticket-admin-label">{nl ? "Banner" : "Banner"}</span>
      <input type="hidden" name="bannerMode" value={mode} />
      <div className="ticket-design-templates" role="radiogroup" aria-label={nl ? "Banner" : "Banner"}>
        {choices.map((choice) => (
          <label
            key={choice.mode}
            className={mode === choice.mode ? "is-selected" : undefined}
            aria-disabled={choice.disabled || undefined}
            style={choice.disabled ? { cursor: "not-allowed", opacity: 0.6 } : undefined}
          >
            <input
              type="radio"
              name="bannerModeChoice"
              value={choice.mode}
              checked={mode === choice.mode}
              disabled={choice.disabled}
              onChange={() => setMode(choice.mode)}
            />
            <strong>{choice.title}</strong>
            <span>{choice.help}</span>
          </label>
        ))}
      </div>

      {mode === "inherit" && linked && linkedImageUrl ? (
        <img className="ticket-banner-preview" src={linkedImageUrl} alt="" />
      ) : null}

      <div hidden={mode !== "own"} className="ticket-banner-own">
        <StorageImageField
          defaultKey={defaultKey}
          locale={locale}
          ticketEventId={eventId}
          label={nl ? "Foto" : "Photo"}
          helpText={
            nl
              ? "Neem de originele affiche van minstens 1600 px breed: een kleine foto oogt wazig in de shop."
              : "Use the original poster, at least 1600 px wide: a small photo looks blurry in the shop."
          }
          minWidth={1600}
          onChange={setKey}
          previewPosition={focusPosition(focus)}
          srContext={nl ? "banner" : "banner"}
        />
        <ImageFocusField
          imageUrl={key ? `/api/media/${storageKeyPath(key)}` : null}
          defaultFocus={defaultFocus}
          locale={locale}
          label={nl ? "Deel van de foto dat in beeld blijft" : "Part of the photo that stays in view"}
          helpText={
            nl
              ? "Sleep het bolletje naar wat zeker zichtbaar moet blijven, bijvoorbeeld de tekst op een affiche."
              : "Drag the dot to whatever has to stay visible, for instance the text on a poster."
          }
          previews={[
            { label: nl ? "Nieuws en /tickets" : "News and /tickets", ratio: "16 / 9" },
            { label: nl ? "Ticketshop" : "Ticket shop", ratio: "16 / 10" },
          ]}
          onChange={setFocus}
        />
      </div>

      {mode === "category" && categories.length > 0 ? (
        <div className="ticket-banner-category">
          <select
            aria-label={nl ? "Thema" : "Theme"}
            name="imageCategoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {nl ? option.nameNl : option.nameEn}
              </option>
            ))}
          </select>
          {category ? <img className="ticket-banner-preview" src={category.imageUrl} alt="" /> : null}
        </div>
      ) : null}
    </div>
  );
}
