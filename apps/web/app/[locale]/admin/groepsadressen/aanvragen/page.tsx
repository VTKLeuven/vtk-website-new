import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { mailGroupAccess } from "@/lib/google/access";
import { getGoogleStatus } from "@/lib/google/config";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { DecideRequests } from "./DecideRequests";
import { RequestAccounts } from "./RequestAccounts";
import { PrefixRow } from "./PrefixRow";

/**
 * Accounts van werkgroepen (statix.voornaam.naam@vtk.be).
 *
 * Twee gezichten op één pagina. Een werkgroep ziet haar leden en vraagt voor
 * wie dat nodig heeft een account aan. IT of de vice (`googleAccounts.manage`)
 * ziet de open aanvragen en keurt ze goed, waarna de site het account meteen
 * aanmaakt. Vroeger mailde een werkgroep elk jaar een lijst namen naar IT.
 */
export default async function WerkgroepAccountRequests({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  const access = await mailGroupAccess();
  if (!access.manageAll && !access.approveAccounts && access.werkgroepIds.size === 0) {
    throw new Error("FORBIDDEN");
  }
  const year = currentWorkingYear();
  const status = await getGoogleStatus();
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short" });

  const [open, ownGroups, allWerkgroepen] = await Promise.all([
    access.approveAccounts
      ? prisma.werkgroepAccount.findMany({
          where: { status: "REQUESTED" },
          orderBy: { requestedAt: "asc" },
          select: {
            id: true,
            email: true,
            requestedAt: true,
            user: { select: { name: true, googleEmail: true } },
            group: { select: { nameNl: true, nameEn: true } },
            requestedBy: { select: { name: true } },
          },
        })
      : [],
    prisma.group.findMany({
      // IT ziet elke werkgroep met een voorvoegsel en kan ook in haar naam
      // aanvragen; een werkgroep enkel zichzelf.
      where: access.manageAll
        ? { type: "WERKGROEP", active: true, mailPrefix: { not: null } }
        : { id: { in: [...access.werkgroepIds] }, mailPrefix: { not: null } },
      orderBy: { nameNl: "asc" },
      select: {
        id: true,
        nameNl: true,
        nameEn: true,
        mailPrefix: true,
        memberships: {
          where: { year, user: { active: true, deletedAt: null } },
          orderBy: { user: { name: "asc" } },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                werkgroepAccounts: { select: { groupId: true, status: true, email: true, rejectReason: true } },
              },
            },
          },
        },
      },
    }),
    access.manageAll
      ? prisma.group.findMany({
          where: { type: "WERKGROEP", active: true },
          orderBy: { nameNl: "asc" },
          select: { id: true, nameNl: true, nameEn: true, mailPrefix: true },
        })
      : [],
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">
          {nl ? "Accounts van werkgroepen" : "Work group accounts"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "Een werkgroep vraagt hier zelf een account aan voor haar leden (statix.voornaam.naam@vtk.be). IT of de vice keurt goed, en dan maakt de site het account meteen aan. Het is een tweede account naast het persoonlijke: in de lijsten van de werkgroep komt dit adres, elders het persoonlijke."
            : "A work group requests an account for its members here (statix.firstname.lastname@vtk.be). IT or the vice approves, and the site creates the account right away. It is a second account next to the personal one: the work group's lists get this address, everything else the personal one."}
        </p>
      </div>

      {access.approveAccounts && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-vtk-ink">
            {nl ? "Open aanvragen" : "Open requests"}{" "}
            <span className="tabular-nums text-zinc-500">({open.length})</span>
          </h2>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-500">{nl ? "Geen open aanvragen." : "No open requests."}</p>
          ) : (
            <DecideRequests
              nl={nl}
              disabled={!status.configured}
              rows={open.map((r) => ({
                id: r.id,
                name: r.user.name,
                werkgroep: nl ? r.group.nameNl : r.group.nameEn,
                email: r.email,
                personal: r.user.googleEmail,
                requested: `${dateFmt.format(r.requestedAt)}${r.requestedBy ? ` · ${r.requestedBy.name}` : ""}`,
              }))}
            />
          )}
        </section>
      )}

      {ownGroups.map((g) => (
        <section key={g.id} className="space-y-3">
          <h2 className="text-base font-semibold text-vtk-ink">
            {nl ? g.nameNl : g.nameEn}{" "}
            <span className="text-sm font-normal text-zinc-500">({g.mailPrefix}.voornaam.naam@{status.domain ?? "vtk.be"})</span>
          </h2>
          <RequestAccounts
            nl={nl}
            groupId={g.id}
            rows={g.memberships.map(({ user }) => {
              const account = user.werkgroepAccounts.find((a) => a.groupId === g.id) ?? null;
              return {
                userId: user.id,
                name: user.name,
                missingName: !user.firstName?.trim() || !user.lastName?.trim(),
                status: account?.status ?? null,
                email: account?.email ?? null,
                rejectReason: account?.rejectReason ?? null,
              };
            })}
          />
        </section>
      ))}

      {access.manageAll && (
        <AdminDisclosure
          summary={
            <span>
              <span className="font-semibold text-vtk-ink">
                {nl ? "Voorvoegsels van werkgroepen" : "Work group prefixes"}
              </span>
              <span className="block text-xs text-zinc-500">
                {nl
                  ? `${allWerkgroepen.filter((w) => w.mailPrefix).length} van ${allWerkgroepen.length} werkgroepen beheren hun eigen adressen`
                  : `${allWerkgroepen.filter((w) => w.mailPrefix).length} of ${allWerkgroepen.length} work groups manage their own addresses`}
              </span>
            </span>
          }
        >
          <p className="mb-3 max-w-3xl text-xs text-zinc-500">
            {nl
              ? "Met een voorvoegsel (statix) beheert de werkgroep zelf de adressen die ermee beginnen, en vraagt ze accounts aan. Wie dat binnen de werkgroep mag, is wie haar leden mag beheren (recht werkgroepen.manageOwnMembers). Leeg = de werkgroep heeft hier niets te doen."
              : "With a prefix (statix) the work group manages the addresses starting with it and requests accounts. Within the work group, whoever may manage its members may do this (permission werkgroepen.manageOwnMembers). Empty = nothing to do here for the work group."}
          </p>
          <ul className="divide-y divide-vtk-blue/10">
            {allWerkgroepen.map((w) => (
              <PrefixRow key={w.id} nl={nl} groupId={w.id} name={nl ? w.nameNl : w.nameEn} prefix={w.mailPrefix} />
            ))}
          </ul>
        </AdminDisclosure>
      )}
    </div>
  );
}
