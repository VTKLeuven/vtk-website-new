import "server-only";
import { createHmac } from "node:crypto";

/**
 * De sleutel waarmee een antwoord aan zijn student hangt, zonder hem te noemen.
 *
 * Eén sleutel per student per peiling: zo telt iemand één keer en vindt de site
 * je eigen antwoorden terug om ze te wijzigen. Twee peilingen van dezelfde
 * student hebben verschillende sleutels, dus ook onderling zijn antwoorden niet
 * aan elkaar te koppelen. Wat dit niet tegenhoudt: wie zowel de database als
 * `BETTER_AUTH_SECRET` heeft, kan de sleutel van een gekende gebruiker narekenen.
 */
function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-poc-poll-secret-change-me";
}

export function pollVoterKey(pollId: string, userId: string): string {
  return createHmac("sha256", secret()).update(`vtk-poc-poll:v1:${pollId}:${userId}`).digest("base64url");
}

/**
 * Hoe de resultaten een open antwoord aanwijzen om het te markeren of te
 * verbergen. Per vraag anders, zodat de RiVers de antwoorden van één student
 * niet aan elkaar kunnen koppelen; de client krijgt `voterKey` nooit te zien.
 */
export function pollAnswerRef(questionId: string, voterKey: string): string {
  return createHmac("sha256", secret()).update(`vtk-poc-poll-ref:v1:${questionId}:${voterKey}`).digest("base64url").slice(0, 24);
}
