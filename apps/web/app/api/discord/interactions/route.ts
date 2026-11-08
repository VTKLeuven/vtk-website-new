import { verifyDiscordSignature } from "@/lib/discord/verify";
import {
  handlePollInteraction,
  INTERACTION_PING,
  type DiscordInteraction,
} from "@/lib/discord/pollInteractions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De Interactions Endpoint URL van de Discord-applicatie: hier komt elke klik op
 * een knop van een peiling binnen. Discord controleert bij het instellen dat een
 * verzoek met een foute handtekening een 401 krijgt. Zie docs/poc-peilingen.md.
 */
export async function POST(request: Request) {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKeyHex) return new Response("Discord is niet ingesteld.", { status: 503 });

  const body = await request.text();
  const valid = verifyDiscordSignature({
    publicKeyHex,
    signatureHex: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
    body,
  });
  if (!valid) return new Response("Ongeldige handtekening.", { status: 401 });

  const interaction = JSON.parse(body) as DiscordInteraction;
  if (interaction.type === INTERACTION_PING) return Response.json({ type: 1 });
  return Response.json(await handlePollInteraction(interaction));
}
