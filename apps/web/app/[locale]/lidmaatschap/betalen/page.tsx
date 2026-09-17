import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentStudyYear } from "@/lib/workingYear";
import { getMembership } from "@/lib/membership";
import { startMembershipCheckout } from "@/lib/membership/payments";

export const dynamic = "force-dynamic";

/**
 * De sprong naar de betaalpagina van de provider.
 *
 * Bewust een tussenstop en geen rechtstreekse redirect uit de bevestigingsactie:
 * een checkout aanmaken kan mislukken, en dan hoort het lid op zijn
 * statuspagina te landen met een melding, niet op een error boundary nadat het
 * net zijn studie bevestigd heeft.
 */
export default async function StartMembershipPaymentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const prefix = localeParam === "en" ? "/en" : "";
  const session = await requireSession(`/inloggen?next=${prefix}/lidmaatschap`);

  const membership = await getMembership(session.user.id, currentStudyYear());
  // Niets te betalen: geen lidmaatschap, al geactiveerd, of gratis.
  if (!membership || membership.activatedAt || membership.priceCents <= 0) {
    redirect(`${prefix}/lidmaatschap`);
  }

  let checkoutUrl: string;
  try {
    checkoutUrl = await startMembershipCheckout({
      membershipId: membership.id,
      userEmail: session.user.email,
      locale: localeParam === "en" ? "en" : "nl",
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Membership checkout could not be started", {
      membershipId: membership.id,
      error,
    });
    redirect(`${prefix}/lidmaatschap?betaling=mislukt`);
  }

  redirect(checkoutUrl);
}
