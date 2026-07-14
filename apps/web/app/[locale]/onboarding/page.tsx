import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Button } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const home = locale === "en" ? "/en" : "/";

  const session = await requireSession(
    `/inloggen?next=${locale === "en" ? "/en" : ""}/onboarding`
  );
  // Already completed: nothing to do here.
  if (session.user.onboarded) redirect(home);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      avatarKey: true,
      street: true,
      houseNumber: true,
      bus: true,
      postalCode: true,
      city: true,
      birthDate: true,
      personalEmail: true,
      emailPreference: true,
      mailCategories: true,
      studyYear: true,
      studyProgrammes: true,
    },
  });

  const t = getDictionary(locale).onboarding;

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">{t.kicker}</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-[#34405e]">{t.intro}</p>
      </div>

      <Card className="p-6">
        <ProfileForm locale={locale} user={user} next={home} submitLabel={t.submit} />
      </Card>

      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {getDictionary(locale).auth.signOut}
        </Button>
      </form>
    </div>
  );
}
