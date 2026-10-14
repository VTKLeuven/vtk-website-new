import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { cashRegisterAccess, getCashRegisterConfig } from "@/lib/kassas/server";
import { requestCashRegisterAction } from "@/app/actions/kassas";
import { KassaNav } from "../KassaNav";
import { RequestForm } from "../RequestForm";
import { kassaErrorMessages } from "../messages";
import { postChoices } from "../posts";

export default async function KassaAanvragen({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/aanvragen`);
  if (!access.canRequest) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Je hebt geen recht om een kassa aan te vragen. Vraag IT om het recht 'Een kassa aanvragen' aan je rol te hangen."
          : "You do not have the right to request a cash register. Ask IT to add the 'Request a cash register' permission to your role."}
      </p>
    );
  }

  const [posts, config] = await Promise.all([postChoices(access, locale), getCashRegisterConfig()]);
  const firstOwn = posts.find((post) => post.own)?.id ?? "";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Kassa aanvragen" : "Request a cash register"}</h1>
        <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
          {nl
            ? `Heb je voor een activiteit een kassa met wisselgeld nodig, of een Bancontact- of Payconiq-toestel? Vraag het hier aan. Beheer krijgt je aanvraag te zien en mailt je zodra ze aanvaard is; het ophalen spreek je daarna zelf af met de financieel beheerders of via ${config.contactEmail}.`
            : `Need a cash register with change for an activity, or a Bancontact or Payconiq device? Request it here. Administration sees your request and emails you once it is accepted; you then arrange the pick-up with the financial managers or via ${config.contactEmail}.`}
        </p>
      </header>

      <KassaNav base={base} nl={nl} active="aanvragen" caps={{ request: true, manage: access.canManage }} />

      <div className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <RequestForm
          locale={locale}
          action={requestCashRegisterAction}
          posts={posts.map((post) => ({ id: post.id, name: post.name }))}
          redirectAfter={`${base}/admin/kassas/mijn`}
          values={{
            date: "",
            activity: "",
            groupId: firstOwn,
            responsibleName: access.session.user.name,
            wantsBancontact: false,
            wantsPayconiq: false,
            comment: "",
            startCounts: {},
          }}
          labels={{
            submitLabel: nl ? "Kassa aanvragen" : "Request register",
            savingLabel: nl ? "Bezig met aanvragen..." : "Requesting...",
            savedMessage: nl
              ? "Aanvraag verstuurd. Je krijgt een mail zodra Beheer ze aanvaardt."
              : "Request sent. You get an email once Administration accepts it.",
            fallbackErrorMessage: nl ? "Aanvragen mislukt." : "Could not send the request.",
            errorMessages: kassaErrorMessages(locale),
          }}
        />
      </div>
    </div>
  );
}
