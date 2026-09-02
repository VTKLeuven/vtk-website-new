import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { pick } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { submitExpenseAction } from "@/app/actions/expenses";
import { expenseAccess, getExpenseConfig } from "@/lib/rekeningen/server";
import { formatIban, toDateInputValue } from "@/lib/rekeningen/expenses";
import { RekeningenNav } from "../RekeningenNav";
import { ExpenseForm } from "../ExpenseForm";
import { expenseErrorMessages } from "../messages";

export default async function RekeningIndienen({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await expenseAccess(`${base}/inloggen?next=${base}/admin/rekeningen/indienen`);
  if (!access.canSubmit) {
    return (
      <p className="text-sm text-zinc-500">
        {nl
          ? "Je hebt geen recht om rekeningen in te dienen. Vraag IT om het recht 'Rekeningen indienen' aan je rol te hangen."
          : "You do not have the right to submit expenses. Ask IT to add the 'Submit expenses' permission to your role."}
      </p>
    );
  }

  const ownGroupIds = access.session.groups.map((group) => group.id);

  const [groups, previous, profile, config] = await Promise.all([
    prisma.group.findMany({
      where: { OR: [{ active: true }, { id: { in: ownGroupIds } }] },
      orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      select: { id: true, nameNl: true, nameEn: true },
    }),
    prisma.expense.findFirst({
      where: { submittedById: access.session.user.id, paymentMethod: "PERSONAL" },
      orderBy: { createdAt: "desc" },
      select: { groupId: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: access.session.user.id },
      select: { defaultIban: true },
    }),
    getExpenseConfig(),
  ]);

  const own = groups.filter((group) => ownGroupIds.includes(group.id));
  const others = groups.filter((group) => !ownGroupIds.includes(group.id));
  const name = (group: { nameNl: string; nameEn: string }) => pick(group.nameNl, group.nameEn, locale);

  const guidelines = nl ? config.guidelinesNl : config.guidelinesEn || config.guidelinesNl;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Rekening indienen" : "Submit an expense"}</h1>
        <p className="mt-1 max-w-5xl text-sm text-[#5c667f]">
          {nl
            ? "Kocht je iets voor VTK? Vul het blad in en voeg het bonnetje toe. Betaalde je met je eigen kaart, dan stort Beheer het terug op het rekeningnummer dat je hier invult."
            : "Bought something for VTK? Fill in the sheet and add the receipt. If you paid with your own card, Administration refunds it to the account number you enter here."}
        </p>
      </header>

      <RekeningenNav
        base={base}
        nl={nl}
        active="indienen"
        caps={{
          submit: access.canSubmit,
          overview: access.canSeeOverview,
          settings: access.canManageAll,
        }}
      />

      {guidelines.trim() && (
        <div className="prose-vtk max-w-none rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm shadow-[inset_3px_0_0_var(--yellow)]">
          <Markdown>{guidelines}</Markdown>
        </div>
      )}

      <div className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <ExpenseForm
          locale={nl ? "nl" : "en"}
          action={submitExpenseAction}
          defaultIbanHref={`${base}/account#default-iban`}
          posts={[
            ...own.map((group) => ({ id: group.id, name: `${name(group)} ${nl ? "(jouw post)" : "(your post)"}` })),
            ...others.map((group) => ({ id: group.id, name: name(group) })),
          ]}
          values={{
            groupId: previous?.groupId ?? own[0]?.id ?? "",
            payerName: access.session.user.name,
            activity: "",
            description: "",
            spentOn: toDateInputValue(new Date()),
            amount: "",
            paymentMethod: "VTK_CARD",
            iban: formatIban(profile.defaultIban),
          }}
          labels={{
            submitLabel: nl ? "Rekening indienen" : "Submit expense",
            savingLabel: nl ? "Bezig met indienen..." : "Submitting...",
            savedMessage: nl
              ? "Rekening ingediend. Ze staat nu bij Mijn rekeningen."
              : "Expense submitted. You will find it under My expenses.",
            fallbackErrorMessage: nl ? "Indienen mislukt." : "Could not submit.",
            errorMessages: expenseErrorMessages(locale),
          }}
        />
      </div>
    </div>
  );
}
