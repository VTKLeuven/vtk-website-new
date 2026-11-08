"use client";

import { useTransition } from "react";
import { Button } from "@vtk/ui";
import { togglePocPollAnswerAction } from "@/app/actions/poc-polls";
import { IconButton } from "@/components/ui/IconButton";
import { EyeIcon, EyeOffIcon, StarIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";

/** Markeren voor de POC en verbergen, per open antwoord. */
export function OpenAnswerActions({
  pollId,
  questionId,
  answerRef,
  starred,
  hidden,
  text,
  nl,
}: {
  pollId: string;
  questionId: string;
  answerRef: string;
  starred: boolean;
  hidden: boolean;
  text: string;
  nl: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function toggle(flag: "starred" | "hidden") {
    const form = new FormData();
    form.set("id", pollId);
    form.set("questionId", questionId);
    form.set("ref", answerRef);
    form.set("flag", flag);
    startTransition(async () => {
      const result = await unsentGuard.run(() => togglePocPollAnswerAction(form));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({ message: nl ? "Niet gelukt: vernieuw de pagina." : "That failed: please refresh the page.", variant: "error", duration: 0 });
      }
    });
  }

  const starLabel = starred ? (nl ? "Markering weghalen" : "Remove mark") : nl ? "Markeren voor de POC" : "Mark for the POC";
  const hideLabel = hidden ? (nl ? "Weer tonen" : "Show again") : nl ? "Verbergen" : "Hide";
  return (
    <div className="flex flex-none">
      <IconButton type="button" label={starLabel} srLabel={`${starLabel}: ${text}`} disabled={pending} onClick={() => toggle("starred")}>
        <StarIcon filled={starred} />
      </IconButton>
      <IconButton type="button" label={hideLabel} srLabel={`${hideLabel}: ${text}`} disabled={pending} onClick={() => toggle("hidden")}>
        {hidden ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
    </div>
  );
}

/** De totalen als tekst, om in de notities voor de POC te plakken. */
export function CopyForPocButton({ text, nl }: { text: string; nl: boolean }) {
  const showToast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ message: nl ? "Gekopieerd." : "Copied.", variant: "success" });
    } catch {
      showToast({ message: nl ? "Kopiëren lukte niet in deze browser." : "Copying failed in this browser.", variant: "error", duration: 0 });
    }
  }

  return (
    <Button type="button" variant="ghost" onClick={copy}>
      {nl ? "Kopieer voor de POC" : "Copy for the POC"}
    </Button>
  );
}
