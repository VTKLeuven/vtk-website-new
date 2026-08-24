import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { staticMetadata } from "@/lib/pageMetadata";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getGoogleStatus } from "@/lib/google/config";
import { DeferLinkButton } from "./DeferLinkButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("linkVtkAccount", "/koppel-vtk-account", locale, { noIndex: true });
}

/**
 * "Koppel je VTK-account": het lid meldt zich één keer aan met zijn eigen
 * `@vtk.be`-account zodat wij weten welk Google-account bij hem hoort.
 *
 * De gate in `apps/web/proxy.ts` stuurt hierheen zolang een lid met een post of
 * werkgroep niet gekoppeld is. Deze pagina moet daarom twee dingen heel duidelijk
 * doen: zeggen dat het om het **VTK-account** gaat en niet om een privé-Gmail,
 * en een uitweg bieden aan wie nog geen account heeft. Zonder die uitweg zet de
 * gate iemand buiten die er zelf niets aan kan doen.
 */
export default async function LinkVtkAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ fout?: string; adres?: string; gekoppeld?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const query = await searchParams;

  const session = await requireSession(
    `/inloggen?next=${nl ? "" : "/en"}/koppel-vtk-account`,
  );
  const [user, status] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { googleEmail: true },
    }),
    getGoogleStatus(),
  ]);

  const home = nl ? "/" : "/en";
  const domain = status.domain ?? "vtk.be";
  const t = nl
    ? {
        title: "Koppel je VTK-account",
        lead: `Meld je één keer aan met je eigen @${domain}-account. Daarna weten we welk mailadres bij jou hoort, en kom je vanzelf in de mailinglijsten van je post terecht.`,
        warning: `Gebruik je VTK-account (jouw.naam@${domain}), niet je persoonlijke Gmail. Google toont soms eerst het account waarmee je in deze browser ingelogd bent; kies expliciet je VTK-account.`,
        button: "Aanmelden met mijn VTK-account",
        linked: (email: string) => `Gekoppeld aan ${email}.`,
        change: "Een ander account koppelen",
        noAccount: "Ik heb nog geen VTK-account",
        noAccountHelp:
          "Dan vraag je er een aan bij IT. We laten je nu door en vragen het over een week opnieuw.",
        back: "Naar de site",
        notConfigured:
          "De koppeling is nog niet ingesteld. Laat IT dit afwerken; je hoeft nu niets te doen.",
        errors: {
          STATE: "De koppeling is verlopen of onderbroken. Probeer het opnieuw.",
          CANCELLED: "Je hebt de aanmelding bij Google geannuleerd.",
          NOT_CONFIGURED: "De koppeling is nog niet ingesteld. Laat IT dit afwerken.",
          EXCHANGE_FAILED: "Google gaf geen antwoord dat we konden gebruiken. Probeer het opnieuw.",
          NO_EMAIL: "Google gaf geen mailadres terug. Probeer het opnieuw.",
          UNVERIFIED: "Dat adres is bij Google niet geverifieerd.",
          WRONG_DOMAIN: `Dat is geen @${domain}-adres. Meld je opnieuw aan, maar kies je VTK-account.`,
          NOT_IN_DIRECTORY: `Dat account bestaat niet in ${domain}.`,
          ALREADY_LINKED: "Dat account hangt al aan een ander lid. Laat IT dit rechtzetten.",
        } as Record<string, string>,
      }
    : {
        title: "Link your VTK account",
        lead: `Sign in once with your own @${domain} account. After that we know which address is yours, and you end up in your post's mailing lists automatically.`,
        warning: `Use your VTK account (your.name@${domain}), not your personal Gmail. Google sometimes offers the account you are signed in with in this browser first; pick your VTK account explicitly.`,
        button: "Sign in with my VTK account",
        linked: (email: string) => `Linked to ${email}.`,
        change: "Link a different account",
        noAccount: "I do not have a VTK account yet",
        noAccountHelp:
          "Then ask IT for one. We will let you through now and ask again in a week.",
        back: "To the site",
        notConfigured:
          "Linking is not set up yet. Let IT finish this; there is nothing for you to do now.",
        errors: {
          STATE: "The link attempt expired or was interrupted. Try again.",
          CANCELLED: "You cancelled the sign-in at Google.",
          NOT_CONFIGURED: "Linking is not set up yet. Let IT finish this.",
          EXCHANGE_FAILED: "Google's reply could not be used. Try again.",
          NO_EMAIL: "Google returned no email address. Try again.",
          UNVERIFIED: "That address is not verified at Google.",
          WRONG_DOMAIN: `That is not an @${domain} address. Sign in again and pick your VTK account.`,
          NOT_IN_DIRECTORY: `That account does not exist in ${domain}.`,
          ALREADY_LINKED: "That account already belongs to another member. Let IT sort this out.",
        } as Record<string, string>,
      };

  const error = query.fout ? (t.errors[query.fout] ?? t.errors.STATE) : null;
  const startHref = `/api/google/link/start?locale=${locale}`;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <Card className="space-y-5 p-6">
        <div>
          <h1 className="vtk-page-title text-2xl">{t.title}</h1>
          <p className="mt-2 text-sm text-vtk-body">{t.lead}</p>
        </div>

        {query.gekoppeld && user.googleEmail && (
          <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {t.linked(user.googleEmail)}
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
            {query.adres && <span className="mt-1 block text-xs">{query.adres}</span>}
          </p>
        )}

        {!status.linkingConfigured ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.notConfigured}
          </p>
        ) : (
          <>
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t.warning}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a className="vtk-btn vtk-btn-primary" href={startHref}>
                {user.googleEmail ? t.change : t.button}
              </a>
              {user.googleEmail && (
                <span className="text-sm text-vtk-muted">{t.linked(user.googleEmail)}</span>
              )}
            </div>
          </>
        )}

        {/* Uitstellen heeft enkel zin wanneer er iets te koppelen valt. Is de
            koppeling nog niet ingesteld, dan is er ook geen gate en volstaat
            een weg terug. */}
        {user.googleEmail || !status.linkingConfigured ? (
          <Link href={home} className="vtk-link text-sm">
            {t.back}
          </Link>
        ) : (
          <div className="border-t border-vtk-line pt-4">
            <DeferLinkButton label={t.noAccount} help={t.noAccountHelp} home={home} />
          </div>
        )}
      </Card>
    </div>
  );
}
