import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { hasLocale } from "@/lib/locale";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { cashRegisterAccess } from "@/lib/kassas/server";
import { statusLabel } from "@/lib/kassas/kassa";
import { KassaNav } from "../KassaNav";
import { listInclude, toListRows } from "../rows";

/**
 * Wat je zelf aanvroeg en wat op een van je posten staat, ook voor wie beheert:
 * dit is de lijst van de post, niet die van Beheer. Het resultaat staat hier
 * niet; dat is het werk van Beheer, en de ticketinkomsten erin zijn niet voor
 * elk postlid zichtbaar.
 */
export default async function MijnKassas({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/mijn`);
  if (!access.canRequest) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Je hebt geen toegang tot de kassa's. Vraag IT om het recht 'Een kassa aanvragen' aan je rol te hangen."
          : "You do not have access to the cash registers. Ask IT to add the 'Request a cash register' permission to your role."}
      </p>
    );
  }

  const registers = await prisma.cashRegister.findMany({
    where: {
      OR: [{ requestedById: access.session.user.id }, { groupId: { in: access.postIds } }],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: listInclude,
    take: 200,
  });
  const rows = await toListRows(registers, locale);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Mijn aanvragen" : "My requests"}</h1>
          <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
            {nl
              ? "De kassa's die jij of je post aanvroeg. Zolang Beheer een aanvraag niet aanvaardde, kan je ze nog aanpassen of intrekken; daarna krijg je een mail om een ophaalmoment af te spreken."
              : "The cash registers you or your post requested. Until Administration accepts a request, you can still change or withdraw it; after that you get an email to arrange a pick-up time."}
          </p>
        </div>
        <Link
          href={`${base}/admin/kassas/aanvragen`}
          className="inline-flex h-10 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
        >
          {nl ? "Kassa aanvragen" : "Request a register"}
        </Link>
      </header>

      <KassaNav base={base} nl={nl} active="mijn" caps={{ request: true, manage: access.canManage }} />

      <section className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
        {rows.length === 0 ? (
          <div className="space-y-3 p-6 text-sm text-vtk-muted">
            <p>{nl ? "Je post vroeg nog geen kassa aan." : "Your post has not requested a cash register yet."}</p>
            <Link
              href={`${base}/admin/kassas/aanvragen`}
              className="font-medium text-vtk-ink underline underline-offset-4"
            >
              {nl ? "Een kassa aanvragen" : "Request a cash register"}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="vtk-kassa-table w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                  <th scope="col" className="w-[100px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Activiteit" : "Activity"}</th>
                  <th scope="col" className="w-[140px] px-4 py-3">{nl ? "Post" : "Post"}</th>
                  <th scope="col" className="w-[130px] px-4 py-3">Status</th>
                  <th scope="col" className="w-[110px] px-4 py-3 text-right">{nl ? "Startkassa" : "Float"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {rows.map((row) => {
                  const href = `${base}/admin/kassas/${row.id}`;
                  return (
                    <LinkedRow
                      key={row.id}
                      href={href}
                      className="cursor-pointer transition-colors hover:bg-vtk-blue-soft/30"
                    >
                      <td data-label={nl ? "Datum" : "Date"} className="whitespace-nowrap px-4 py-3 tabular-nums text-vtk-body">
                        {row.dateLabel}
                      </td>
                      <td data-wide className="px-4 py-3">
                        <Link href={href} className="font-medium text-vtk-ink hover:underline">
                          {row.activity}
                        </Link>
                        <span className="block text-xs text-vtk-muted">{row.responsibleName}</span>
                      </td>
                      <td data-label={nl ? "Post" : "Post"} className="px-4 py-3 text-vtk-body">
                        {row.postLabel}
                      </td>
                      <td data-label="Status" className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.status === "REQUESTED"
                              ? "bg-vtk-yellow text-vtk-on-yellow"
                              : "bg-vtk-blue-soft text-vtk-body"
                          }`}
                        >
                          {statusLabel(row.status, nl)}
                        </span>
                      </td>
                      <td
                        data-label={nl ? "Startkassa" : "Float"}
                        className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-vtk-body"
                      >
                        {formatEuro(row.result.startCents, locale)}
                      </td>
                    </LinkedRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
