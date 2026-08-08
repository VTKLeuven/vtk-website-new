import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { LegalArticle } from "@/components/site/LegalArticle";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("cookies", "/cookies", locale);
}

export default async function CookiePolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const english = locale === "en";

  return (
    <LegalArticle
      kicker="VTK · KU Leuven"
      title={english ? "Cookie policy" : "Cookiebeleid"}
      lead={
        english
          ? "This page explains which browser storage VTK uses and how you can change your choice."
          : "Deze pagina legt uit welke browseropslag VTK gebruikt en hoe je jouw keuze aanpast."
      }
      updated={english ? "Last updated on 8 August 2026." : "Laatst bijgewerkt op 8 augustus 2026."}
      sections={
        english
          ? [
              {
                heading: "Essential cookies",
                body: "These are needed for the service you request and cannot be disabled in our interface:\n• VTK sign-in and security cookies: keep an authenticated session, normally no longer than 30 days\n• ticket access cookies: reopen an order or ticket, until the configured access expiry\n• vtk-logistiek-locale: remembers the language of the logistics site\n• vtk_cookie_consent: remembers this choice for 180 days\nThey are not used for advertising.",
              },
              {
                heading: "Optional statistics and diagnostics",
                body: "Only after you select “Allow statistics and diagnostics” do two things start:\n• visitor statistics with Umami, which VTK runs on its own server. It sets no cookies and reads nothing from your device. It counts page views; to recognise a repeat view within the same day it derives a hash from your IP address, browser and a salt that rotates daily, and your IP address itself is not stored. Admin, scanner and ticket-order pages are never measured, and query strings are stripped.\n• error diagnostics with Sentry: browser errors, performance traces and masked session replays. Text is masked and media is blocked in replay. VTK does not intentionally send passwords or form contents.\nYou can withdraw consent at any time through “Cookie settings” in the footer; reloading then stops both.",
              },
              {
                heading: "External media",
                body: "YouTube or Vimeo is contacted only when you deliberately start embedded external media. Those providers may then receive your IP address, browser details and set their own storage under their policies. VTK does not load a YouTube poster automatically; editors may provide a first-party poster.",
              },
              {
                heading: "Managing your choice",
                body: "Use “Cookie settings” in the footer to reopen the preference panel. Removing site data in your browser also removes the saved choice and essential sessions, which may sign you out.",
              },
              {
                heading: "Contact",
                body: "Questions about cookies, statistics or diagnostics can be sent to it@vtk.be. More information about all personal-data processing is in the privacy statement.",
              },
            ]
          : [
              {
                heading: "Noodzakelijke cookies",
                body: "Deze zijn nodig voor de dienst die je vraagt en kan je in onze interface niet uitschakelen:\n• VTK-aanmeld- en beveiligingscookies: houden een aangemelde sessie bij, normaal niet langer dan 30 dagen\n• tickettoegangscookies: openen een bestelling of ticket opnieuw, tot de ingestelde vervaldatum\n• vtk-logistiek-locale: onthoudt de taal van de logistieke site\n• vtk_cookie_consent: onthoudt deze keuze 180 dagen\nZe worden niet voor reclame gebruikt.",
              },
              {
                heading: "Optionele statistieken en monitoring",
                body: "Enkel nadat je “Statistieken en monitoring toestaan” kiest, starten twee dingen:\n• bezoekersstatistieken met Umami, dat VTK op zijn eigen server draait. Het plaatst geen cookies en leest niets van je toestel. Het telt paginaweergaves; om binnen dezelfde dag een herhaalde weergave te herkennen maakt het een hash van je IP-adres, je browser en een zout dat dagelijks wisselt, en je IP-adres zelf wordt niet bewaard. Beheer-, scanner- en ticketbestelpagina's worden nooit gemeten, en querystrings gaan er niet in mee.\n• technische monitoring met Sentry: browserfouten, prestatiemetingen en gemaskeerde sessieopnames. Tekst wordt gemaskeerd en media geblokkeerd in opnames. VTK stuurt niet bewust wachtwoorden of formulierinhoud door.\nJe kan toestemming altijd intrekken via “Cookie-instellingen” in de footer; na herladen stoppen ze allebei.",
              },
              {
                heading: "Externe media",
                body: "YouTube of Vimeo wordt pas gecontacteerd wanneer je bewust externe media start. Die aanbieders kunnen dan je IP-adres en browsergegevens ontvangen en volgens hun eigen beleid opslag plaatsen. VTK laadt niet automatisch een YouTube-poster; redacteurs kunnen een first-party poster instellen.",
              },
              {
                heading: "Je keuze beheren",
                body: "Gebruik “Cookie-instellingen” in de footer om het voorkeurenvenster opnieuw te openen. Als je sitegegevens in je browser wist, verdwijnen ook de opgeslagen keuze en noodzakelijke sessies, waardoor je afgemeld kan worden.",
              },
              {
                heading: "Contact",
                body: "Vragen over cookies, statistieken of monitoring kan je sturen naar it@vtk.be. Meer informatie over alle verwerkingen van persoonsgegevens staat in de privacyverklaring.",
              },
            ]
      }
    />
  );
}
