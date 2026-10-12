"use client";

import { useTransition } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { setPraesidiumShiftSkipAction, skipPraesidiumShiftPostAction } from "@/app/actions/praesidiumShifts";

/**
 * Iemand op deze lijst overslaan of weer laten meetellen. Niets verdwijnt:
 * de vakjes blijven staan, ze tellen enkel niet. Daarom geen bevestiging,
 * wel een toast.
 */
export function SkipToggle({
  locale,
  listId,
  userId,
  name,
  skipped,
}: {
  locale: "nl" | "en";
  listId: string;
  userId: string;
  name: string;
  skipped: boolean;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const data = new FormData();
      data.set("listId", listId);
      data.set("userIds", userId);
      data.set("skip", skipped ? "0" : "1");
      const result = await setPraesidiumShiftSkipAction(data);
      if (result.status === "error") {
        showToast({
          message: nl ? "Niet opgeslagen: deze lijst bestaat niet meer." : "Not saved: this list no longer exists.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: skipped
          ? nl
            ? `${name} telt weer mee op deze lijst.`
            : `${name} counts on this list again.`
          : nl
            ? `${name} wordt overgeslagen op deze lijst.`
            : `${name} is skipped on this list.`,
        variant: "success",
      });
    });
  }

  const label = skipped
    ? nl
      ? "Weer laten meetellen"
      : "Count again"
    : nl
      ? "Overslaan op deze lijst"
      : "Skip on this list";
  return (
    <IconButton label={label} srLabel={`${label}: ${name}`} onClick={toggle} disabled={pending}>
      {skipped ? <EyeIcon /> : <EyeOffIcon />}
    </IconButton>
  );
}

/** Iedereen van een post in één keer overslaan ("Logistiek" op 24UL). */
export function SkipPostForm({
  locale,
  listId,
  posts,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  posts: { id: string; name: string; members: number }[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={skipPraesidiumShiftPostAction}
      submitLabel={nl ? "Post overslaan" : "Skip post"}
      submitVariant="ghost"
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Overgeslagen." : "Skipped."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
      className="flex flex-wrap items-center gap-2"
      footer={({ submitButton }) => submitButton}
    >
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="w-64">
        <SearchPicker
          name="groupId"
          options={posts.map((p) => ({
            value: p.id,
            label: p.name,
            hint: nl ? `${p.members} ${p.members === 1 ? "lid" : "leden"}` : `${p.members} members`,
          }))}
          placeholder={nl ? "Hele post overslaan..." : "Skip a whole post..."}
          searchPlaceholder={nl ? "Typ een post, bv. logistiek" : "Type a post, e.g. logistics"}
          ariaLabel={nl ? "Welke post overslaan?" : "Which post to skip?"}
          emptyText={(q) => (nl ? `Geen post gevonden voor "${q}".` : `No post found for "${q}".`)}
        />
      </div>
    </SaveForm>
  );
}

/** Iemand uit het praesidium kiezen om over te slaan; slaat meteen op. */
export function SkipPersonPicker({
  locale,
  listId,
  people,
}: {
  locale: "nl" | "en";
  listId: string;
  people: { userId: string; name: string; posts: string[] }[];
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function skip(userId: string) {
    if (!userId) return;
    const person = people.find((p) => p.userId === userId);
    startTransition(async () => {
      const data = new FormData();
      data.set("listId", listId);
      data.set("userIds", userId);
      data.set("skip", "1");
      const result = await setPraesidiumShiftSkipAction(data);
      showToast(
        result.status === "error"
          ? { message: nl ? "Niet opgeslagen: deze lijst bestaat niet meer." : "Not saved: this list no longer exists.", variant: "error", duration: 0 }
          : { message: nl ? `${person?.name ?? "Lid"} wordt overgeslagen op deze lijst.` : `${person?.name ?? "Member"} is skipped on this list.`, variant: "success" },
      );
    });
  }

  return (
    <div className="w-64">
      <SearchPicker
        key={people.length}
        value=""
        onChange={skip}
        disabled={pending}
        options={people.map((p) => ({ value: p.userId, label: p.name, hint: p.posts.join(", ") || undefined }))}
        placeholder={nl ? "Iemand overslaan..." : "Skip someone..."}
        searchPlaceholder={nl ? "Typ een naam of post" : "Type a name or post"}
        ariaLabel={nl ? "Wie overslaan?" : "Who to skip?"}
        emptyText={(q) => (nl ? `Niemand past bij "${q}".` : `Nobody matches "${q}".`)}
      />
    </div>
  );
}
