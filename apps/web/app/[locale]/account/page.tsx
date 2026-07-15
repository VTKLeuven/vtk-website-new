import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Label, Input, Select, Button } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, pick } from "@vtk/i18n";
import { formatEuro } from "@/lib/theokot";
import type { SaveState } from "@/lib/saveState";
import { updateProfileAction, logoutAction } from "@/app/actions/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SaveForm } from "@/components/ui/SaveForm";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const session = await requireSession(`/inloggen?next=${nl ? "" : "/en"}/account`);
  const dict = getDictionary(locale);

  // Volledig profiel voor het bewerkbare gegevensformulier (kotadres, mails, ...).
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      rNumber: true,
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
      studyYears: true,
      studyProgrammes: true,
      notAtFaculty: true,
    },
  });

  // Aankomende reservaties (nog niet opgehaald, afhaalvenster nog niet voorbij).
  const now = new Date();
  const reservations = await prisma.theokotOrder.findMany({
    where: { userId: session.user.id, status: "RESERVED", session: { pickupEnd: { gte: now } } },
    orderBy: { session: { date: "asc" } },
    include: {
      session: { select: { date: true, pickupStart: true, pickupEnd: true } },
      lines: {
        include: { sessionItem: { select: { nameNl: true, nameEn: true } } },
        orderBy: { sessionItem: { order: "asc" } },
      },
    },
  });

  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function onSaveLocale(_prev: SaveState, formData: FormData): Promise<SaveState> {
    "use server";
    return updateProfileAction(session.user.id, formData);
  }

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">VTK</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{dict.auth.account}</h1>
      </div>
      <Card className="p-6">
        <SaveForm
          action={onSaveLocale}
          className="space-y-4"
          submitLabel={dict.auth.updateProfile}
          savingLabel={dict.common.saving}
          savedMessage={dict.auth.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div>
            <Label>{dict.auth.email}</Label>
            <Input defaultValue={session.user.email} disabled />
          </div>
          <div>
            <Label htmlFor="locale">{dict.header.language}</Label>
            <Select id="locale" name="locale" defaultValue={session.user.locale}>
              <option value="NL">Nederlands</option>
              <option value="EN">English</option>
            </Select>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-6">
        <ProfileForm
          locale={locale}
          user={profile}
          submitLabel={nl ? "Gegevens opslaan" : "Save details"}
        />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-vtk-ink">
          {nl ? "Gereserveerde broodjes" : "Reserved sandwiches"}
        </h2>
        {reservations.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? (
              <>
                Je hebt geen openstaande reservaties.{" "}
                <a href="/theokot" className="font-medium text-vtk-ink underline">
                  Reserveer broodjes
                </a>
                .
              </>
            ) : (
              <>
                You have no open reservations.{" "}
                <a href="/en/theokot" className="font-medium text-vtk-ink underline">
                  Reserve sandwiches
                </a>
                .
              </>
            )}
          </p>
        ) : (
          <ul className="space-y-4">
            {reservations.map((order) => (
              <li
                key={order.id}
                className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 p-4"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold capitalize text-vtk-ink">
                    {dayFmt.format(order.session.date)}
                  </span>
                  <span className="text-xs text-[#5c667f]">
                    {nl ? "Afhalen" : "Pickup"}: {timeFmt.format(order.session.pickupStart)} –{" "}
                    {timeFmt.format(order.session.pickupEnd)}
                  </span>
                </div>
                <ul className="text-sm text-[#34405e]">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex justify-between py-0.5">
                      <span>
                        {line.quantity}× {pick(line.sessionItem.nameNl, line.sessionItem.nameEn, locale) ?? line.sessionItem.nameNl}
                      </span>
                      <span className="tabular-nums">{formatEuro(line.quantity * line.unitPriceCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-vtk-blue/10 pt-2 text-sm">
                  <span className="font-semibold">{nl ? "Totaal" : "Total"}</span>
                  <span className="font-semibold tabular-nums">{formatEuro(order.totalCents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {reservations.length > 0 && (
          <p className="mt-4 text-xs text-[#5c667f]">
            {nl ? (
              <>
                Reservaties beheren of annuleren doe je op de{" "}
                <a href="/theokot" className="font-medium text-vtk-ink underline">
                  Theokot-pagina
                </a>
                .
              </>
            ) : (
              <>
                Manage or cancel reservations on the{" "}
                <a href="/en/theokot" className="font-medium text-vtk-ink underline">
                  Theokot page
                </a>
                .
              </>
            )}
          </p>
        )}
      </Card>

      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {dict.auth.signOut}
        </Button>
      </form>
    </div>
  );
}
