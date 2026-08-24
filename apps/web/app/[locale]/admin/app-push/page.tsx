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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Pushberichten" : "Push notifications"}</h1>
        <p className="text-vtk-blue-muted mt-1 text-sm">
          {nl
            ? "Een bericht op de telefoon van wie de app heeft. Dit kan niet teruggenomen worden."
            : "A message on the phone of everyone with the app. This cannot be undone."}
        </p>
      </div>

      <Card>
        <PushComposer locale={nl ? "nl" : "en"} audiences={audiences} deviceCount={devices} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold">
          {nl ? "Wat er vanzelf vertrekt" : "What is sent automatically"}
        </h2>
        <ul className="text-vtk-blue-muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            {nl
              ? "Je broodje ligt klaar, zodra de afhaal bij het Theokot opengaat."
              : "Your sandwich is ready, as soon as Theokot pickup opens."}
          </li>
          <li>
            {nl
              ? "Een herinnering aan een shift, samen met de herinneringsmail."
              : "A shift reminder, alongside the reminder e-mail."}
          </li>
        </ul>
        <p className="text-vtk-blue-muted mt-3 text-sm">
          {nl
            ? "Die twee hoef je hier niet te sturen. Gebruik dit scherm enkel voor iets dat niet vanzelf gaat."
            : "You do not need to send those here. Use this screen only for something that is not automatic."}
        </p>
      </Card>
    </div>
  );
}
