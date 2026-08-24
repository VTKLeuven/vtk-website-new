import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";

import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { PushComposer, type PushAudience } from "./PushComposer";

/**
 * Met de hand een pushbericht sturen naar de VTK-app.
 *
 * Bewust een klein scherm. De automatische berichten (je broodje ligt klaar, je
 * shift begint) vertrekken vanzelf; dit is voor het uitzonderlijke geval, en dan
 * telt vooral dat je ziet naar hoeveel toestellen het gaat voor je klikt.
 */
export default async function AdminAppPush({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const nl = localeParam === "nl";

  await requirePermission("app.push");

  // Toestellen en niet leden: iemand zonder app hoort niet in de telling te
  // zitten die iemand gebruikt om te beslissen of hij verstuurt.
  const [devices, perGroup] = await Promise.all([
    prisma.appPushDevice.count(),
    prisma.group.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { nameNl: "asc" }],
      select: {
        code: true,
        nameNl: true,
        nameEn: true,
        type: true,
        _count: { select: { memberships: true } },
      },
    }),
  ]);

  const audiences: PushAudience[] = [
    { code: "", label: nl ? "Iedereen met de app" : "Everyone with the app", count: devices },
    ...perGroup.map((group) => ({
      code: group.code,
      label: nl ? group.nameNl : group.nameEn,
      count: null,
    })),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "App-pushberichten" : "App push notifications"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Een bericht op de telefoon van wie de app heeft. Dit kan niet teruggenomen worden."
            : "A message on the phone of everyone with the app. This cannot be undone."}
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{nl ? "Bericht opstellen" : "Compose message"}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "Kies de doelgroep, stel het bericht op en controleer het voorbeeld voor verzenden."
              : "Choose the target audience, compose the message and check the preview before sending."}
          </p>
        </div>
        <Card className="p-5 sm:p-6">
          <PushComposer locale={nl ? "nl" : "en"} audiences={audiences} deviceCount={devices} />
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            {nl ? "Wat er vanzelf vertrekt" : "What is sent automatically"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "Onderstaande meldingen vertrekken al automatisch vanuit de site; die hoef je hier niet handmatig te versturen."
              : "The notifications below are sent automatically by the site; you don't need to send them manually here."}
          </p>
        </div>
        <Card className="p-5 sm:p-6">
          <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
            <li>
              <span className="font-medium text-vtk-ink">
                {nl ? "Broodje ligt klaar:" : "Sandwich is ready:"}
              </span>{" "}
              {nl
                ? "Zodra de afhaal bij het Theokot opengaat."
                : "As soon as Theokot pickup opens."}
            </li>
            <li>
              <span className="font-medium text-vtk-ink">
                {nl ? "Shift-herinnering:" : "Shift reminder:"}
              </span>{" "}
              {nl
                ? "Samen met de herinneringsmail voor medewerkers."
                : "Alongside the reminder e-mail for volunteers."}
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
