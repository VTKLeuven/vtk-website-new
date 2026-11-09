import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { managedPocIds } from "@/lib/pocPolls/access";
import { defaultPollCloseInput } from "@/lib/pocPolls/draft";
import { requireSession } from "@/lib/session";
import { loadBuilderData } from "../builderData";
import { PollBuilder } from "../PollBuilder";

import "@/app/design/vtk-poc-poll.css";

export default async function NieuwePeiling({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession(`${base}/inloggen?next=${base}/admin/peilingen/nieuw`);
  const scope = await managedPocIds(session);
  const data = await loadBuilderData(scope, locale);
  if (data.pocs.length === 0) notFound();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{nl ? "Nieuwe peiling" : "New poll"}</h1>
      <PollBuilder
        locale={locale}
        initial={{
          id: null,
          pocId: data.pocs[0].id,
          title: "",
          closesAt: defaultPollCloseInput(),
          meetingDate: "",
          studyYears: [],
          postToDiscord: true,
          questions: [{ kind: "YES_NO", text: "", low: "", high: "" }],
        }}
        {...data}
      />
    </div>
  );
}
