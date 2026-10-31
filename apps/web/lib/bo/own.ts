import { statsOf, type Stats } from "./dossiers";
import type { ExplorerData, XDossier } from "./explorer";
import { BO_EXTRA_POSTS, postName, type PostCandidate } from "./posts";

/*
 * Wat een post zelf van het BO ziet: haar eigen budgetten en resultaten, en
 * welke resultaten ze nog moet brengen. Op /admin/bestuursorgaan/mijn alles,
 * op het dashboard enkel wat open staat.
 *
 * Het volledige overzicht blijft van Groep 5 (`bestuursorgaan.manage`). Dit
 * volgt het lidmaatschap van dit werkingsjaar, zonder apart recht: wie in een
 * post of werkgroep zit, ziet wat die post langs het BO bracht, en niets van
 * een andere post. Zie docs/design-decisions.md ("Bestuursorgaan: de post
 * ziet haar eigen budgetten").
 *
 * Puur, zodat de regels getest kunnen worden; de sessie en het overzicht komen
 * binnen.
 */

export type OwnGroup = PostCandidate;

export type OwnPost = {
  key: string;
  name: string;
  stats: Stats;
  dossiers: XDossier[];
};

const G5_KEYS = BO_EXTRA_POSTS.filter((p) => p.section === "g5").map((p) => p.key);

/**
 * De posten van één lid: elke post en werkgroep waarvan hij dit werkingsjaar
 * lid is. Wie in Groep 5 zit, krijgt er de vier vakken van Groep 5 bij
 * (Praeses, Vice-praeses, Secretaris, Beheer): daar dienen ze hun eigen
 * budgetten onder in.
 */
export function ownPostKeys(groups: readonly Pick<OwnGroup, "id" | "code">[]): string[] {
  const keys = groups.map((group) => `g:${group.id}`);
  if (groups.some((group) => group.code === "GROEP5")) keys.push(...G5_KEYS);
  return [...new Set(keys)];
}

const STATUS_ORDER: Record<XDossier["status"], number> = { OPEN: 0, UPCOMING: 1, NO_BUDGET: 2, DONE: 3 };

/**
 * Eerst wat nog moet komen, het langst open bovenaan (een schriftelijke
 * goedkeuring zonder BO-datum onderaan die groep); dan wat nog op een BO moet
 * passeren, het eerst; dan de rest, het laatst eerst.
 */
export function ownOrder(a: XDossier, b: XDossier): number {
  const byDate =
    a.status === "UPCOMING" ? (a.date ?? "").localeCompare(b.date ?? "") : (b.date ?? "").localeCompare(a.date ?? "");
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    (a.status === "OPEN" ? (b.overdueDays ?? -1) - (a.overdueDays ?? -1) : 0) ||
    byDate ||
    a.activity.localeCompare(b.activity, "nl")
  );
}

/**
 * De posten van één lid met hun activiteiten, in de volgorde van het
 * overzicht. Enkel de activiteiten van die posten gaan mee: dit belandt in de
 * browser van iemand zonder recht op de rest.
 *
 * Een post of werkgroep zonder één budget staat er ook, leeg: "nog niets" is
 * voor die post ook een antwoord. Een vak van Groep 5 enkel wanneer er iets in
 * zit, anders staan er vier lege blokken voor één persoon.
 */
export function ownPosts(data: ExplorerData, keys: readonly string[], groups: readonly OwnGroup[], nl: boolean): OwnPost[] {
  const order = new Map(data.posts.map((post, index) => [post.key, index]));
  return keys
    .map((key) => {
      const dossiers = data.dossiers.filter((d) => d.postKeys.includes(key)).sort(ownOrder);
      const name = data.posts.find((post) => post.key === key)?.name ?? postName(key, groups, nl) ?? key;
      return { key, name, stats: statsOf(dossiers), dossiers };
    })
    .filter((post) => post.dossiers.length > 0 || post.key.startsWith("g:"))
    .sort((a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Moet de activiteit zelf nog plaatsvinden? Op de datum uit het rekenblad
 * (`eventDate`), en vandaag telt nog als "nog bezig". Zonder datum weten we het
 * niet, en dan geldt de BO-datum zoals overal.
 */
export function activityStillToCome(dossier: Pick<XDossier, "eventDate">, today: string): boolean {
  return dossier.eventDate !== null && dossier.eventDate >= today;
}

/**
 * Voor het dashboard: per post enkel de resultaten die nog moeten komen, en
 * enkel de posten waar dat er zijn.
 *
 * Een budget passeert het BO vóór de activiteit, dus een activiteit in december
 * stond hier al vanaf de BO van september als "open". Een resultaat kan pas na
 * de activiteit, dus de herinnering wacht tot de dag erna. Enkel deze
 * herinnering: status, "open sinds" en de tellingen blijven op de BO-datum (zie
 * `Dossier.date` en docs/design-decisions.md).
 *
 * `today` is `yyyy-mm-dd` op de Brusselse klok.
 */
export function openResults(posts: readonly OwnPost[], today: string): OwnPost[] {
  return posts
    .map((post) => ({
      ...post,
      dossiers: post.dossiers.filter((d) => d.status === "OPEN" && !activityStillToCome(d, today)),
    }))
    .filter((post) => post.dossiers.length > 0);
}
