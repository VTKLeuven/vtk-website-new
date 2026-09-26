"use client";

import { useState } from "react";
import { Card, Input, Label, Select } from "@vtk/ui";
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
  NEWS_COUNT_MAX,
  NEWS_COUNT_MIN,
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
  /** Waar het nu staat: uitgelicht, in de band, erbuiten (band vol) of verborgen. */
  place: "featured" | "band" | "overflow" | "hidden";
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
  nl: { featured: "Uitgelicht", band: "In de band", overflow: "Band vol", hidden: "Verborgen" },
  en: { featured: "Featured", band: "In the band", overflow: "Band full", hidden: "Hidden" },
} as const;

const PLACE_CLASS = {
  featured: "bg-amber-50 text-amber-800",
  band: "bg-emerald-50 text-emerald-800",
  overflow: "bg-vtk-blue-soft text-[#5c667f]",
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
  const [editing, setEditing] = useState<NewsPostRow>(EMPTY);
  const [kind, setKind] = useState<NewsPostRow["kind"]>(EMPTY.kind);
  const isNew = editing.id === "";
  const praeses = kind === "PRAESES";

  const edit = (post: NewsPostRow) => {
    setEditing(post);
    setKind(post.kind);
    document.getElementById("news-post-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reset = () => {
    setEditing(EMPTY);
    setKind(EMPTY.kind);
  };

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

  return (
    <div className="space-y-6">
      {/* ---------- De band zelf ---------- */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Band op de homepage" : "Band on the homepage"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Staat de band uit, of is er geen enkel bericht, dan sluiten de openingsuren weer aan op de snelle links."
            : "When the band is off, or there is no post at all, the opening hours follow the quick links directly again."}
        </p>
        <SaveForm
          action={saveNewsSettingAction}
          className="space-y-4"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
          errorMessages={{
            ...errorMessages,
            INVALID_INPUT: nl
              ? `Kies tussen ${NEWS_COUNT_MIN} en ${NEWS_COUNT_MAX} berichten.`
              : `Pick between ${NEWS_COUNT_MIN} and ${NEWS_COUNT_MAX} posts.`,
          }}
          fallbackErrorMessage={dict.common.saveError}
        >
          <label className="inline-flex items-center gap-2 text-sm font-medium text-vtk-ink">
            <input type="checkbox" name="enabled" defaultChecked={setting.enabled} />
            {nl ? "Nieuws tonen op de homepage" : "Show news on the homepage"}
          </label>

          <div className="max-w-xs">
            <Label htmlFor="news-count">{nl ? "Aantal berichten" : "Number of posts"}</Label>
            <Select id="news-count" name="count" defaultValue={String(setting.count)}>
              {Array.from({ length: NEWS_COUNT_MAX - NEWS_COUNT_MIN + 1 }, (_, i) => NEWS_COUNT_MIN + i).map(
                (n) => (
                  <option key={n} value={n}>
                    {nl ? `${n} (1 uitgelicht, ${n - 1} in de lijst)` : `${n} (1 featured, ${n - 1} in the list)`}
                  </option>
                ),
              )}
            </Select>
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
      </Card>

      {/* ---------- Wat er nu staat ---------- */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Nu in het nieuws" : "In the news now"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {!setting.enabled
            ? nl
              ? "De band staat uit: niets hiervan staat op de homepage."
              : "The band is off: none of this is on the homepage."
            : nl
              ? "Nieuwste eerst. Met de ster kies je wat de grote kaart krijgt, ook een ticketverkoop of een album; zonder keuze is dat het woordje van de praeses, anders het nieuwste. Een automatisch bericht haal je hier uit het nieuws zonder aan de bron te komen: de verkoop loopt door, het album blijft op /media."
              : "Newest first. The star picks what gets the large card, including a ticket sale or an album; without a pick that is the word from the praeses, otherwise the newest. Taking an automatic post out of the news leaves its source alone: sales go on, the album stays on /media."}
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl
              ? "Er is nu niets dat in het nieuws kan staan, dus de band valt weg."
              : "There is nothing that can be in the news right now, so the band is not shown."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {candidates.map((row) => {
              const post = row.automatic ? null : posts.find((p) => p.id === row.ref) ?? null;
              return (
                <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLACE_CLASS[row.place]}`}>
                    {place[row.place]}
                  </span>
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block text-sm font-medium text-vtk-ink">{row.title}</span>
                    <span className="block text-xs text-[#5c667f]">
                      {row.sourceLabel}, {row.dateLabel}
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
                                ? "Uitlichten"
                                : "Feature"
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
                                ? "Uit het nieuws halen"
                                : "Take out of the news"
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
                        onClick={() => edit(post)}
                      >
                        <PencilIcon />
                      </IconButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------- Een bericht schrijven ---------- */}
      <Card className="p-5" id="news-post-form">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {isNew ? (nl ? "Nieuw bericht" : "New post") : nl ? "Bericht bewerken" : "Edit post"}
          </h2>
          {!isNew && (
            <button
              type="button"
              className="text-sm text-[#5c667f] underline hover:text-vtk-ink"
              onClick={reset}
            >
              {nl ? "Nieuw beginnen" : "Start a new one"}
            </button>
          )}
        </div>

        <SaveForm
          key={editing.id || "new"}
          action={saveNewsPostAction}
          className="space-y-4"
          submitLabel={isNew ? (nl ? "Bericht opslaan" : "Save post") : dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Bericht opgeslagen" : "Post saved"}
          errorMessages={errorMessages}
          fallbackErrorMessage={dict.common.saveError}
          onSuccess={reset}
        >
          {!isNew && <input type="hidden" name="id" value={editing.id} />}

          <fieldset>
            <legend className="text-sm font-medium text-vtk-ink">{nl ? "Soort" : "Kind"}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="kind"
                  value="NOTICE"
                  checked={kind === "NOTICE"}
                  onChange={() => setKind("NOTICE")}
                />
                {nl ? "Mededeling" : "Notice"}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="kind"
                  value="PRAESES"
                  checked={kind === "PRAESES"}
                  onChange={() => setKind("PRAESES")}
                />
                {nl ? "Woordje van de praeses" : "A word from the praeses"}
              </label>
            </div>
            <p className="mt-1 text-xs text-[#5c667f]">
              {praeses
                ? nl
                  ? `Gewoon de tekst uit het Bakske, met aanhef en groet. In de kaart staan de eerste ${NEWS_LETTER_LINES} regels; "Lees de hele brief" klapt de rest open.`
                  : `Just the text from Het Bakske, with greeting and sign-off. The card shows the first ${NEWS_LETTER_LINES} lines; "Read the whole letter" opens the rest.`
                : nl
                  ? "Voor iets dat niet in een melding past: veel uitleg, of een link naar een pagina die niet in de header staat. Het register toont de titel en het begin van de tekst; wie klikt, leest alles."
                  : "For something that does not fit a notification: a lot of explanation, or a link to a page that is not in the header. The list shows the title and the start of the text; clicking opens all of it."}
            </p>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="news-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</Label>
              <Input
                id="news-title-nl"
                name="titleNl"
                defaultValue={editing.titleNl}
                placeholder={praeses ? (nl ? "Welkom in het nieuwe academiejaar" : "") : ""}
                required
              />
            </div>
            <div>
              <Label htmlFor="news-title-en">{nl ? "Titel (EN)" : "Title (EN)"}</Label>
              <Input id="news-title-en" name="titleEn" defaultValue={editing.titleEn} />
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
                defaultValue={editing.bodyNl}
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
                defaultValue={editing.bodyEn}
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

          {praeses ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="news-author">{nl ? "Naam" : "Name"}</Label>
                <Input id="news-author" name="authorName" defaultValue={editing.authorName} required />
              </div>
              <div>
                <Label htmlFor="news-role-nl">{nl ? "Functie (NL)" : "Role (NL)"}</Label>
                <Input
                  id="news-role-nl"
                  name="authorRoleNl"
                  defaultValue={editing.authorRoleNl}
                  placeholder="Praeses VTK Leuven"
                />
              </div>
              <div>
                <Label htmlFor="news-role-en">{nl ? "Functie (EN)" : "Role (EN)"}</Label>
                <Input id="news-role-en" name="authorRoleEn" defaultValue={editing.authorRoleEn} />
              </div>
            </div>
          ) : null}

          <StorageImageField
            defaultKey={editing.imageKey}
            locale={locale}
            label={praeses ? (nl ? "Portret" : "Portrait") : nl ? "Foto" : "Photo"}
            srContext={editing.titleNl || (nl ? "nieuw bericht" : "new post")}
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="news-cta-nl">{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
              <Input
                id="news-cta-nl"
                name="ctaLabelNl"
                defaultValue={editing.ctaLabelNl}
                placeholder={nl ? "Lees de uitleg" : ""}
              />
            </div>
            <div>
              <Label htmlFor="news-cta-en">{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
              <Input id="news-cta-en" name="ctaLabelEn" defaultValue={editing.ctaLabelEn} />
            </div>
            <div>
              <Label htmlFor="news-cta-url">{nl ? "Knop-link" : "Button link"}</Label>
              <Input
                id="news-cta-url"
                name="ctaUrl"
                defaultValue={editing.ctaUrl}
                placeholder={nl ? "/info/mobiliteit of https://..." : "/info/mobility or https://..."}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-[#5c667f]">
            {nl
              ? "Optioneel. Zonder link opent de knop het bericht zelf op /nieuws."
              : "Optional. Without a link the button opens the post itself on /nieuws."}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="news-from">{nl ? "Zichtbaar vanaf" : "Visible from"}</Label>
              <Input id="news-from" name="publishedAt" type="datetime-local" defaultValue={editing.publishedAt} />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = meteen. Dit is ook de datum bij het bericht." : "Empty = right away. This is also the date shown."}
              </p>
            </div>
            <div>
              <Label htmlFor="news-until">{nl ? "Zichtbaar tot" : "Visible until"}</Label>
              <Input id="news-until" name="endsAt" type="datetime-local" defaultValue={editing.endsAt} />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = blijft staan tot je het uitzet." : "Empty = stays until you turn it off."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="featured" defaultChecked={editing.featured} />
              {nl ? "Uitlichten" : "Feature"}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={editing.active} />
              {nl ? "Actief" : "Active"}
            </label>
          </div>
          <p className="-mt-2 text-xs text-[#5c667f]">
            {nl
              ? "Hoogstens één bericht is uitgelicht; een ander uitlichten (ook een ticketverkoop, met de ster in \"Nu in het nieuws\") haalt het vorige eraf. Is er niets uitgelicht, dan krijgt het woordje van de praeses die plaats, en anders het nieuwste bericht."
              : "At most one post is featured; featuring another (also a ticket sale, with the star under \"In the news now\") removes the previous one. With nothing featured, the word from the praeses takes that place, and otherwise the newest post."}
          </p>
        </SaveForm>
      </Card>

      {/* ---------- Alle zelfgeschreven berichten ---------- */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Alle berichten" : "All posts"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Mededelingen en woordjes, nieuwste eerst. Afgelopen berichten blijven staan als historiek en op /nieuws."
            : "Notices and words from the praeses, newest first. Past posts stay as history and on /nieuws."}
        </p>
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl ? "Er is nog geen bericht geschreven." : "No post has been written yet."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {posts.map((post) => {
              const title = nl ? post.titleNl : post.titleEn || post.titleNl;
              return (
                <li key={post.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[post.status]}`}>
                    {status[post.status]}
                  </span>
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-vtk-ink">
                      {post.featured ? (
                        <span className="text-amber-600" title={nl ? "Uitgelicht" : "Featured"}>
                          <StarIcon filled />
                        </span>
                      ) : null}
                      <span className="truncate">{title}</span>
                    </span>
                    <span className="block text-xs text-[#5c667f]">
                      {post.kind === "PRAESES"
                        ? nl
                          ? "Woordje van de praeses"
                          : "A word from the praeses"
                        : nl
                          ? "Mededeling"
                          : "Notice"}
                      {", "}
                      {post.dateLabel}
                      {post.authorLabel ? `, ${post.authorLabel}` : ""}
                    </span>
                  </span>

                  <div className="ml-auto flex shrink-0 items-center gap-3">
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
                    <IconButton
                      label={nl ? "Bewerken" : "Edit"}
                      srLabel={`${nl ? "Bewerken" : "Edit"}: ${title}`}
                      onClick={() => edit(post)}
                    >
                      <PencilIcon />
                    </IconButton>
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
    </div>
  );
}
