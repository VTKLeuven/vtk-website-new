/**
 * Hoe lang na een verstuurde bevestiging de knop "opnieuw versturen" niets
 * doet. Lang genoeg om een reeks ongeduldige klikken op te vangen terwijl de
 * mail nog onderweg is, kort genoeg dat een koper die ze echt kwijt is niet
 * hoeft te wachten.
 */
export const RESEND_COOLDOWN_MS = 2 * 60_000;

type OutboxRow = {
  id: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "DEAD";
  sentAt: Date | null;
  availableAt: Date;
};

export type ResendDecision =
  /** Er staat niets klaar: zet een nieuwe mail in de rij. */
  | { kind: "queue" }
  /** Een mislukte poging staat te wachten: probeer die meteen opnieuw. */
  | { kind: "retry"; messageId: string }
  /** Er staat er al een in de rij of ze wordt net verstuurd. */
  | { kind: "alreadyQueued" }
  /** Ze vertrok net; nog een keer is een dubbele mail. */
  | { kind: "recentlySent"; sentAt: Date };

/**
 * Wat een klik op "Bevestiging opnieuw versturen" doet, gegeven de
 * bevestigingsmails van die bestelling in de outbox. Puur, zodat de regel
 * zonder databank getest kan worden.
 */
export function resendDecision(messages: OutboxRow[], now: Date): ResendDecision {
  if (messages.some((message) => message.status === "PENDING" || message.status === "PROCESSING")) {
    return { kind: "alreadyQueued" };
  }
  const lastSent = messages
    .filter((message) => message.status === "SENT" && message.sentAt)
    .map((message) => message.sentAt as Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastSent && now.getTime() - lastSent.getTime() < RESEND_COOLDOWN_MS) {
    return { kind: "recentlySent", sentAt: lastSent };
  }
  const failed = messages.find((message) => message.status === "FAILED");
  if (failed) return { kind: "retry", messageId: failed.id };
  return { kind: "queue" };
}
