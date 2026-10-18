import { unsubscribeFromCategory, verifyUnsubscribeToken } from "@/lib/mailUnsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De uitschrijfknop die Gmail en Outlook zelf bovenaan een mail zetten
 * (`List-Unsubscribe-Post`, RFC 8058). De mailclient post hierheen zonder
 * cookies en zonder pagina; de ondertekende link is het bewijs.
 *
 * Enkel POST: een GET doet hier niets, want mailscanners openen elke link en
 * zouden anders iedereen uitschrijven. Wie de link in een browser opent, hoort
 * op /uitschrijven met de knop.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return new Response("Invalid unsubscribe link", { status: 400 });
  await unsubscribeFromCategory(parsed.userId, parsed.category);
  return new Response(null, { status: 204 });
}
