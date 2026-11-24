import "server-only";

import type { AdminNavItem, AdminNavNode } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import type { requireSession } from "@/lib/session";
import { canAccessAnyTicketEvent } from "@/lib/ticketing/authorization";
import { canAccessAnyForm } from "@/lib/forms/authorization";
import { getExpenseAccess } from "@/lib/rekeningen/server";
import { canSeeCommuRequests } from "@/lib/commu/requests";
import { isExternalUrl } from "@/lib/href";
import { getAdminNav, type NavGuard, type NavLeaf } from "@/lib/admin-nav";
import { canSeeMailGroups, mailGroupAccess } from "@/lib/google/access";
import { isPocOnly, representedPocIds } from "@/lib/pocPolls/access";
import { postenAccess } from "@/lib/postenAccess";
import { countsForBo } from "@/lib/bo/own";

type Session = Awaited<ReturnType<typeof requireSession>>;
type DictAdmin = ReturnType<typeof getDictionary>["admin"];

/**
 * De zijbalk van /admin zoals déze persoon ze ziet: de groepen en items uit
 * `lib/admin-nav.ts`, gefilterd op zijn rechten, in dezelfde volgorde.
 *
 * Eén plek voor de layout van de admin en voor de app (`/api/app/v1/beheer`),
 * zodat de app nooit een onderdeel toont dat de site verbergt, of omgekeerd.
 */
export async function visibleAdminNav(session: Session, locale: Locale): Promise<AdminNavNode[]> {
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";
  const adminDict = dict.admin as DictAdmin & { [key: string]: string };

  const canAccessTickets =
    session.user.isSuperAdmin ||
    session.permissions.includes("tickets.create") ||
    session.permissions.includes("tickets.manageAll") ||
    (await canAccessAnyTicketEvent());
  // Zelfde redenering als bij ticketing: een grant op één formulier is genoeg om
  // de tab te zien, ook zonder een van de globale formulierpermissies.
  const canAccessForms = session.user.isSuperAdmin || (await canAccessAnyForm());
  const canAccessCommuRequests = await canSeeCommuRequests();

  // RiVers van dit werkingsjaar krijgen de tab Peilingen, zonder apart recht.
  const pocRep =
    !session.permissions.includes("pocs.manage") && (await representedPocIds(session.user.id)).length > 0;
  // Een RiVer zonder post of werkgroep komt enkel voor de peilingen: geen
  // dashboard en geen uitleendienst in de zijbalk.
  const pocOnly = await isPocOnly(session);

  // Groepsadressen: wie ze beheert of accounts goedkeurt, en een werkgroep die
  // haar eigen adressen beheert. Dat laatste vraagt pas iets op met het recht.
  const mailGroupsVisible =
    session.permissions.includes("mailgroups.manage") ||
    session.permissions.includes("googleAccounts.manage") ||
    (session.permissions.includes("werkgroepen.manageOwnMembers") &&
      canSeeMailGroups(await mailGroupAccess(session)));

  // Posten & werkgroepen: één item voor vier tabbladen met elk hun eigen recht.
  const posten = await postenAccess(session);
  const postenVisible = posten.posts || posten.werkgroepen || posten.jaarwerkingen || posten.kiesploeg;

  // Rekeningen: ook een kiesploeglid zonder post dient in op de ploeg.
  const expenseAccess = await getExpenseAccess();
  const expensesVisible = Boolean(expenseAccess?.canSubmit || expenseAccess?.canSeeOverview);

  // Mag de huidige gebruiker deze entry zien? Superadmin ziet alles.
  const canSee = (guard: NavGuard): boolean => {
    if (session.user.isSuperAdmin) return true;
    if (guard.superAdminOnly) return false;
    if (guard.notForPocOnly && pocOnly) return false;
    // Ticketing-tab hangt af van ticket-toegang (eigen grant of globale perm),
    // niet van de gewone admin-permissies. canAccessTickets dekt superadmins al.
    if (guard.ticketing) return canAccessTickets;
    if (guard.forms) return canAccessForms;
    if (guard.commuRequests) return canAccessCommuRequests;
    // Werkgroepen-tab: beheerders óf gewone werkgroepleden.
    if (guard.werkgroep) return posten.werkgroepen;
    if (guard.jaarwerking) return posten.jaarwerkingen;
    // Mijn budgetten: elk lid van een post en de G3/G4 van een werkgroep, voor
    // zijn eigen post. Een gewoon werkgroeplid en een jaarwerking tellen niet
    // (zie `countsForBo` in lib/bo/own.ts).
    if (guard.post) return session.groups.some(countsForBo);
    // Afwas Theokot: elke groep voor zichzelf; Theokot en Logistiek zien alles
    // (zelfde regel als `canManageAfwas` in lib/theokotAfwas-server.ts).
    if (guard.afwas) {
      return (
        session.groups.length > 0 ||
        session.permissions.includes('theokot.manage') ||
        session.permissions.includes('logistiek.manage')
      );
    }
    if (guard.pocRep) return session.permissions.includes("pocs.manage") || pocRep;
    if (guard.mailGroups) return mailGroupsVisible;
    if (guard.posten) return postenVisible;
    if (guard.expenses) return expensesVisible;
    if (guard.anyPerm) return guard.anyPerm.some((p) => session.permissions.includes(p));
    if (guard.perm) return session.permissions.includes(guard.perm);
    return true;
  };

  const toItem = (leaf: NavLeaf): AdminNavItem => ({
    key: leaf.key,
    href: isExternalUrl(leaf.href) ? leaf.href : `${base}/admin${leaf.href}`,
    label: adminDict[leaf.key],
    exact: leaf.exact,
    hidden: leaf.hidden,
  });

  // Bouw de zichtbare nav. De volgorde staat vast in admin-nav.ts, ook
  // binnen een groep; er wordt hier niet meer gesorteerd. Iedereen krijgt
  // dezelfde balk: welke tabs je ziet hangt enkel van je rechten af, niet van
  // je post.
  const nodes: AdminNavNode[] = [];
  for (const entry of getAdminNav()) {
    if ("group" in entry) {
      const items = entry.items.filter(canSee).map(toItem);
      // Een groep waarvan je maar één item mag zien, is een klik om niets: toon
      // dat item dan gewoon als los item. Behalve bij een groep die bewust
      // groeit (Apps): die blijft staan, zodat het item niet van plaats wisselt.
      // Verborgen items tellen niet mee: die staan niet in de lijst. Ze gaan
      // wel mee in de nodes, voor het zoeken en de pins.
      const listed = items.filter((i) => !i.hidden);
      if (listed.length === 1 && !entry.keepSingle) {
        nodes.push({ type: "item", item: listed[0] });
        for (const hidden of items.filter((i) => i.hidden)) nodes.push({ type: "item", item: hidden });
      } else if (items.length > 0) {
        nodes.push({ type: "group", key: entry.group, label: adminDict[entry.group], items });
      }
    } else if (canSee(entry)) {
      nodes.push({ type: "item", item: toItem(entry) });
    }
  }
  return nodes;
}
