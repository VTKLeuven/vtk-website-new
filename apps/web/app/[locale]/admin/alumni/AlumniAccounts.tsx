"use client";

import { Card } from "@vtk/ui";
import { toggleAlumniAccountOptInAction } from "@/app/actions/alumni";
import type { AlumniAccount } from "@/lib/alumni";

/**
 * De alumni die een account op de site hebben.
 *
 * Staan hier naast het adresboek en niet erin: dit zijn echte gebruikers met een
 * profiel dat ze zelf bijhouden. Er valt hier dan ook maar één ding te wijzigen,
 * en dat is of ze in de mailinglijst zitten; naam, afstudeerjaar en
 * VTK-verleden blijven van hen.
 *
 * Zonder deze lijst zou een beheerder die op een reünie hoort "zet mij ook op
 * die lijst" een tweede rij in het adresboek maken, en die persoon dubbel mailen.
 */
export function AlumniAccounts({
  accounts,
  locale,
}: {
  accounts: AlumniAccount[];
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";

  return (
    <div className="space-y-2">
      <div>
        <h2 className="font-medium text-vtk-ink">
          {nl ? "Alumni met een account" : "Alumni with an account"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">
          {nl
            ? "Leden die zichzelf als alumnus aanduidden. Vink aan wie mails wil; dat is hetzelfde vinkje dat zij op hun eigen profiel zien. Voer je hierboven iemand in die al een account heeft, dan wordt hij hier gezet in plaats van in het adresboek."
            : "Members who marked themselves as alumni. Tick who wants mail; it is the same checkbox they see on their own profile. If you add someone above who already has an account, they end up here instead of in the address book."}
        </p>
      </div>

      {accounts.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "Nog geen leden die zichzelf als alumnus aanduidden."
              : "No members have marked themselves as alumni yet."}
          </p>
        </Card>
      ) : (
        // Een brede tabel in een horizontale scroller heeft een gepositioneerde
        // wrapper nodig; zie CLAUDE.md.
        <Card className="relative overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "E-mail" : "Email"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Lichting" : "Year"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "In VTK" : "In VTK"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Mailinglijst" : "Mailing list"}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-vtk-ink">
                    {account.name}
                    {!account.active ? (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">
                        {nl ? "Gedeactiveerd" : "Deactivated"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[#34405e]">{account.email}</td>
                  <td className="px-4 py-3 text-[#34405e]">{account.graduationYear ?? "—"}</td>
                  <td className="px-4 py-3 text-[#34405e]">
                    {account.wasInVtk ? (nl ? "Ja" : "Yes") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {account.optedIn ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        {nl ? "Krijgt mails" : "Receives mail"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {nl ? "Niet ingeschreven" : "Not subscribed"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggleAlumniAccountOptInAction}>
                      <input type="hidden" name="id" value={account.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
                      >
                        {account.optedIn
                          ? nl
                            ? "Uitschrijven"
                            : "Unsubscribe"
                          : nl
                            ? "Inschrijven"
                            : "Subscribe"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
