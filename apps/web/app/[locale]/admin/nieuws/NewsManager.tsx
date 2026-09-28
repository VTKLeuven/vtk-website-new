"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { EyeIcon, EyeOffIcon, PencilIcon, StarIcon } from "@/components/ui/icons";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { saveErrorMessages } from "@/lib/saveMessages";
import {
  NEWS_AUTO_SOURCES,
  NEWS_LETTER_LINES,
  type NewsAutoSource,
  type NewsSource,
} from "@/lib/news/rules";
import type { NewsSetting } from "@/lib/news/setting";
import {
  deleteNewsPostAction,
  saveNewsPostAction,
  saveNewsSettingAction,
  setNewsFeaturedAction,
  setNewsHiddenAction,
  setNewsPostActiveAction,
} from "@/app/actions/news";

export type NewsCandidateRow = {
  key: string;
  source: NewsSource;
  sourceLabel: string;
  ref: string;
  title: string;
  line: string;
  dateLabel: string;
  automatic: boolean;
  /** Door de redactie uitgelicht (los van waar het nu staat). */
  picked: boolean;
  /** Waar het nu staat: uitgelicht, in de band of verborgen. */
  place: "featured" | "band" | "hidden";
};

export type NewsPostRow = {
  id: string;
  kind: "NOTICE" | "PRAESES";
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl: string;
  ctaLabelEn: string;
  ctaUrl: string;
  imageKey: string | null;
  authorName: string;
  authorRoleNl: string;
  authorRoleEn: string;
  /** "YYYY-MM-DDTHH:mm" voor de datetime-local-velden. */
  publishedAt: string;
  endsAt: string;
  featured: boolean;
  active: boolean;
  status: "live" | "scheduled" | "expired" | "off";
  dateLabel: string;
  authorLabel: string | null;
};

const EMPTY: NewsPostRow = {
  id: "",
  kind: "NOTICE",
  titleNl: "",
  titleEn: "",
  bodyNl: "",
  bodyEn: "",
  ctaLabelNl: "",
  ctaLabelEn: "",
  ctaUrl: "",
  imageKey: null,
  authorName: "",
  authorRoleNl: "",
  authorRoleEn: "",
  publishedAt: "",
  endsAt: "",
  featured: false,
  active: true,
  status: "off",
  dateLabel: "",
  authorLabel: null,
};

const SOURCE_LABELS: Record<NewsAutoSource, { nl: string; en: string; hintNl: string; hintEn: string }> = {
  tickets: {
    nl: "Ticketverkoop",
    en: "Ticket sales",
    hintNl: "Twee weken vanaf de publieke start van de verkoop, zolang ze loopt.",
    hintEn: "Two weeks from the public start of sales, while they run.",
  },
  signup: {
    nl: "Inschrijvingen",
    en: "Sign-ups",
    hintNl: "Evenementen waarbij in de kalender aangevinkt is dat de externe link de inschrijvingen opent, tot ze beginnen.",
    hintEn: "Events where the calendar says the external link opens sign-ups, until they start.",
  },
  bakske: {
    nl: "Het Bakske",
    en: "Het Bakske",
    hintNl: "Het nieuwste nummer, drie weken lang.",
    hintEn: "The newest issue, for three weeks.",
  },
  irreeel: {
    nl: "Ir.Reëel",
    en: "Ir.Reëel",
    hintNl: "Het nieuwste nummer, drie weken lang.",
    hintEn: "The newest issue, for three weeks.",
  },
  album: {
    nl: "Fotoalbums",
    en: "Photo albums",
    hintNl: "Albums op /media, twee weken vanaf de datum van het album.",
    hintEn: "Albums on /media, two weeks from the album's date.",
  },
};

const PLACE = {
  nl: { featured: "Uitgelicht", band: "In de band", hidden: "Verborgen" },
  en: { featured: "Featured", band: "In the band", hidden: "Hidden" },
} as const;

const PLACE_CLASS = {
  featured: "bg-amber-50 text-amber-800",
  band: "bg-emerald-50 text-emerald-800",
  hidden: "bg-vtk-blue-soft text-[#5c667f]",
} as const;

const STATUS = {
  nl: { live: "Nu zichtbaar", scheduled: "Gepland", expired: "Afgelopen", off: "Uit" },
  en: { live: "Live now", scheduled: "Scheduled", expired: "Ended", off: "Off" },
} as const;

const STATUS_CLASS = {
  live: "bg-emerald-50 text-emerald-800",
  scheduled: "bg-amber-50 text-amber-800",
  expired: "bg-vtk-blue-soft text-[#5c667f]",
  off: "bg-vtk-blue-soft text-[#5c667f]",
} as const;

/** Een klik op een knop, link of formulierveld in een rij is geen klik op de rij. */
function clickedControl(event: MouseEvent<HTMLElement>): boolean {
  return Boolean((event.target as Element).closest("a, button, input, select, textarea, label, form"));
}

/**
 * Het nieuwsbeheer, van boven naar onder in de volgorde waarin je het nodig hebt:
 * wat er nu op de homepage staat, de berichten die je zelf schreef, en de
 * instellingen van de band (dichtgeklapt, want die raak je zelden aan).
 *
 * De editor staat enkel open wanneer je een bericht schrijft of bewerkt, en dan
 * bovenaan: een lang formulier dat altijd openstond tussen twee lijsten, maakte
 * van de pagina een muur waarin niet te zien was wat een lijst en wat een
 * invulveld was.
 */
export function NewsManager({
  locale,
  setting,
  candidates,
  posts,
}: {
  locale: Locale;
  setting: NewsSetting;
  candidates: NewsCandidateRow[];
  posts: NewsPostRow[];
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const [editing, setEditing] = useState<NewsPostRow | null>(null);
  const [kind, setKind] = useState<NewsPostRow["kind"]>(EMPTY.kind);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorKey = editing ? editing.id || "new" : null;

  // Een editor die opengaat onder de vouw, zie je niet opengaan.
  useEffect(() => {
    if (editorKey) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editorKey]);

  const open = (post: NewsPostRow) => {
    setEditing(post);
    setKind(post.kind);
  };
  const close = () => setEditing(null);

  const errorMessages = {
    ...saveErrorMessages(locale),
    ...(nl
      ? {
          INVALID_INPUT: "Vul minstens een titel en een tekst in het Nederlands in.",
          WINDOW_INVALID: "Het einde ligt voor het begin; zo verschijnt het bericht nooit.",
          CTA_INCOMPLETE: "Een knoptekst heeft ook een link nodig.",
          AUTHOR_MISSING: "Een woordje van de praeses heeft een naam eronder nodig.",
        }
      : {
          INVALID_INPUT: "Fill in at least a title and a text in Dutch.",
          WINDOW_INVALID: "The end is before the start; the post would never appear.",
          CTA_INCOMPLETE: "A button label also needs a link.",
          AUTHOR_MISSING: "A word from the praeses needs a name under it.",
        }),
  };

  const place = PLACE[nl ? "nl" : "en"];
  const status = STATUS[nl ? "nl" : "en"];
  const kindLabel = (value: NewsPostRow["kind"]) =>
    value === "PRAESES"
      ? nl
        ? "Woordje van de praeses"
        : "A word from the praeses"
      : nl
        ? "Mededeling"
        : "Notice";

  const featuredRow = candidates.find((row) => row.place === "featured") ?? null;
  const inBand = candidates.filter((row) => row.place === "band").length;
  const hiddenCount = candidates.filter((row) => row.place === "hidden").length;
  const sourcesOn = NEWS_AUTO_SOURCES.filter((source) => setting.sources[source]).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl font-semibold">{nl ? "Nieuws" : "News"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "De band tussen de snelle links en de openingsuren op de homepage. Ticketverkoop, inschrijvingen, het Bakske, Ir.Reëel en nieuwe fotoalbums komen er vanzelf in; een mededeling of een woordje van de praeses schrijf je hier."
              : "The band between the quick links and the opening hours on the homepage. Ticket sales, sign-ups, Het Bakske, Ir.Reëel and new photo albums appear by themselves; a notice or a word from the praeses is written here."}
          </p>
        </div>
        {editing ? null : (
          <Button type="button" onClick={() => open(EMPTY)} className="shrink-0">
            <Plus size={16} aria-hidden="true" className="mr-1.5 inline" />
            {nl ? "Nieuw bericht" : "New post"}
          </Button>
        )}
      </header>

      {!setting.enabled ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {nl
            ? "De nieuwsband staat uit: niets hieronder staat op de homepage. Je zet ze aan onder Instellingen van de band, onderaan."
            : "The news band is off: none of this is on the homepage. Turn it on under Band settings, at the bottom."}
        </p>
      ) : null}

      {/* ---------- De editor: enkel open wanneer je schrijft ---------- */}
      {editing ? (
        <div ref={editorRef} className="scroll-mt-24">
          <Card className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {editing.id === ""
                    ? nl
                      ? "Nieuw bericht"
                      : "New post"
                    : nl
                      ? "Bericht bewerken"
                      : "Edit post"}
                </h2>
                {editing.id !== "" ? (
                  <p className="text-sm text-[#5c667f]">{nl ? editing.titleNl : editing.titleEn || editing.titleNl}</p>
                ) : null}
              </div>
              <IconButton label={nl ? "Sluiten zonder opslaan" : "Close without saving"} onClick={close}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            </div>

            <PostForm
              key={editorKey}
              locale={locale}
              post={editing}
              kind={kind}
              setKind={setKind}
              errorMessages={errorMessages}
              submitLabel={editing.id === "" ? (nl ? "Bericht opslaan" : "Save post") : dict.admin.save}
              savingLabel={dict.common.saving}
              fallbackErrorMessage={dict.common.saveError}
              onSuccess={close}
            />
          </Card>
        </div>
      ) : null}

      {/* ---------- Wat er nu staat ---------- */}
      <Card className="p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{nl ? "Nu op de homepage" : "On the homepage now"}</h2>
          <p className="text-sm text-[#5c667f]">
            {candidates.length === 0
              ? nl
                ? "Er is nu niets dat in het nieuws kan staan, dus de band valt weg."
                : "There is nothing that can be in the news right now, so the band is not shown."
              : nl
                ? `${featuredRow ? `Uitgelicht: ${featuredRow.title}. ` : ""}${inBand} in de band${hiddenCount ? `, ${hiddenCount} verborgen` : ""}. De ster kiest wat de grote kaart krijgt; het oog haalt een automatisch bericht uit het nieuws.`
                : `${featuredRow ? `Featured: ${featuredRow.title}. ` : ""}${inBand} in the band${hiddenCount ? `, ${hiddenCount} hidden` : ""}. The star picks what gets the large card; the eye takes an automatic post out of the news.`}
          </p>
        </div>

        {candidates.length > 0 ? (
          <ul className="divide-y divide-vtk-blue/10 border-y border-vtk-blue/10">
            {candidates.map((row) => {
              const post = row.automatic ? null : (posts.find((p) => p.id === row.ref) ?? null);
              return (
                <li
                  key={row.key}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${post ? "cursor-pointer" : ""}`}
                  onClick={post ? (event) => !clickedControl(event) && open(post) : undefined}
                >
                  <span
                    className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${PLACE_CLASS[row.place]}`}
                  >
                    {place[row.place]}
                  </span>
                  <span className="min-w-0 flex-1 basis-56">
                    {post ? (
                      <button
                        type="button"
                        onClick={() => open(post)}
                        className="block text-left text-sm font-medium text-vtk-ink hover:underline"
                      >
                        {row.title}
                      </button>
                    ) : (
                      <span className="block text-sm font-medium text-vtk-ink">{row.title}</span>
                    )}
                    <span className="block text-xs text-[#5c667f]">
                      {row.sourceLabel}, {row.dateLabel}
                      {row.automatic ? (nl ? " · automatisch" : " · automatic") : ""}
                    </span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {row.place !== "hidden" ? (
                      <form action={setNewsFeaturedAction}>
                        <input type="hidden" name="source" value={row.source} />
                        <input type="hidden" name="ref" value={row.ref} />
                        <input type="hidden" name="title" value={row.title} />
                        <input type="hidden" name="featured" value={row.picked ? "0" : "1"} />
                        <IconButton
                          type="submit"
                          label={
                            row.picked
                              ? nl
                                ? "Niet meer uitlichten"
                                : "Stop featuring"
                              : nl
                                ? "Uitlichten als grote kaart"
                                : "Feature as the large card"
                          }
                          srLabel={`${
                            row.picked
                              ? nl
                                ? "Niet meer uitlichten"
                                : "Stop featuring"
                              : nl
                                ? "Uitlichten"
                                : "Feature"
                          }: ${row.title}`}
                        >
                          <span className={row.picked ? "text-amber-600" : undefined}>
                            <StarIcon filled={row.picked} />
                          </span>
                        </IconButton>
                      </form>
                    ) : null}
                    {row.automatic ? (
                      <form action={setNewsHiddenAction}>
                        <input type="hidden" name="source" value={row.source} />
                        <input type="hidden" name="ref" value={row.ref} />
                        <input type="hidden" name="title" value={row.title} />
                        <input type="hidden" name="hidden" value={row.place === "hidden" ? "0" : "1"} />
                        <IconButton
                          type="submit"
                          label={
                            row.place === "hidden"
                              ? nl
                                ? "Terug in het nieuws zetten"
                                : "Put back in the news"
                              : nl
                                ? "Uit het nieuws halen (de bron blijft)"
                                : "Take out of the news (the source stays)"
                          }
                          srLabel={`${
                            row.place === "hidden"
                              ? nl
                                ? "Terug in het nieuws zetten"
                                : "Put back in the news"
                              : nl
                                ? "Uit het nieuws halen"
                                : "Take out of the news"
                          }: ${row.title}`}
                        >
                          {row.place === "hidden" ? <EyeIcon /> : <EyeOffIcon />}
                        </IconButton>
                      </form>
                    ) : post ? (
                      <IconButton
                        label={nl ? "Bewerken" : "Edit"}
                        srLabel={`${nl ? "Bewerken" : "Edit"}: ${row.title}`}
                        onClick={() => open(post)}
                      >
                        <PencilIcon />
                      </IconButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <details className="mt-3 text-sm text-[#5c667f]">
          <summary className="cursor-pointer font-medium text-vtk-ink">
            {nl ? "Hoe wordt de band samengesteld?" : "How is the band put together?"}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {(nl
              ? [
                  "Alles wat hier niet verborgen is, staat in de band. De carrousel schuift, dus er is geen maximum.",
                  "De tegels staan in de volgorde van hun datum: eerst wat nog komt (het vroegste eerst), dan wat al gebeurde.",
                  "Hoogstens één bericht is uitgelicht als grote kaart, ook een ticketverkoop of een album kan. Zonder keuze is dat het woordje van de praeses, anders het nieuwste.",
                  "Een automatisch bericht uit het nieuws halen, laat de bron gerust: de verkoop loopt door, het album blijft op /media.",
                ]
              : [
                  "Everything here that is not hidden is in the band. The carousel scrolls, so there is no maximum.",
                  "Tiles follow their date: what is still to come first (soonest first), then what already happened.",
                  "At most one post is featured as the large card, a ticket sale or an album included. Without a pick that is the word from the praeses, otherwise the newest.",
                  "Taking an automatic post out of the news leaves its source alone: sales go on, the album stays on /media.",
                ]
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </Card>

      {/* ---------- Zelf geschreven berichten ---------- */}
      <Card className="p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{nl ? "Geschreven berichten" : "Written posts"}</h2>
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "Mededelingen en woordjes van de praeses, nieuwste eerst. Klik een bericht om het te bewerken. Afgelopen berichten blijven staan als historiek en op /nieuws."
              : "Notices and words from the praeses, newest first. Click a post to edit it. Past posts stay as history and on /nieuws."}
          </p>
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl ? "Er is nog geen bericht geschreven." : "No post has been written yet."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10 border-y border-vtk-blue/10">
            {posts.map((post) => {
              const title = nl ? post.titleNl : post.titleEn || post.titleNl;
              const isOpen = editing?.id === post.id;
              return (
                <li
                  key={post.id}
                  className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 py-3 hover:bg-vtk-blue-soft/30 ${
                    isOpen ? "bg-vtk-blue-soft/50" : ""
                  }`}
                  onClick={(event) => !clickedControl(event) && open(post)}
                >
                  <span
                    className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${STATUS_CLASS[post.status]}`}
                  >
                    {status[post.status]}
                  </span>
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex items-center gap-1.5">
                      {post.featured ? (
                        <span className="text-amber-600" title={nl ? "Uitgelicht" : "Featured"}>
                          <StarIcon filled />
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => open(post)}
                        className="text-left text-sm font-medium text-vtk-ink hover:underline"
                      >
                        {title}
                      </button>
                    </span>
                    <span className="block text-xs text-[#5c667f]">
                      {kindLabel(post.kind)}
                      {", "}
                      {post.dateLabel}
                      {post.authorLabel ? `, ${post.authorLabel}` : ""}
                    </span>
                  </span>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <form action={setNewsPostActiveAction}>
                      <input type="hidden" name="id" value={post.id} />
                      <input type="hidden" name="active" value={post.active ? "0" : "1"} />
                      <button
                        type="submit"
                        className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/60"
                      >
                        {post.active ? (nl ? "Uitzetten" : "Turn off") : nl ? "Aanzetten" : "Turn on"}
                      </button>
                    </form>
                    <DeleteIconButton
                      action={deleteNewsPostAction}
                      fields={{ id: post.id }}
                      label={nl ? "Verwijderen" : "Delete"}
                      srLabel={`${nl ? "Verwijderen" : "Delete"}: ${title}`}
                      title={nl ? "Bericht verwijderen?" : "Delete post?"}
                      description={
                        nl
                          ? `"${post.titleNl}" verdwijnt van de homepage, van /nieuws en uit deze historiek. Wil je het enkel van de homepage halen, zet het dan uit.`
                          : `"${title}" disappears from the homepage, from /nieuws and from this history. To only take it off the homepage, turn it off instead.`
                      }
                      confirmLabel={nl ? "Verwijderen" : "Delete"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Bericht verwijderd" : "Post deleted"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------- De band zelf: zelden aangeraakt, dus dichtgeklapt ---------- */}
      <AdminDisclosure
        summary={
          <>
            <span className="font-semibold text-vtk-ink">{nl ? "Instellingen van de band" : "Band settings"}</span>
            <span className="mt-1 block text-sm text-[#5c667f]">
              {setting.enabled
                ? nl
                  ? `Aan, ${sourcesOn} van ${NEWS_AUTO_SOURCES.length} bronnen komen vanzelf in het nieuws.`
                  : `On, ${sourcesOn} of ${NEWS_AUTO_SOURCES.length} sources appear by themselves.`
                : nl
                  ? "Uit: de band staat niet op de homepage."
                  : "Off: the band is not on the homepage."}
            </span>
          </>
        }
      >
        <SaveForm
          action={saveNewsSettingAction}
          className="space-y-4"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
          errorMessages={errorMessages}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-vtk-ink">
              <input type="checkbox" name="enabled" defaultChecked={setting.enabled} />
              {nl ? "Nieuws tonen op de homepage" : "Show news on the homepage"}
            </label>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Staat de band uit, of is er geen enkel bericht, dan sluiten de openingsuren weer aan op de snelle links."
                : "When the band is off, or there is no post at all, the opening hours follow the quick links directly again."}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-vtk-ink">
              {nl ? "Wat vanzelf in het nieuws komt" : "What appears by itself"}
            </legend>
            <ul className="mt-2 space-y-2">
              {NEWS_AUTO_SOURCES.map((source) => (
                <li key={source}>
                  <label className="inline-flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`source-${source}`}
                      defaultChecked={setting.sources[source]}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-vtk-ink">
                        {SOURCE_LABELS[source][nl ? "nl" : "en"]}
                      </span>
                      <span className="block text-xs text-[#5c667f]">
                        {nl ? SOURCE_LABELS[source].hintNl : SOURCE_LABELS[source].hintEn}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </SaveForm>
      </AdminDisclosure>
    </div>
  );
}

/** Een kop boven een groep velden in de editor. */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-vtk-blue/10 pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left w-full text-sm font-semibold text-vtk-ink">{title}</legend>
      {hint ? <p className="clear-left text-xs text-[#5c667f]">{hint}</p> : null}
      <div className="clear-left space-y-4">{children}</div>
    </fieldset>
  );
}

function PostForm({
  locale,
  post,
  kind,
  setKind,
  errorMessages,
  submitLabel,
  savingLabel,
  fallbackErrorMessage,
  onSuccess,
}: {
  locale: Locale;
  post: NewsPostRow;
  kind: NewsPostRow["kind"];
  setKind: (kind: NewsPostRow["kind"]) => void;
  errorMessages: Record<string, string>;
  submitLabel: string;
  savingLabel: string;
  fallbackErrorMessage: string;
  onSuccess: () => void;
}) {
  const nl = locale === "nl";
  const isNew = post.id === "";
  const praeses = kind === "PRAESES";

  return (
    <SaveForm
      action={saveNewsPostAction}
      className="space-y-5"
      submitLabel={submitLabel}
      savingLabel={savingLabel}
      savedMessage={nl ? "Bericht opgeslagen" : "Post saved"}
      errorMessages={errorMessages}
      fallbackErrorMessage={fallbackErrorMessage}
      onSuccess={onSuccess}
    >
      {!isNew && <input type="hidden" name="id" value={post.id} />}

      <Group
        title={nl ? "Soort" : "Kind"}
        hint={
          praeses
            ? nl
              ? `Gewoon de tekst uit het Bakske, met aanhef en groet. In de kaart staan de eerste ${NEWS_LETTER_LINES} regels; "Lees de hele brief" klapt de rest open.`
              : `Just the text from Het Bakske, with greeting and sign-off. The card shows the first ${NEWS_LETTER_LINES} lines; "Read the whole letter" opens the rest.`
            : nl
              ? "Voor iets dat niet in een melding past: veel uitleg, of een link naar een pagina die niet in de header staat. De band toont de titel en het begin van de tekst; wie klikt, leest alles."
              : "For something that does not fit a notification: a lot of explanation, or a link to a page that is not in the header. The band shows the title and the start of the text; clicking opens all of it."
        }
      >
        <div className="flex flex-wrap gap-2">
          {(["NOTICE", "PRAESES"] as const).map((value) => (
            <label
              key={value}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                kind === value
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {value === "PRAESES"
                ? nl
                  ? "Woordje van de praeses"
                  : "A word from the praeses"
                : nl
                  ? "Mededeling"
                  : "Notice"}
            </label>
          ))}
        </div>
      </Group>

      <Group title={nl ? "Inhoud" : "Content"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="news-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</Label>
            <Input
              id="news-title-nl"
              name="titleNl"
              defaultValue={post.titleNl}
              placeholder={praeses ? (nl ? "Welkom in het nieuwe academiejaar" : "") : ""}
              required
            />
          </div>
          <div>
            <Label htmlFor="news-title-en">{nl ? "Titel (EN)" : "Title (EN)"}</Label>
            <Input id="news-title-en" name="titleEn" defaultValue={post.titleEn} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "Leeg = de Nederlandse titel." : "Empty = the Dutch title."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="news-body-nl">{nl ? "Tekst (NL)" : "Text (NL)"}</Label>
            <MarkdownEditorField
              name="bodyNl"
              defaultValue={post.bodyNl}
              locale={locale}
              rows={10}
              allowImages={false}
              textareaId="news-body-nl"
            />
          </div>
          <div>
            <Label htmlFor="news-body-en">{nl ? "Tekst (EN)" : "Text (EN)"}</Label>
            <MarkdownEditorField
              name="bodyEn"
              defaultValue={post.bodyEn}
              locale={locale}
              rows={10}
              allowImages={false}
              textareaId="news-body-en"
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "Leeg = de Nederlandse tekst." : "Empty = the Dutch text."}
            </p>
          </div>
        </div>
      </Group>

      {praeses ? (
        <Group title={nl ? "Onder de brief" : "Signed by"}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="news-author">{nl ? "Naam" : "Name"}</Label>
              <Input id="news-author" name="authorName" defaultValue={post.authorName} required />
            </div>
            <div>
              <Label htmlFor="news-role-nl">{nl ? "Functie (NL)" : "Role (NL)"}</Label>
              <Input
                id="news-role-nl"
                name="authorRoleNl"
                defaultValue={post.authorRoleNl}
                placeholder="Praeses VTK Leuven"
              />
            </div>
            <div>
              <Label htmlFor="news-role-en">{nl ? "Functie (EN)" : "Role (EN)"}</Label>
              <Input id="news-role-en" name="authorRoleEn" defaultValue={post.authorRoleEn} />
            </div>
          </div>
        </Group>
      ) : null}

      {/* Geen groepstitel: het veld zegt zelf al "Foto" of "Portret". */}
      <div className="border-t border-vtk-blue/10 pt-4">
        <StorageImageField
          defaultKey={post.imageKey}
          locale={locale}
          label={praeses ? (nl ? "Portret" : "Portrait") : nl ? "Foto" : "Photo"}
          srContext={post.titleNl || (nl ? "nieuw bericht" : "new post")}
          helpText={
            praeses
              ? nl
                ? "Optioneel. Staat rond naast de naam; zonder portret staan er initialen."
                : "Optional. Shown round next to the name; without one, initials are shown."
              : nl
                ? "Optioneel. Staat boven de kaart wanneer het bericht uitgelicht is."
                : "Optional. Shown above the card when the post is featured."
          }
        />
      </div>

      <Group
        title={nl ? "Knop (optioneel)" : "Button (optional)"}
        hint={
          nl
            ? "Zonder link opent de knop het bericht zelf op /nieuws."
            : "Without a link the button opens the post itself on /nieuws."
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="news-cta-nl">{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
            <Input
              id="news-cta-nl"
              name="ctaLabelNl"
              defaultValue={post.ctaLabelNl}
              placeholder={nl ? "Lees de uitleg" : ""}
            />
          </div>
          <div>
            <Label htmlFor="news-cta-en">{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
            <Input id="news-cta-en" name="ctaLabelEn" defaultValue={post.ctaLabelEn} />
          </div>
          <div>
            <Label htmlFor="news-cta-url">{nl ? "Knop-link" : "Button link"}</Label>
            <Input
              id="news-cta-url"
              name="ctaUrl"
              defaultValue={post.ctaUrl}
              placeholder={nl ? "/info/mobiliteit of https://..." : "/info/mobility or https://..."}
            />
          </div>
        </div>
      </Group>

      <Group
        title={nl ? "Wanneer en waar" : "When and where"}
        hint={
          nl
            ? "Hoogstens één bericht is uitgelicht; een ander uitlichten (ook met de ster bij Nu op de homepage) haalt het vorige eraf."
            : "At most one post is featured; featuring another (also with the star under On the homepage now) removes the previous one."
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="news-from">{nl ? "Zichtbaar vanaf" : "Visible from"}</Label>
            <Input id="news-from" name="publishedAt" type="datetime-local" defaultValue={post.publishedAt} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "Leeg = meteen. Dit is ook de datum bij het bericht." : "Empty = right away. This is also the date shown."}
            </p>
          </div>
          <div>
            <Label htmlFor="news-until">{nl ? "Zichtbaar tot" : "Visible until"}</Label>
            <Input id="news-until" name="endsAt" type="datetime-local" defaultValue={post.endsAt} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "Leeg = blijft staan tot je het uitzet." : "Empty = stays until you turn it off."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={post.active} />
            {nl ? "Actief" : "Active"}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="featured" defaultChecked={post.featured} />
            {nl ? "Uitlichten als grote kaart" : "Feature as the large card"}
          </label>
        </div>
      </Group>
    </SaveForm>
  );
}
