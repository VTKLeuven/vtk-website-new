"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Globe, Plus, Users } from "lucide-react";
import type { GalleryShareAudience } from "@prisma/client";
import { createShareLinkAction, revokeShareLinkAction, updateShareLinkAction } from "@/app/actions/media-share";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, CloseIcon, CopyIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import type { ShareLinkRow } from "@/lib/media-share";
import { DEFAULT_SHARE_TERM, SHARE_LABEL_MAX, SHARE_TERMS, shareExpiry, type ShareTerm } from "@/lib/media-share-shared";
import { albumErrorMessages } from "../../messages";

type Werkgroep = { id: string; name: string };
type Dialog = { mode: "new" } | { mode: "edit"; id: string } | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Europe/Brussels";

/**
 * Delen met een link, in het album zelf: tussen de schakelaar "Op vtk.be" en
 * het downloaden, de drie manieren waarop foto's het beheer verlaten.
 *
 * Een klik op de rij opent de link (aanpassen, verlengen, intrekken); het icoon
 * in de rij kopieert hem, want dat doe je het vaakst. Intrekken staat bewust
 * enkel in het venster: het is de enige onomkeerbare actie. Zie
 * docs/immich-gallery.md, "Een album delen met een link".
 */
export function AlbumShareLinks({
  locale,
  albumId,
  albumTitle,
  visibleCount,
  hiddenCount,
  links,
  werkgroepen,
  now: nowIso,
}: {
  locale: string;
  albumId: string;
  albumTitle: string;
  /** De foto's die een link toont: de zichtbare van alle tabs samen. */
  visibleCount: number;
  hiddenCount: number;
  links: ShareLinkRow[];
  werkgroepen: Werkgroep[];
  /** Het moment waarop de server de pagina tekende, zodat "nog 6 dagen" niet verspringt. */
  now: string;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Welke links er al waren toen "Nieuwe link" openging: de nieuwe link is de
  // link die er daarna bij komt, en die tonen we meteen om te kopiëren.
  const [knownAtOpen, setKnownAtOpen] = useState<Set<string> | null>(null);
  const [awaitingCreated, setAwaitingCreated] = useState(false);

  const formats = useMemo(() => {
    const tag = nl ? "nl-BE" : "en-GB";
    return {
      short: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }),
      day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }),
      long: new Intl.DateTimeFormat(tag, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: TIME_ZONE,
      }),
      ymd: new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }),
    };
  }, [nl]);

  // Afgeleid tijdens het tekenen, niet bijgestuurd in een effect: een
  // ingetrokken link verdwijnt uit `links`, en daarmee vanzelf zijn venster.
  const editing = dialog?.mode === "edit" ? (links.find((link) => link.id === dialog.id) ?? null) : null;
  const creating = dialog?.mode === "new";
  const created =
    awaitingCreated && knownAtOpen ? (links.find((link) => !knownAtOpen.has(link.id)) ?? null) : null;
  const anyOpen = creating || editing !== null || created !== null;

  function closeAll() {
    setDialog(null);
    setAwaitingCreated(false);
  }

  useEffect(() => {
    if (!anyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDialog(null);
      setAwaitingCreated(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyOpen]);

  const isExpired = (link: ShareLinkRow) => new Date(link.expiresAt) <= now;
  const activeCount = links.filter((link) => !isExpired(link)).length;

  function openNew() {
    setKnownAtOpen(new Set(links.map((link) => link.id)));
    setAwaitingCreated(false);
    setDialog({ mode: "new" });
  }

  async function copy(link: ShareLinkRow) {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      setTimeout(() => setCopied((value) => (value === link.id ? null : value)), 2000);
      showToast({ message: nl ? "Link gekopieerd." : "Link copied.", variant: "success" });
    } catch {
      showToast({
        message: nl
          ? "Kopiëren lukte niet. Open de link en kopieer hem uit het veld."
          : "Copying failed. Open the link and copy it from the field.",
        variant: "error",
        duration: 0,
      });
    }
  }

  return (
    <section className="media-share" aria-labelledby="media-share-title">
      <div className="media-share-head">
        <span>
          <b id="media-share-title">{nl ? "Delen met een link" : "Share with a link"}</b>
          <small>
            {nl
              ? "Wie de link heeft, ziet dit album op vtk.be, ook al staat het niet op de mediapagina. Verborgen foto's zitten er niet in."
              : "Whoever has the link sees this album on vtk.be, even when it is not on the media page. Hidden photos are not included."}
          </small>
        </span>
        <button type="button" className="ticket-admin-button" onClick={openNew}>
          <Plus aria-hidden="true" size={15} />
          {nl ? "Nieuwe link" : "New link"}
        </button>
      </div>

      {links.length === 0 ? (
        <p className="media-share-empty">
          {nl
            ? "Nog geen links. Met Nieuwe link deel je dit album zonder het op de site te zetten."
            : "No links yet. New link shares this album without putting it on the site."}
        </p>
      ) : (
        <div className="media-share-table-wrap">
          <table className="media-share-table">
            <thead>
              <tr>
                <th scope="col">{nl ? "Voor wie" : "For"}</th>
                <th scope="col">{nl ? "Toegang" : "Access"}</th>
                <th scope="col">{nl ? "Geldig tot" : "Valid until"}</th>
                <th scope="col">{nl ? "Geopend" : "Opened"}</th>
                <th scope="col">
                  <span className="sr-only">{nl ? "Kopiëren" : "Copy"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const expired = isExpired(link);
                const until = new Date(link.expiresAt);
                const daysLeft = Math.ceil((until.getTime() - now.getTime()) / DAY_MS);
                const open = () => setDialog({ mode: "edit", id: link.id });
                return (
                  <tr key={link.id} data-expired={expired ? "true" : undefined} onClick={open}>
                    <td data-label={nl ? "Voor wie" : "For"}>
                      <button
                        type="button"
                        className="media-share-title"
                        onClick={(event) => {
                          event.stopPropagation();
                          open();
                        }}
                      >
                        {link.label}
                      </button>
                    </td>
                    <td data-label={nl ? "Toegang" : "Access"}>
                      <span className="media-share-access">
                        {link.audience === "LINK" ? <Globe aria-hidden="true" size={14} /> : <Users aria-hidden="true" size={14} />}
                        {audienceLabel(nl, link.audience, link.groupName)}
                      </span>
                      <small>
                        {link.allowDownload
                          ? nl
                            ? "bekijken en downloaden"
                            : "view and download"
                          : nl
                            ? "enkel bekijken"
                            : "view only"}
                      </small>
                    </td>
                    <td data-label={nl ? "Geldig tot" : "Valid until"}>
                      {expired ? (
                        <>
                          <span className="media-share-pill">{nl ? "Verlopen" : "Expired"}</span>
                          <small>
                            {nl ? "op" : "on"} {formats.short.format(until)}
                          </small>
                        </>
                      ) : (
                        <>
                          <span className="num">{formats.short.format(until)}</span>
                          <small className={daysLeft < 8 ? "is-warn" : undefined}>{timeLeft(nl, daysLeft)}</small>
                        </>
                      )}
                    </td>
                    <td data-label={nl ? "Geopend" : "Opened"}>
                      <span className="num">{link.openCount}×</span>
                      <small>{lastOpened(nl, link.lastOpenedAt, now, formats)}</small>
                    </td>
                    <td className="media-share-act" data-row-action onClick={(event) => event.stopPropagation()}>
                      {!expired && link.url ? (
                        <IconButton
                          label={copied === link.id ? (nl ? "Gekopieerd" : "Copied") : nl ? "Link kopiëren" : "Copy link"}
                          srLabel={`${nl ? "Link kopiëren" : "Copy link"}: ${link.label}`}
                          onClick={() => copy(link)}
                        >
                          {copied === link.id ? <CheckIcon /> : <CopyIcon />}
                        </IconButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <ShareLinkDialog
          key={editing ? editing.id : "new"}
          nl={nl}
          link={editing}
          albumId={albumId}
          albumTitle={albumTitle}
          visibleCount={visibleCount}
          hiddenCount={hiddenCount}
          werkgroepen={werkgroepen}
          now={now}
          otherActiveCount={activeCount - (editing && !isExpired(editing) ? 1 : 0)}
          formats={formats}
          onClose={closeAll}
          // Het formulier sluit meteen: bleef het open, dan maakt een tweede klik
          // een tweede link. Het venster met de nieuwe link volgt zodra die er is.
          onCreated={() => {
            setDialog(null);
            setAwaitingCreated(true);
          }}
        />
      ) : null}

      {created && !creating && !editing ? (
        <ShareLinkCreated
          nl={nl}
          link={created}
          copied={copied === created.id}
          formats={formats}
          onCopy={() => copy(created)}
          onClose={closeAll}
        />
      ) : null}
    </section>
  );
}

type Formats = {
  short: Intl.DateTimeFormat;
  day: Intl.DateTimeFormat;
  long: Intl.DateTimeFormat;
  ymd: Intl.DateTimeFormat;
};

function audienceLabel(nl: boolean, audience: GalleryShareAudience, groupName: string | null): string {
  if (audience === "PRAESIDIUM") return "Praesidium";
  if (audience === "GROUP") return `${nl ? "Werkgroep" : "Working group"} ${groupName ?? "?"}`;
  return nl ? "Iedereen met de link" : "Anyone with the link";
}

/** "Wie de link heeft en in het praesidium zit", voor de zin na het maken. */
function audienceWho(nl: boolean, audience: GalleryShareAudience, groupName: string | null): string {
  if (audience === "PRAESIDIUM") {
    return nl ? "Wie de link heeft en in het praesidium zit" : "Whoever has the link and is in the praesidium";
  }
  if (audience === "GROUP") {
    return nl
      ? `Wie de link heeft en in werkgroep ${groupName ?? "?"} zit`
      : `Whoever has the link and is in working group ${groupName ?? "?"}`;
  }
  return nl ? "Wie de link heeft" : "Whoever has the link";
}

function timeLeft(nl: boolean, days: number): string {
  if (days <= 1) return nl ? "nog 1 dag" : "1 day left";
  if (days < 14) return nl ? `nog ${days} dagen` : `${days} days left`;
  if (days < 60) return nl ? `nog ${Math.round(days / 7)} weken` : `${Math.round(days / 7)} weeks left`;
  return nl ? `nog ${Math.round(days / 30.44)} maanden` : `${Math.round(days / 30.44)} months left`;
}

function lastOpened(nl: boolean, value: string | null, now: Date, formats: Formats): string {
  if (!value) return nl ? "nog niet" : "not yet";
  const last = new Date(value);
  const today = formats.ymd.format(now);
  if (formats.ymd.format(last) === today) return nl ? "laatst vandaag" : "last today";
  if (formats.ymd.format(new Date(now.getTime() - DAY_MS)) === formats.ymd.format(last)) {
    return nl ? "laatst gisteren" : "last yesterday";
  }
  return `${nl ? "laatst" : "last"} ${formats.short.format(last)}`;
}

function termLabel(nl: boolean, term: ShareTerm): string {
  switch (term) {
    case "week":
      return nl ? "1 week" : "1 week";
    case "month":
      return nl ? "1 maand" : "1 month";
    case "quarter":
      return nl ? "3 maanden" : "3 months";
    default:
      return nl ? "Tot 15 juli" : "Until 15 July";
  }
}

function photoCount(nl: boolean, count: number): string {
  return count === 1 ? (nl ? "1 foto" : "1 photo") : nl ? `${count} foto's` : `${count} photos`;
}

function CopyField({
  nl,
  url,
  copied,
  primary,
  onCopy,
}: {
  nl: boolean;
  url: string;
  copied: boolean;
  primary?: boolean;
  onCopy: () => void;
}) {
  const id = useId();
  return (
    <div className="ticket-admin-field">
      <label htmlFor={id}>Link</label>
      <div className="media-share-copy">
        <input id={id} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        <button
          type="button"
          className="ticket-admin-button"
          data-variant={primary ? "primary" : undefined}
          onClick={onCopy}
          autoFocus={primary}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopiëren" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Een link maken of aanpassen. Aanpassen houdt de URL: wie de link al heeft,
 * hoeft geen nieuwe. Een termijn kiezen rekent vanaf vandaag, dus een verlopen
 * link werkt daarmee weer.
 */
function ShareLinkDialog({
  nl,
  link,
  albumId,
  albumTitle,
  visibleCount,
  hiddenCount,
  werkgroepen,
  now,
  otherActiveCount,
  formats,
  onClose,
  onCreated,
}: {
  nl: boolean;
  link: ShareLinkRow | null;
  albumId: string;
  albumTitle: string;
  visibleCount: number;
  hiddenCount: number;
  werkgroepen: Werkgroep[];
  now: Date;
  otherActiveCount: number;
  formats: Formats;
  onClose: () => void;
  onCreated: () => void;
}) {
  const titleId = useId();
  const downloadId = useId();
  const groupSelectId = useId();
  const messages = albumErrorMessages(nl ? "nl" : "en");
  const [label, setLabel] = useState(link?.label ?? "");
  const [autoLabel, setAutoLabel] = useState<string | null>(null);
  const [audience, setAudience] = useState<GalleryShareAudience>(link?.audience ?? "LINK");
  const [groupId, setGroupId] = useState(link?.groupId ?? "");
  const [term, setTerm] = useState<ShareTerm | "">(link ? "" : DEFAULT_SHARE_TERM);
  const [download, setDownload] = useState(link?.allowDownload ?? true);
  const [copied, setCopied] = useState(false);
  const showToast = useToast();

  const expired = link ? new Date(link.expiresAt) <= now : false;
  // Een werkgroep die intussen gedeactiveerd is, blijft kiesbaar voor de link
  // die ze al had; anders sprong de keuzelijst bij het openen naar leeg.
  const groups =
    link?.groupId && link.groupName && !werkgroepen.some((group) => group.id === link.groupId)
      ? [...werkgroepen, { id: link.groupId, name: link.groupName }]
      : werkgroepen;

  /** Kies je een groep terwijl Voor wie? leeg is, dan vult de naam van de groep het in. */
  function suggest(nextAudience: GalleryShareAudience, nextGroupId: string) {
    const group = groups.find((item) => item.id === nextGroupId);
    const suggestion =
      nextAudience === "PRAESIDIUM"
        ? "Praesidium"
        : nextAudience === "GROUP" && group
          ? `${nl ? "Werkgroep" : "Working group"} ${group.name}`
          : null;
    if (!suggestion) return;
    if (label.trim() === "" || label === autoLabel) {
      setLabel(suggestion);
      setAutoLabel(suggestion);
    }
  }

  const until = term ? shareExpiry(term, now) : link ? new Date(link.expiresAt) : now;
  const termHint = term
    ? `${nl ? "Werkt tot" : "Works until"} ${formats.long.format(until)}${
        term === "year" ? (nl ? ", wanneer het werkingsjaar wisselt" : ", when the working year changes") : ""
      }.`
    : expired
      ? nl
        ? `Verlopen op ${formats.day.format(until)}. Kies een termijn om dezelfde link weer te laten werken.`
        : `Expired on ${formats.day.format(until)}. Choose a period to make the same link work again.`
      : nl
        ? `Werkt tot ${formats.long.format(until)}. Een termijn kiezen rekent vanaf vandaag.`
        : `Works until ${formats.long.format(until)}. Choosing a period counts from today.`;

  const hiddenNote =
    hiddenCount === 0
      ? nl
        ? "Enkel de foto's die op de site zouden staan, zitten in de link. Wat je later verbergt, verdwijnt er ook uit."
        : "Only the photos that would be on the site are in the link. What you hide later disappears from it too."
      : hiddenCount === 1
        ? nl
          ? "De verborgen foto zit niet in de link. Wat je later verbergt, verdwijnt er ook uit."
          : "The hidden photo is not in the link. What you hide later disappears from it too."
        : nl
          ? `De ${hiddenCount} verborgen foto's zitten niet in de link. Wat je later verbergt, verdwijnt er ook uit.`
          : `The ${hiddenCount} hidden photos are not in the link. What you hide later disappears from it too.`;

  const others =
    otherActiveCount === 0
      ? ""
      : otherActiveCount === 1
        ? nl
          ? ", en de andere link naar dit album blijft werken"
          : ", and the other link to this album keeps working"
        : nl
          ? `, en de ${otherActiveCount} andere links naar dit album blijven werken`
          : `, and the ${otherActiveCount} other links to this album keep working`;

  async function copyUrl() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({ message: nl ? "Link gekopieerd." : "Link copied.", variant: "success" });
    } catch {
      showToast({
        message: nl ? "Kopiëren lukte niet. Selecteer de link en kopieer hem zelf." : "Copying failed. Select the link and copy it yourself.",
        variant: "error",
        duration: 0,
      });
    }
  }

  const choices: Array<{ value: GalleryShareAudience; icon: ReactNode; title: string; text: string }> = [
    {
      value: "LINK",
      icon: <Globe aria-hidden="true" size={15} />,
      title: nl ? "Iedereen met de link" : "Anyone with the link",
      text: nl ? "Ook zonder account, zoals een partner of een fotograaf." : "Also without an account, like a partner or a photographer.",
    },
    {
      value: "PRAESIDIUM",
      icon: <Users aria-hidden="true" size={15} />,
      title: nl ? "Met de link, enkel het praesidium" : "With the link, the praesidium only",
      text: nl ? "Eerst inloggen. Telt wie dit werkingsjaar een post heeft." : "Log in first. Counts whoever holds a post this working year.",
    },
    {
      value: "GROUP",
      icon: <Users aria-hidden="true" size={15} />,
      title: nl ? "Met de link, enkel een werkgroep" : "With the link, one working group only",
      text: nl
        ? "Eerst inloggen. Telt wie dit werkingsjaar lid is van de werkgroep die je kiest."
        : "Log in first. Counts whoever is a member of the working group you choose this working year.",
    },
  ];

  return (
    <div className="media-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="media-dialog media-share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="media-dialog-head">
          <h2 id={titleId}>{link ? (nl ? "Link aanpassen" : "Edit link") : nl ? "Nieuwe link" : "New link"}</h2>
          <IconButton label={nl ? "Sluiten" : "Close"} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <p className="media-share-dialog-lead">
          {nl ? "Voor het album" : "For the album"} <b>{albumTitle}</b>, {photoCount(nl, visibleCount)}.
        </p>

        {link && !expired && link.url ? <CopyField nl={nl} url={link.url} copied={copied} onCopy={copyUrl} /> : null}
        {link && !link.url ? (
          <p className="media-share-note">
            {nl
              ? "Deze link kan het beheer niet meer tonen (de sleutel van de site is gewisseld). Hij werkt nog; wie hem opnieuw nodig heeft, krijgt best een nieuwe link."
              : "The admin can no longer show this link (the site key changed). It still works; whoever needs it again is best given a new link."}
          </p>
        ) : null}

        <SaveForm
          action={link ? updateShareLinkAction : createShareLinkAction}
          submitLabel={link ? (nl ? "Opslaan" : "Save") : nl ? "Link maken" : "Create link"}
          savingLabel={nl ? "Bezig…" : "Working…"}
          savedMessage={link ? (nl ? "Link opgeslagen." : "Link saved.") : nl ? "Link gemaakt." : "Link created."}
          errorMessages={messages}
          fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
          resetOnSuccess={false}
          onSuccess={link ? onClose : onCreated}
          className="media-share-form"
          footer={({ submitButton }) => (
            <div className="media-dialog-actions">
              {link ? (
                <DeleteButton
                  action={revokeShareLinkAction}
                  fields={{ id: link.id }}
                  title={
                    expired ? (nl ? "Link verwijderen?" : "Remove link?") : nl ? "Link intrekken?" : "Revoke link?"
                  }
                  description={
                    expired
                      ? nl
                        ? `De link “${link.label}” was al verlopen en verdwijnt uit de lijst. Het album en de foto's blijven staan${others}.`
                        : `The link “${link.label}” had already expired and disappears from the list. The album and its photos stay${others}.`
                      : nl
                        ? `De link “${link.label}” werkt meteen niet meer, ook voor wie hem al opende. Het album en de foto's blijven staan${others}. Wie het album daarna nog moet zien, heeft een nieuwe link nodig.`
                        : `The link “${link.label}” stops working right away, also for whoever already opened it. The album and its photos stay${others}. Whoever still needs to see the album afterwards needs a new link.`
                  }
                  confirmLabel={expired ? (nl ? "Verwijderen" : "Remove") : nl ? "Link intrekken" : "Revoke link"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={
                    expired
                      ? nl
                        ? "Link verwijderd."
                        : "Link removed."
                      : nl
                        ? "Link ingetrokken. Het album blijft staan."
                        : "Link revoked. The album stays."
                  }
                  errorMessages={messages}
                  errorFallback={nl ? "Niet ingetrokken." : "Not revoked."}
                >
                  {expired ? (nl ? "Link verwijderen" : "Remove link") : nl ? "Link intrekken" : "Revoke link"}
                </DeleteButton>
              ) : null}
              <span className="media-share-grow" />
              <button type="button" className="ticket-admin-button" onClick={onClose}>
                {nl ? "Annuleren" : "Cancel"}
              </button>
              {submitButton}
            </div>
          )}
        >
          {link ? <input type="hidden" name="id" value={link.id} /> : <input type="hidden" name="albumId" value={albumId} />}

          <label className="ticket-admin-field">
            <span className="ticket-admin-label">{nl ? "Voor wie?" : "Who is it for?"}</span>
            <input
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={SHARE_LABEL_MAX}
              required
              autoComplete="off"
              autoFocus={!link}
              placeholder={nl ? "Bv. het praesidium, de fotograaf of een partner" : "E.g. the praesidium, the photographer or a partner"}
            />
            <small>
              {nl
                ? "Enkel voor het beheer: wie de link krijgt, ziet deze naam niet."
                : "Only for the admin: whoever gets the link does not see this name."}
            </small>
          </label>

          <fieldset className="ticket-admin-field">
            <legend className="ticket-admin-label">{nl ? "Wie mag kijken?" : "Who may view?"}</legend>
            <div className="media-share-choices">
              {choices.map((choice) => (
                <div key={choice.value} className="media-share-choice">
                  <label className="media-share-choice-main">
                    <input
                      type="radio"
                      name="audience"
                      value={choice.value}
                      checked={audience === choice.value}
                      onChange={() => {
                        setAudience(choice.value);
                        suggest(choice.value, groupId);
                      }}
                    />
                    <span>
                      <b>
                        {choice.icon}
                        {choice.title}
                      </b>
                      <small>{choice.text}</small>
                    </span>
                  </label>
                  {choice.value === "GROUP" && audience === "GROUP" ? (
                    <div className="media-share-choice-extra">
                      <label className="sr-only" htmlFor={groupSelectId}>
                        {nl ? "Werkgroep" : "Working group"}
                      </label>
                      <select
                        id={groupSelectId}
                        name="groupId"
                        value={groupId}
                        required
                        onChange={(event) => {
                          setGroupId(event.target.value);
                          suggest("GROUP", event.target.value);
                        }}
                      >
                        <option value="">{nl ? "Kies een werkgroep" : "Choose a working group"}</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <small>
                        {groups.length === 0
                          ? nl
                            ? "Er staan nog geen actieve werkgroepen in /admin/groepen."
                            : "There are no active working groups in /admin/groepen yet."
                          : nl
                            ? "De actieve werkgroepen uit /admin/groepen."
                            : "The active working groups from /admin/groepen."}
                      </small>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="ticket-admin-field">
            <legend className="ticket-admin-label">{nl ? "Geldig" : "Valid"}</legend>
            <div className="media-chips">
              {link ? (
                <label className="media-chip media-share-term">
                  <input
                    type="radio"
                    name="term"
                    value=""
                    checked={term === ""}
                    onChange={() => setTerm("")}
                    className="sr-only"
                  />
                  {expired ? (nl ? "Verlopen laten" : "Leave expired") : nl ? "Zoals nu" : "As it is"}
                </label>
              ) : null}
              {SHARE_TERMS.map((item) => (
                <label key={item} className="media-chip media-share-term">
                  <input
                    type="radio"
                    name="term"
                    value={item}
                    checked={term === item}
                    onChange={() => setTerm(item)}
                    className="sr-only"
                  />
                  {termLabel(nl, item)}
                </label>
              ))}
            </div>
            <small className={expired && !term ? "media-share-hint is-warn" : "media-share-hint"}>{termHint}</small>
          </fieldset>

          <div className="media-switch-row">
            <button
              type="button"
              role="switch"
              aria-checked={download}
              aria-labelledby={downloadId}
              className="media-switch"
              onClick={() => setDownload((value) => !value)}
            />
            <input type="hidden" name="allowDownload" value={download ? "true" : "false"} />
            <span id={downloadId}>
              <b>{nl ? "Downloaden toestaan" : "Allow downloads"}</b>
              <small>
                {nl
                  ? "Elke foto apart en het hele album als zip, in originele kwaliteit. Uit: enkel bekijken, al houdt dat een schermafbeelding niet tegen."
                  : "Every photo separately and the whole album as a zip, in original quality. Off: view only, though that does not stop a screenshot."}
              </small>
            </span>
          </div>

          <p className="media-share-note">{hiddenNote}</p>

          {link ? (
            <dl className="media-share-facts">
              <dt>{nl ? "Geopend" : "Opened"}</dt>
              <dd>
                {link.openCount === 0
                  ? nl
                    ? "Nog niet"
                    : "Not yet"
                  : nl
                    ? `${link.openCount} keer, ${lastOpened(nl, link.lastOpenedAt, now, formats)}`
                    : `${link.openCount} times, ${lastOpened(nl, link.lastOpenedAt, now, formats)}`}
              </dd>
              <dt>{nl ? "Gemaakt" : "Created"}</dt>
              <dd>
                {formats.day.format(new Date(link.createdAt))}
                {link.createdByName ? `${nl ? ", door " : ", by "}${link.createdByName}` : ""}
              </dd>
            </dl>
          ) : null}
        </SaveForm>
      </div>
    </div>
  );
}

/** Net gemaakt: de link staat klaar om te kopiëren, met erbij wat hij toelaat. */
function ShareLinkCreated({
  nl,
  link,
  copied,
  formats,
  onCopy,
  onClose,
}: {
  nl: boolean;
  link: ShareLinkRow;
  copied: boolean;
  formats: Formats;
  onCopy: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const until = new Date(link.expiresAt);
  return (
    <div className="media-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="media-dialog media-share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="media-dialog-head">
          <h2 id={titleId}>{nl ? "Link gemaakt" : "Link created"}</h2>
          <IconButton label={nl ? "Sluiten" : "Close"} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <p className="media-share-dialog-lead">
          {nl ? "Voor" : "For"} <b>{link.label}</b>. {audienceWho(nl, link.audience, link.groupName)},{" "}
          {nl ? "ziet het album tot" : "sees the album until"} {formats.long.format(until)}.
        </p>
        {link.url ? <CopyField nl={nl} url={link.url} copied={copied} primary onCopy={onCopy} /> : null}
        <dl className="media-share-facts">
          <dt>{nl ? "Toegang" : "Access"}</dt>
          <dd>
            {audienceLabel(nl, link.audience, link.groupName)}
            {link.audience === "LINK" ? "" : nl ? ", na inloggen" : ", after logging in"}
          </dd>
          <dt>{nl ? "Geldig tot" : "Valid until"}</dt>
          <dd>{formats.day.format(until)}</dd>
          <dt>{nl ? "Downloaden" : "Downloads"}</dt>
          <dd>
            {link.allowDownload
              ? nl
                ? "Toegestaan, ook als zip"
                : "Allowed, also as a zip"
              : nl
                ? "Uit, enkel bekijken"
                : "Off, view only"}
          </dd>
        </dl>
        <p className="media-share-note">
          {nl
            ? "De link blijft in het album staan; je kan hem later opnieuw kopiëren."
            : "The link stays in the album; you can copy it again later."}
        </p>
        <div className="media-dialog-actions">
          <button type="button" className="ticket-admin-button" onClick={onClose}>
            {nl ? "Klaar" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
