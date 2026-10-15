"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { SearchMultiPicker } from "@/components/admin/SearchMultiPicker";
import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon, PencilIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { assignBoPostsAction, pairBoResultAction } from "@/app/actions/bestuursorgaan";
import type { Locale } from "./BoParts";

/*
 * "Na te kijken": wat een beslissing van Groep 5 vraagt voor het overzicht
 * klopt. Standaard dichtgeklapt tot één regel met de aantallen, zodat het de
 * cijfers niet onder zich begraaft; open per soort gegroepeerd, met een
 * keuzelijst waarin je typt.
 */

export type ReviewData = {
  unknownPosts: { key: string; label: string; files: { id: string; name: string }[]; perDocument: boolean }[];
  pairable: {
    resultId: string;
    activity: string;
    postName: string;
    meetingLabel: string;
    candidates: { id: string; label: string; group: string }[];
  }[];
  unclassified: { id: string; name: string; webUrl: string; meetingLabel: string }[];
  unreachable: { id: string; name: string; webUrl: string; meetingLabel: string }[];
};

export type PostChoice = { key: string; name: string; group: string };

export function BoReview({
  data,
  posts,
  locale,
  driveSubject,
  errorMessages,
}: {
  data: ReviewData;
  posts: PostChoice[];
  locale: Locale;
  driveSubject: string | null;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(false);
  const total = data.unknownPosts.length + data.pairable.length + data.unclassified.length + data.unreachable.length;
  if (total === 0) return null;

  const counts = [
    [data.unknownPosts.length, nl ? "postnaam" : "post name", nl ? "postnamen" : "post names"],
    [data.pairable.length, nl ? "resultaat zonder budget" : "result without a budget", nl ? "resultaten zonder budget" : "results without a budget"],
    [data.unclassified.length, nl ? "bestand zonder soort" : "file without a kind", nl ? "bestanden zonder soort" : "files without a kind"],
    [data.unreachable.length, nl ? "bestand niet te openen" : "file that cannot be opened", nl ? "bestanden niet te openen" : "files that cannot be opened"],
  ] as const;

  const postOptions: SearchPickerOption[] = posts.map((p) => ({ value: p.key, label: p.name, group: p.group }));

  return (
    <section className="vtk-bo-review" data-open={open || undefined} aria-label={nl ? "Na te kijken" : "To review"}>
      <button type="button" className="vtk-bo-review-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="dot" aria-hidden="true" />
        <b>{nl ? "Na te kijken" : "To review"}</b>
        <span className="vtk-bo-review-counts">
          {counts
            .filter(([n]) => n > 0)
            .map(([n, one, many]) => (
              <span key={one}>
                {n} {n === 1 ? one : many}
              </span>
            ))}
        </span>
        <ChevronDown aria-hidden="true" size={18} className="chev" />
      </button>
      {open && (
        <div className="vtk-bo-review-body">
          {data.unknownPosts.length > 0 && (
            <Group title={nl ? "Welke post is dit?" : "Which post is this?"} hint={nl ? "Kies er één of meer. Een naam onthoudt de site voor de volgende bestanden; een datum of een getal enkel voor dit bestand." : "Pick one or more. A name is remembered for the next files; a date or a number only for this file."}>
              {data.unknownPosts.map((post) => (
                <Row
                  key={post.key}
                  title={post.label ? `"${post.label}"` : nl ? "Geen post in de naam" : "No post in the name"}
                  text={
                    post.files.length === 1
                      ? post.files[0].name
                      : `${post.files.length} ${nl ? "bestanden" : "files"}, ${nl ? "bv." : "e.g."} ${post.files[0].name}`
                  }
                  control={
                    <AssignPosts
                      locale={locale}
                      options={postOptions}
                      label={post.label || undefined}
                      docIds={post.files.map((f) => f.id)}
                      scope={post.perDocument ? "bestand" : "naam"}
                      errorMessages={errorMessages}
                    />
                  }
                />
              ))}
            </Group>
          )}
          {data.pairable.length > 0 && (
            <Group title={nl ? "Bij welk budget hoort dit resultaat?" : "Which budget does this result belong to?"} hint={nl ? "Of zeg dat er geen budget op het BO kwam, bv. omdat de grocomeet het versneld goedkeurde." : "Or say no budget went to the meeting, e.g. because the grocomeet approved it early."}>
              {data.pairable.map((item) => (
                <Row
                  key={item.resultId}
                  title={item.activity}
                  text={`${item.postName} · ${item.meetingLabel}`}
                  control={<PairBudget locale={locale} item={item} errorMessages={errorMessages} />}
                />
              ))}
            </Group>
          )}
          {data.unclassified.length > 0 && (
            <Group title={nl ? "Budget of resultaat?" : "Budget or result?"} hint={nl ? "De naam zegt het niet en het bestand staat niet in Budgetten of Resultaten. Zet het woord Budget of Resultaat in de naam, of verplaats het naar een van die mappen." : "The name does not say and the file is not in Budgetten or Resultaten. Put the word Budget or Resultaat in the name, or move it into one of those folders."}>
              {data.unclassified.map((doc) => (
                <Row key={doc.id} title={doc.name} text={doc.meetingLabel} control={<DriveLink href={doc.webUrl} name={doc.name} nl={nl} />} />
              ))}
            </Group>
          )}
          {data.unreachable.length > 0 && (
            <Group title={nl ? "Niet te openen" : "Cannot be opened"} hint={nl ? `Deel het bestand of de map erboven met ${driveSubject ?? "het Drive-account"}; de bedragen staan er dan bij de volgende ronde.` : `Share the file or the folder above it with ${driveSubject ?? "the Drive account"}; the amounts appear on the next round.`}>
              {data.unreachable.map((doc) => (
                <Row key={doc.id} title={doc.name} text={doc.meetingLabel} control={<DriveLink href={doc.webUrl} name={doc.name} nl={nl} />} />
              ))}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="vtk-bo-review-group">
      <div>
        <p className="vtk-bo-kicker">{title}</p>
        <p className="text-xs text-vtk-muted">{hint}</p>
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ title, text, control }: { title: string; text: string; control: ReactNode }) {
  return (
    <li className="vtk-bo-review-row">
      <span className="min-w-0 flex-1">
        <b className="block break-words text-sm text-vtk-ink">{title}</b>
        <span className="block break-all text-xs text-vtk-muted">{text}</span>
      </span>
      <span className="vtk-bo-review-control">{control}</span>
    </li>
  );
}

function DriveLink({ href, name, nl }: { href: string; name: string; nl: boolean }) {
  return (
    <IconAnchor href={href} target="_blank" rel="noreferrer" label={nl ? "Openen in Drive" : "Open in Drive"} srLabel={nl ? `Openen in Drive: ${name}` : `Open in Drive: ${name}`}>
      <ExternalLinkIcon />
    </IconAnchor>
  );
}

/** Bewaren en melden; gedeeld door de twee keuzes hieronder. */
function useSave(locale: Locale, errorMessages: Record<string, string>) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  function save(action: typeof assignBoPostsAction, fields: Record<string, string>, success: string) {
    startTransition(async () => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      const result = await action(SAVE_IDLE, data);
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? result.detail ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: success, variant: "success" });
    });
  }
  return { pending, save };
}

export function AssignPosts({
  locale,
  options,
  label,
  docIds,
  scope,
  value = [],
  errorMessages,
  autoOpen = false,
  onDone,
}: {
  locale: Locale;
  options: SearchPickerOption[];
  label?: string;
  docIds: string[];
  scope: "naam" | "bestand";
  value?: string[];
  errorMessages: Record<string, string>;
  autoOpen?: boolean;
  onDone?: () => void;
}) {
  const nl = locale === "nl";
  const { pending, save } = useSave(locale, errorMessages);
  return (
    <SearchMultiPicker
      options={options}
      value={value}
      disabled={pending}
      autoOpen={autoOpen}
      onClose={onDone}
      placeholder={nl ? "Kies de post(en)" : "Choose the post(s)"}
      searchPlaceholder={nl ? "Typ een post" : "Type a post"}
      ariaLabel={nl ? `Posten voor ${label ?? "dit bestand"}` : `Posts for ${label ?? "this file"}`}
      applyLabel={nl ? "Toepassen" : "Apply"}
      clearText={scope === "bestand" ? (nl ? "Niets aangevinkt: de posten komen weer uit de naam." : "Nothing ticked: the posts come from the name again.") : undefined}
      emptyText={(q) => (nl ? `Geen post past bij "${q}".` : `No post matches "${q}".`)}
      onApply={(keys) =>
        save(
          assignBoPostsAction,
          { scope, label: label ?? "", docIds: docIds.join(","), postKeys: keys.join(",") },
          scope === "naam"
            ? nl
              ? `"${label}" gekoppeld; elk bestand met die naam volgt mee.`
              : `"${label}" linked; every file with that name follows.`
            : keys.length
              ? nl
                ? `Bij ${keys.map((k) => options.find((o) => o.value === k)?.label ?? k).join(" + ")} gezet.`
                : `Moved to ${keys.map((k) => options.find((o) => o.value === k)?.label ?? k).join(" + ")}.`
              : nl
                ? "De posten komen weer uit de naam."
                : "The posts come from the name again.",
        )
      }
    />
  );
}

/**
 * "Post wijzigen" in het detail van een activiteit, in beide weergaven: een
 * tekstknop (de ene bewerking van dat scherm, geen rij-actie) die de
 * keuzelijst opent. Geldt voor alle bestanden van de
 * activiteit; leeg toepassen zet ze terug op wat hun naam zegt.
 */
export function ChangePosts({
  locale,
  posts,
  docIds,
  value,
  activity,
  errorMessages,
}: {
  locale: Locale;
  posts: readonly PostChoice[];
  docIds: string[];
  value: string[];
  activity: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        className="vtk-bo-postedit-open"
        aria-label={nl ? `Post wijzigen: ${activity}` : `Change post: ${activity}`}
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
        {nl ? "Post wijzigen" : "Change post"}
      </button>
    );
  }
  return (
    <span className="vtk-bo-postedit">
      <AssignPosts
        locale={locale}
        options={posts.map((p) => ({ value: p.key, label: p.name, group: p.group }))}
        label={activity}
        docIds={docIds}
        scope="bestand"
        // Een naam die de site niet kent, staat niet in de lijst.
        value={value.filter((key) => posts.some((p) => p.key === key))}
        errorMessages={errorMessages}
        autoOpen
        onDone={() => setEditing(false)}
      />
    </span>
  );
}

function PairBudget({ locale, item, errorMessages }: { locale: Locale; item: ReviewData["pairable"][number]; errorMessages: Record<string, string> }) {
  const nl = locale === "nl";
  const { pending, save } = useSave(locale, errorMessages);
  const options: SearchPickerOption[] = [
    {
      value: "waiver:grocomeet",
      label: nl ? "Versneld goedgekeurd door de grocomeet" : "Approved early by the grocomeet",
      group: nl ? "Zonder budget op het BO" : "Without a budget at the meeting",
      muted: true,
    },
    { value: "waiver:geen", label: nl ? "Geen budget nodig" : "No budget needed", group: nl ? "Zonder budget op het BO" : "Without a budget at the meeting", muted: true },
    ...item.candidates.map((c) => ({ value: c.id, label: c.label, group: c.group })),
  ];
  return (
    <SearchPicker
      options={options}
      disabled={pending}
      placeholder={nl ? "Kies het budget" : "Choose the budget"}
      searchPlaceholder={nl ? "Typ een activiteit of post" : "Type an activity or post"}
      ariaLabel={nl ? `Budget voor ${item.activity}` : `Budget for ${item.activity}`}
      emptyText={(q) => (nl ? `Geen budget past bij "${q}".` : `No budget matches "${q}".`)}
      onChange={(value) =>
        save(
          pairBoResultAction,
          { resultId: item.resultId, budgetId: value },
          value.startsWith("waiver:") ? (nl ? "Resultaat zonder budget aangeduid." : "Result marked as without a budget.") : nl ? "Resultaat bij het budget gezet." : "Result linked to the budget.",
        )
      }
    />
  );
}
