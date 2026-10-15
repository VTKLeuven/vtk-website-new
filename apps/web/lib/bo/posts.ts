import { normalizeKey } from "./names";

/*
 * Welke post(en) bij een naam in een bestand horen. Puur, zodat de regels
 * getest kunnen worden; de aliassen komen uit `BoPostAlias`.
 *
 * Een "post" voor het BO is ruimer dan een `Group`:
 *
 * - elke post en werkgroep (sleutel `g:<groupId>`);
 * - de vier rollen van Groep 5, die elk hun eigen budgetten indienen: Praeses,
 *   Vice-praeses, Secretaris en Beheer;
 * - Jaarwerkingen (Halftime, Studentenwelkom) en Overige, voor wat niet bij
 *   één post hoort.
 *
 * Die laatste zes staan hier in code en niet in de databank: het zijn vaste
 * vakken van het overzicht, geen posten met leden. Zie docs/design-decisions.md
 * ("Bestuursorgaan: posten, rollen en categorieën").
 */

export type ExtraPost = {
  key: `x:${string}`;
  nameNl: string;
  nameEn: string;
  /** Schrijfwijzen die vanzelf bij dit vak horen, genormaliseerd. */
  aliases: string[];
  section: "g5" | "extra";
  /**
   * Voor een verzamelvak: zet de naam uit het bestand voor de activiteit
   * ("Halftime GoGlobal"), anders weet niemand meer waarover het ging.
   */
  prefixActivity?: boolean;
};

export const BO_EXTRA_POSTS: readonly ExtraPost[] = [
  { key: "x:praeses", nameNl: "Praeses", nameEn: "President", aliases: ["praeses", "preses"], section: "g5" },
  { key: "x:vice", nameNl: "Vice-praeses", nameEn: "Vice-president", aliases: ["vice", "vicepraeses", "vicepreses", "vp"], section: "g5" },
  { key: "x:secretaris", nameNl: "Secretaris", nameEn: "Secretary", aliases: ["secretaris", "secretariaat", "secr"], section: "g5" },
  { key: "x:beheer", nameNl: "Beheer", nameEn: "Finance", aliases: ["beheer", "penning", "penningmeester"], section: "g5" },
  {
    key: "x:jaarwerkingen",
    nameNl: "Jaarwerkingen",
    nameEn: "Yearly events",
    aliases: ["jaarwerkingen", "jaarwerking", "halftime", "studentenwelkom"],
    section: "extra",
    prefixActivity: true,
  },
  { key: "x:overige", nameNl: "Overige", nameEn: "Other", aliases: ["overige", "overig", "varia"], section: "extra", prefixActivity: true },
];

export const EXTRA_POST_KEYS = new Set<string>(BO_EXTRA_POSTS.map((p) => p.key));

export type PostCandidate = {
  id: string;
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
};

/** Een schrijfwijze die Groep 5 met de hand aan een of meer posten hing. */
export type PostAliases = ReadonlyMap<string, readonly string[]>;

/** Korter dan dit is te vaag om als afkorting te gelden ("IT" moet exact). */
const MIN_PREFIX = 3;

type Target = { key: string; names: string[]; extra?: ExtraPost };

function targetsOf(posts: readonly PostCandidate[]): Target[] {
  return [
    // De vakken eerst: "Beheer" is de rol in Groep 5, ook als er ooit een post
    // met die naam bestaat.
    ...BO_EXTRA_POSTS.map((extra) => ({
      key: extra.key,
      names: [...extra.aliases, normalizeKey(extra.nameNl), normalizeKey(extra.nameEn)],
      extra,
    })),
    ...posts.map((post) => ({
      key: `g:${post.id}`,
      names: [post.code, post.slug, post.nameNl, post.nameEn].map(normalizeKey).filter(Boolean),
    })),
  ];
}

function resolveOne(key: string, targets: readonly Target[], aliases: PostAliases, valid: ReadonlySet<string>): string[] {
  if (!key || !/[a-z]/.test(key)) return [];
  const alias = aliases.get(key)?.filter((k) => valid.has(k));
  if (alias && alias.length > 0) return [...alias];

  const exact = targets.filter((t) => t.names.includes(key));
  if (exact.length > 0) {
    // Een vak en een post met dezelfde naam: het vak wint (het staat eerst).
    return exact[0].extra || exact.length === 1 ? [exact[0].key] : [];
  }
  if (key.length < MIN_PREFIX) return [];
  const prefixed = targets.filter((t) => t.names.some((name) => name.startsWith(key)));
  return prefixed.length === 1 ? [prefixed[0].key] : [];
}

/**
 * De posten bij een schrijfwijze, of een lege lijst wanneer de site het niet
 * weet. Volgorde: een alias van Groep 5 wint altijd, dan een exacte naam, code,
 * slug of vaste schrijfwijze, dan een afkorting die van precies één post het
 * begin is ("Acti" is Activiteiten). "Cultuur+Onthaal" is twee posten, maar
 * enkel als beide herkend worden.
 */
export function resolvePostKeys(label: string, posts: readonly PostCandidate[], aliases: PostAliases): string[] {
  const targets = targetsOf(posts);
  const valid = new Set(targets.map((t) => t.key));
  const whole = resolveOne(normalizeKey(label), targets, aliases, valid);
  if (whole.length > 0) return whole;

  const parts = label.split(/\s*(?:\+|&|\/|,|\sen\s)\s*/i).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((part) => resolveOne(normalizeKey(part), targets, aliases, valid));
    if (each.every((keys) => keys.length > 0)) return [...new Set(each.flat())];
  }
  return [];
}

/** Voor de tests en de bestaande aanroepers: één post, of null. */
export function resolvePost(label: string, posts: readonly PostCandidate[], aliases: PostAliases): string | null {
  const keys = resolvePostKeys(label, posts, aliases);
  return keys.length === 1 && keys[0].startsWith("g:") ? keys[0].slice(2) : null;
}

export type SplitPost = {
  /** De post zoals ze in de naam stond. */
  label: string;
  postKeys: string[];
  activity: string | null;
};

/**
 * Post en activiteit uit de stukken van een naam. Staat er een spatie of een
 * streepje waar een underscore hoorde ("Sport VTKlimmen", "Statix-Talks"), dan
 * is het eerste woord de post zodra dat woord een post is, en schuift de rest
 * naar de activiteit.
 */
export function splitPost(
  post: string,
  activity: string | null,
  posts: readonly PostCandidate[],
  aliases: PostAliases,
): SplitPost {
  const withPrefix = (label: string, keys: string[], rest: string | null): SplitPost => {
    const extra = keys.length === 1 ? BO_EXTRA_POSTS.find((p) => p.key === keys[0]) : undefined;
    const own = extra ? [normalizeKey(extra.nameNl), normalizeKey(extra.nameEn), extra.aliases[0]] : [];
    const prefixed = extra?.prefixActivity && !own.includes(normalizeKey(label));
    return { label, postKeys: keys, activity: prefixed ? [label, rest].filter(Boolean).join(" ") : rest };
  };

  const whole = resolvePostKeys(post, posts, aliases);
  if (whole.length > 0) return withPrefix(post, whole, activity);

  const words = post.split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) {
    const first = resolvePostKeys(words[0], posts, aliases);
    if (first.length > 0) {
      const restOfPost = words.slice(1).join(" ");
      return withPrefix(words[0], first, activity ? `${restOfPost} ${activity}` : restOfPost);
    }
  }
  return { label: post, postKeys: [], activity };
}

/** De naam van een post of vak, voor het scherm. Onbekende sleutels geven null. */
export function postName(key: string, posts: readonly PostCandidate[], nl: boolean): string | null {
  const extra = BO_EXTRA_POSTS.find((p) => p.key === key);
  if (extra) return nl ? extra.nameNl : extra.nameEn;
  const post = key.startsWith("g:") ? posts.find((p) => p.id === key.slice(2)) : undefined;
  return post ? (nl ? post.nameNl : post.nameEn) : null;
}

/** Alle posten en vakken waaruit Groep 5 kan kiezen, met hun sleutel. */
export function postOptions(
  posts: readonly (PostCandidate & { type?: string; active?: boolean; orderInPraesidium?: number })[],
  nl: boolean,
): { key: string; name: string; group: string }[] {
  const g5 = posts.find((p) => p.code === "GROEP5");
  return [
    ...(g5 ? [{ key: `g:${g5.id}`, name: nl ? g5.nameNl : g5.nameEn, group: "Groep 5" }] : []),
    ...BO_EXTRA_POSTS.filter((p) => p.section === "g5").map((p) => ({ key: p.key, name: nl ? p.nameNl : p.nameEn, group: "Groep 5" })),
    ...posts
      .filter((p) => p.code !== "GROEP5" && p.type !== "WERKGROEP" && p.active !== false)
      .map((p) => ({ key: `g:${p.id}`, name: nl ? p.nameNl : p.nameEn, group: nl ? "Posten" : "Posts" })),
    ...posts
      .filter((p) => p.type === "WERKGROEP" && p.active !== false)
      .map((p) => ({ key: `g:${p.id}`, name: nl ? p.nameNl : p.nameEn, group: nl ? "Werkgroepen" : "Working groups" })),
    ...BO_EXTRA_POSTS.filter((p) => p.section === "extra").map((p) => ({
      key: p.key,
      name: nl ? p.nameNl : p.nameEn,
      group: nl ? "Jaarwerkingen en overige" : "Yearly events and other",
    })),
  ];
}
