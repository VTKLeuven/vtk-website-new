import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Label, Input, Select, Button } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, pick } from "@vtk/i18n";
import { formatEuro } from "@/lib/theokot";
import { updateProfileAction, logoutAction } from "@/app/actions/auth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SaveForm } from "@/components/ui/SaveForm";
import { deleteMyAccountAction } from "@/app/actions/privacy";

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

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">VTK</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{dict.auth.account}</h1>
      </div>
      <Card className="p-6">
        <SaveForm
          action={updateProfileAction}
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
                <Link href="/theokot" className="font-medium text-vtk-ink underline">
                  Reserveer broodjes
                </Link>
                .
              </>
            ) : (
              <>
                You have no open reservations.{" "}
                <Link href="/en/theokot" className="font-medium text-vtk-ink underline">
                  Reserve sandwiches
                </Link>
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
                <Link href="/theokot" className="font-medium text-vtk-ink underline">
                  Theokot-pagina
                </Link>
                .
              </>
            ) : (
              <>
                Manage or cancel reservations on the{" "}
                <Link href="/en/theokot" className="font-medium text-vtk-ink underline">
                  Theokot page
                </Link>
                .
              </>
            )}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-vtk-ink">
          {nl ? "Jouw privacyrechten" : "Your privacy rights"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#5c667f]">
          {nl
            ? "Download een machineleesbare kopie van je profiel, lidmaatschappen, reservaties, ticketbestellingen en toegangslogs. Geheime tokens worden niet opgenomen en gestructureerde gegevens van andere deelnemers worden afgeschermd."
            : "Download a machine-readable copy of your profile, memberships, reservations, ticket orders and access logs. Secret tokens are excluded and structured details of other attendees are redacted."}
        </p>
        {/* A normal navigation is intentional: the API response is an attachment. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/account/export"
          download
          className="mt-4 inline-flex min-h-10 items-center rounded-full border border-vtk-ink px-4 text-sm font-medium text-vtk-ink"
        >
          {nl ? "Download mijn gegevens (JSON)" : "Download my data (JSON)"}
        </a>

        <div className="mt-8 border-t border-vtk-blue/12 pt-6">
          <h3 className="font-semibold text-red-800">
            {nl ? "Account verwijderen" : "Delete account"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#5c667f]">
            {nl
              ? "Dit wist je login, profiel, lidmaatschappen en huidige rechten. Transacties die VTK wettelijk of voor de integriteit van de administratie moet bewaren, worden geanonimiseerd. Typ DELETE om te bevestigen."
              : "This removes your login, profile, memberships and current permissions. Transactions VTK must keep for legal or administrative integrity reasons are anonymised. Type DELETE to confirm."}
          </p>
          <form action={deleteMyAccountAction} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="delete-confirmation">DELETE</Label>
              <Input
                id="delete-confirmation"
                name="confirmation"
                autoComplete="off"
                pattern="DELETE"
                required
              />
            </div>
            <Button type="submit" variant="ghost">
              {nl ? "Mijn account verwijderen" : "Delete my account"}
            </Button>
          </form>
        </div>
      </Card>

      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {dict.auth.signOut}
        </Button>
      </form>
    </div>
  );
}
