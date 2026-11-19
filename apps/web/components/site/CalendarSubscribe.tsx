"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { trackCalendarFeedCopy } from "@/lib/analytics-client";
import { catChipStyle } from "@/lib/catContrast";

/**
 * Abonneren op de kalender. Bewust abonneren en niet downloaden: een gedownload
 * .ics is een momentopname die nooit meer bijwerkt, terwijl een abonnement elke
 * wijziging vanzelf oppikt.
 *
 * De keuze zat vroeger impliciet in de filterchip: stond je op /kalender met
 * "Alumni" aan, dan wees de knop naar de alumni-feed zonder dat ergens te zeggen.
 * Dat is precies de soort stille koppeling waar iemand pas achter komt wanneer
 * hij drie maanden later geen enkel evenement in zijn agenda ziet. Nu zegt de
 * knop wat ze gaat doen, en zet de dialoog de vier zinvolle samenstellingen naast
 * elkaar:
 *
 * - de volledige kalender;
 * - de algemene evenementen samen met één doelgroep (het antwoord voor een
 *   alumnus: hij wil de alumni-avonden én de fuiven waar iedereen welkom is,
 *   maar niet de eerstejaarsdoop);
 * - enkel die ene doelgroep of categorie;
 * - een eigen selectie.
 *
 * Pas daaronder staan de drie manieren om zo'n feed toe te voegen, want geen
 * enkele link werkt overal: `webcal:` opent de standaard agenda-app, Google heeft
 * een eigen "toevoegen via URL"-scherm, en de gekopieerde link dekt de rest.
 */

export type SubscribeCategory = {
  slug: string;
  nameNl: string;
  nameEn: string;
  colour: string;
  audience: string | null;
};

type Mode = "all" | "generalPlus" | "only" | "custom";

export function CalendarSubscribe({
  feedBaseUrl,
  categories,
  selectedSlug,
  locale,
  labels,
  compact = false,
}: {
  /**
   * Absolute URL van de hoofdfeed, zonder selectie (`https://vtk.be/api/calendar/feed.ics`,
   * eventueel met `?lang=en`). De dialoog hangt er zelf `c`- en `algemeen`-
   * parameters aan; absoluut, want de URL belandt in een `webcal:`-link en in het
   * klembord, en een relatief pad doet daar niets.
   */
  feedBaseUrl: string;
  categories: SubscribeCategory[];
  /** De categorie waar de kalender nu op staat, of `null` voor "alles". */
  selectedSlug: string | null;
  locale: "nl" | "en";
  labels: { title: string; sub: string };
  /** In de kalenderwerkbalk volstaat één korte knop; de dialoog legt de rest uit. */
  compact?: boolean;
}) {
  const nl = locale === "nl";
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "google" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pressedOutsideRef = useRef(false);
  const suppressCloseCountRef = useRef(0);
  const wasOpenRef = useRef(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  // De wortel van het ontwerp op deze pagina, waar het venster in komt te hangen.
  // Pas na het monteren, want de server kent hem niet.
  useEffect(() => {
    setPortalHost(boxRef.current?.closest<HTMLElement>(".vtk-design") ?? document.body);
  }, []);

  const selected = categories.find((c) => c.slug === selectedSlug) ?? null;
  const categoryName = (c: SubscribeCategory) => (nl ? c.nameNl : c.nameEn);

  const [mode, setMode] = useState<Mode>(selected ? "generalPlus" : "all");
  const [customSlugs, setCustomSlugs] = useState<string[]>(selected ? [selected.slug] : []);
  const [customGeneral, setCustomGeneral] = useState(true);

  const [prevSelectedSlug, setPrevSelectedSlug] = useState(selectedSlug);
  if (!open && prevSelectedSlug !== selectedSlug) {
    setPrevSelectedSlug(selectedSlug);
    setMode(selectedSlug ? "generalPlus" : "all");
    setCustomSlugs(selectedSlug ? [selectedSlug] : []);
  }

  // Het vinkje mag niet blijven staan: na een paar seconden is de knop weer een
  // gewone kopieerknop.
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 3500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      wasOpenRef.current = true;
      if (!openerRef.current && document.activeElement instanceof HTMLElement) {
        openerRef.current = document.activeElement;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      if (!dialog.contains(document.activeElement)) {
        closeBtnRef.current?.focus();
      }
      return () => {
        if (dialog.open) {
          suppressCloseCountRef.current += 1;
          dialog.close();
        }
      };
    }
    if (dialog.open) {
      suppressCloseCountRef.current += 1;
      dialog.close();
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) opener.focus();
    }
  }, [open, portalHost]);

  function isOutside(clientX: number, clientY: number, dialog: HTMLDialogElement) {
    const r = dialog.getBoundingClientRect();
    return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
  }

  const feedUrl = useMemo(() => {
    const url = new URL(feedBaseUrl);
    url.searchParams.delete("c");
    url.searchParams.delete("algemeen");

    if (mode === "all") return url.toString();
    if (mode === "only" && selected) {
      url.searchParams.append("c", selected.slug);
      return url.toString();
    }
    if (mode === "generalPlus" && selected) {
      url.searchParams.set("algemeen", "1");
      url.searchParams.append("c", selected.slug);
      return url.toString();
    }
    // Eigen selectie. Niets aangevinkt betekent alles; zie feedScopeFromQuery.
    if (customGeneral) url.searchParams.set("algemeen", "1");
    for (const slug of customSlugs) url.searchParams.append("c", slug);
    return url.toString();
  }, [feedBaseUrl, mode, selected, customGeneral, customSlugs]);

  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  // Google ondersteunt "Via URL" officieel, maar niet een stabiele deeplink die
  // een externe ICS-feed vooraf invult. Open daarom precies dat instellingenscherm
  // en kopieer de URL bij de klik, in plaats van de foutgevoelige `?cid=`-route.
  const googleUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

  async function copy(kind: "link" | "google" = "link") {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(kind);
      trackCalendarFeedCopy();
    } catch {
      // Clipboard geweigerd (geen https, of de gebruiker blokkeert het): dan
      // selecteert hij de link zelf maar, geen reden om iets te laten crashen.
    }
  }

  const buttonLabel = selected
    ? nl
      ? `Abonneren op de ${categoryName(selected).toLowerCase()}-kalender`
      : `Subscribe to the ${categoryName(selected).toLowerCase()} calendar`
    : nl
      ? "Abonneren"
      : "Subscribe";

  function toggleCustom(slug: string) {
    setCustomSlugs((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  const options: Array<{ value: Mode; label: string; hint: string }> = [
    {
      value: "all",
      label: nl ? "De hele kalender" : "The whole calendar",
      hint: nl
        ? "Alles wat VTK inplant, inclusief alle doelgroepen."
        : "Everything VTK plans, including every target audience.",
    },
    ...(selected
      ? [
          {
            value: "generalPlus" as const,
            label: nl
              ? `Algemene evenementen + ${categoryName(selected)}`
              : `General events + ${categoryName(selected)}`,
            hint: nl
              ? "Alles waar iedereen welkom is, plus wat specifiek voor deze doelgroep is."
              : "Everything open to everyone, plus what is specific to this audience.",
          },
          {
            value: "only" as const,
            label: nl ? `Enkel ${categoryName(selected)}` : `Only ${categoryName(selected)}`,
            hint: nl
              ? "Niets anders; je agenda blijft leeg op weken zonder zo'n activiteit."
              : "Nothing else; your calendar stays empty in weeks without such an activity.",
          },
        ]
      : []),
    {
      value: "custom",
      label: nl ? "Zelf samenstellen" : "Compose it yourself",
      hint: nl
        ? "Kies hieronder welke categorieën mee mogen."
        : "Choose below which categories are included.",
    },
  ];

  return (
    <div ref={boxRef} className={`subscribe-box${compact ? " subscribe-compact" : ""}`}>
      {!compact ? (
        <>
          <h3>{labels.title}</h3>
          <div className="sub">{labels.sub}</div>
        </>
      ) : null}
      {/* Zeggen waar het naartoe gaat vóór er iemand op duwt. "Abonneren" alleen
          laat in het midden of je een bestand krijgt, een mail, of iets in je
          agenda; dit is precies de onduidelijkheid die maakt dat mensen er niet
          op klikken. */}
      {!compact ? (
        <p className="subscribe-how">
          {nl
            ? "In je agenda-app, in Google Calendar, of via een abonnementslink."
            : "In your calendar app, in Google Calendar, or through a subscription link."}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary arrow subscribe-open"
        onClick={(event) => {
          openerRef.current = event.currentTarget;
          setOpen(true);
        }}
      >
        {compact ? labels.title : buttonLabel}
      </button>

      {/* Het venster hangt in de designwortel zodat de stylesheet onder
          `.vtk-design` mee blijft werken; met `<dialog>` + `showModal()` ligt
          het venster zelf in de top layer boven elke stacking context. */}
      {portalHost
        ? createPortal(
            <dialog
              ref={dialogRef}
              className="subscribe-dialog"
              aria-labelledby={open ? headingId : undefined}
              {...({ closedby: "any" } as Record<string, string>)}
              onCancel={(event) => {
                event.preventDefault();
                setOpen(false);
              }}
              onClose={(event) => {
                if (suppressCloseCountRef.current > 0) {
                  suppressCloseCountRef.current -= 1;
                  return;
                }
                if (event.currentTarget.open) return;
                setOpen(false);
              }}
              onPointerDown={(event) => {
                if ("closedBy" in HTMLDialogElement.prototype) {
                  pressedOutsideRef.current = false;
                  return;
                }
                pressedOutsideRef.current =
                  event.target === event.currentTarget &&
                  isOutside(event.clientX, event.clientY, event.currentTarget);
              }}
              onPointerUp={(event) => {
                if ("closedBy" in HTMLDialogElement.prototype) return;
                const wasOutside = pressedOutsideRef.current;
                pressedOutsideRef.current = false;
                if (
                  wasOutside &&
                  event.target === event.currentTarget &&
                  isOutside(event.clientX, event.clientY, event.currentTarget)
                ) {
                  setOpen(false);
                }
              }}
            >
              {open ? (
                <div className="subscribe-modal">
                  <div className="subscribe-modal-head">
                    <h3 id={headingId}>
                      {nl ? "Wat wil je in je agenda?" : "What do you want in your calendar?"}
                    </h3>
                    <button
                      ref={closeBtnRef}
                      type="button"
                      className="subscribe-close"
                      onClick={() => setOpen(false)}
                      aria-label={nl ? "Sluiten" : "Close"}
                    >
                      ×
                    </button>
                  </div>

                  <fieldset className="subscribe-fieldset">
                    <legend className="sr-only">
                      {nl ? "Wat wil je in je agenda?" : "What do you want in your calendar?"}
                    </legend>
                    <div className="subscribe-choices">
                      {options.map((option) => (
                        <label key={option.value} className={mode === option.value ? "on" : ""}>
                          <input
                            type="radio"
                            name="subscribe-mode"
                            value={option.value}
                            checked={mode === option.value}
                            onChange={() => setMode(option.value)}
                          />
                          <span>
                            <b>{option.label}</b>
                            <small>{option.hint}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {mode === "custom" && (
                    <fieldset className="subscribe-fieldset">
                      <legend className="sr-only">
                        {nl ? "Categorieën in eigen selectie" : "Categories in custom selection"}
                      </legend>
                      <div className="subscribe-custom">
                        <label className="subscribe-chip">
                          <input
                            type="checkbox"
                            checked={customGeneral}
                            onChange={(event) => setCustomGeneral(event.target.checked)}
                          />
                          {nl ? "Algemene evenementen" : "General events"}
                        </label>
                        {categories.map((category) => (
                          <label
                            key={category.slug}
                            className="subscribe-chip"
                            style={catChipStyle(category.colour)}
                          >
                            <input
                              type="checkbox"
                              checked={customSlugs.includes(category.slug)}
                              onChange={() => toggleCustom(category.slug)}
                            />
                            {categoryName(category)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  <p className="subscribe-how subscribe-how-modal">
                    {nl
                      ? "Kies hieronder hoe je hem toevoegt. Je agenda haalt de kalender daarna zelf op, dus nieuwe evenementen komen er vanzelf bij."
                      : "Choose below how to add it. Your calendar fetches it from then on, so new events appear on their own."}
                  </p>

                  <p className="sr-only" role="status" aria-live="polite">
                    {copied === "google"
                      ? nl
                        ? "Feed-link gekopieerd naar klembord. Plak hem in Google Calendar."
                        : "Feed link copied to clipboard. Paste it in Google Calendar."
                      : copied === "link"
                        ? nl
                          ? "Feed-link gekopieerd naar klembord."
                          : "Feed link copied to clipboard."
                        : ""}
                  </p>

                  <div className="subscribe-actions">
                    <a className="btn btn-ghost arrow" href={webcalUrl}>
                      {nl ? "Agenda-app" : "Calendar app"}
                    </a>
                    <a
                      className="btn btn-ghost arrow"
                      href={googleUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => void copy("google")}
                    >
                      {copied === "google"
                        ? nl
                          ? "Link gekopieerd. Plak hem in Google"
                          : "Link copied. Paste it in Google"
                        : "Google Calendar"}
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost subscribe-copy"
                      onClick={() => void copy("link")}
                      title={
                        copied === "link"
                          ? nl
                            ? "Gekopieerd"
                            : "Copied"
                          : nl
                            ? "Kopieer feed-link"
                            : "Copy feed link"
                      }
                    >
                      {copied === "link" ? <CheckIcon /> : <CopyIcon />}
                      <span>
                        {copied === "link"
                          ? nl
                            ? "Gekopieerd"
                            : "Copied"
                          : nl
                            ? "Kopieer link"
                            : "Copy link"}
                      </span>
                    </button>
                  </div>

                  <p className="subscribe-hint">
                    {nl
                      ? "Google opent ‘Via URL’. Plak daar de feed-link die bij je klik wordt gekopieerd."
                      : "Google opens ‘From URL’. Paste the feed link copied when you click."}
                  </p>
                </div>
              ) : null}
            </dialog>,
            portalHost,
          )
        : null}
    </div>
  );
}
