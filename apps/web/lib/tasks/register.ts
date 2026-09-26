/**
 * Wie doet wat: het register van taken per post (/admin/wie-doet-wat).
 *
 * Puur en zonder databank, zodat zoeken en groeperen getest kunnen worden en de
 * client component het ter plekke kan herrekenen terwijl iemand typt. De
 * keuzes staan in docs/design-decisions.md ("Wie doet wat").
 */

export type RegisterMember = {
  membershipId: string;
  name: string;
  avatarUrl: string | null;
  lead: boolean;
};

export type RegisterPost = {
  id: string;
  name: string;
  /** Leden van de post in het getoonde werkingsjaar. */
  members: RegisterMember[];
  /** Mag de kijker de taken van deze post verdelen? */
  canEdit: boolean;
};

export type RegisterTask = {
  id: string;
  groupId: string;
  /** De post waarvoor deze taak het aanspreekpunt is ("IT-contact voor Theokot"). */
  forGroupId: string | null;
  name: string;
  description: string | null;
  keywords: string | null;
  /** Lidmaatschappen (van `groupId`, in het getoonde jaar) die de taak opnemen. */
  holders: string[];
  backup: string | null;
  /** Wie de taak het werkingsjaar ervoor opnam; enkel getoond zolang niemand ze nu heeft. */
  previous: string[];
};

export type RegisterSection = {
  post: RegisterPost;
  /** De taken van de post zelf. */
  own: RegisterTask[];
  /** Taken van een andere post die voor deze post bedoeld zijn. */
  linked: RegisterTask[];
  /** Taken van de post zelf zonder verantwoordelijke. */
  unassigned: number;
  /** Postleden die nog geen enkele taak van de post opnemen. */
  idle: RegisterMember[];
};

export type RegisterFilter = {
  query: string;
  /** Eén post tonen, of `null` voor allemaal. */
  postId: string | null;
  /** Enkel taken zonder verantwoordelijke. */
  onlyUnassigned: boolean;
};

/** Hoofdletter- en accentongevoelig, zoals de andere zoekvelden in de admin. */
export function normalizeTaskSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function isUnassigned(task: RegisterTask): boolean {
  return task.holders.length === 0;
}

/**
 * Elk woord van de zoekopdracht moet ergens staan: in de taak, haar
 * zoekwoorden, de post, de post waarvoor ze bedoeld is, of de naam van wie ze
 * opneemt. "theokot" vindt zo ook "IT-contact voor Theokot", en "hanne" alles
 * wat Hanne doet.
 */
export function taskMatches(
  task: RegisterTask,
  query: string,
  lookup: { postName: (id: string) => string; memberName: (membershipId: string) => string },
): boolean {
  const words = normalizeTaskSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeTaskSearch(
    [
      task.name,
      task.description ?? "",
      task.keywords ?? "",
      lookup.postName(task.groupId),
      task.forGroupId ? lookup.postName(task.forGroupId) : "",
      ...task.holders.map(lookup.memberName),
      task.backup ? lookup.memberName(task.backup) : "",
    ].join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

/**
 * Het register, per post in de volgorde van `posts`. Zonder zoekopdracht of
 * filter staat elke post erin, ook een zonder taken: dat is precies de post die
 * nog moet beginnen. Met een filter valt een post zonder treffers weg.
 */
export function buildRegister(
  posts: RegisterPost[],
  tasks: RegisterTask[],
  filter: RegisterFilter,
  locale: string = "nl",
): RegisterSection[] {
  const postNames = new Map(posts.map((post) => [post.id, post.name]));
  const memberNames = new Map(
    posts.flatMap((post) => post.members.map((member) => [member.membershipId, member.name] as const)),
  );
  const lookup = {
    postName: (id: string) => postNames.get(id) ?? "",
    memberName: (id: string) => memberNames.get(id) ?? "",
  };
  const byName = (a: RegisterTask, b: RegisterTask) => a.name.localeCompare(b.name, locale);
  const filtering = filter.query.trim() !== "" || filter.onlyUnassigned;
  const visible = (task: RegisterTask) =>
    (!filter.onlyUnassigned || isUnassigned(task)) && taskMatches(task, filter.query, lookup);

  const sections: RegisterSection[] = [];
  for (const post of posts) {
    if (filter.postId && filter.postId !== post.id) continue;
    const allOwn = tasks.filter((task) => task.groupId === post.id);
    const own = allOwn.filter(visible).sort(byName);
    const linked = tasks
      .filter((task) => task.forGroupId === post.id && task.groupId !== post.id)
      .filter(visible)
      .sort(byName);
    if (filtering && own.length === 0 && linked.length === 0) continue;

    const busy = new Set(allOwn.flatMap((task) => task.holders));
    sections.push({
      post,
      own,
      linked,
      unassigned: allOwn.filter(isUnassigned).length,
      idle: post.members.filter((member) => !busy.has(member.membershipId)),
    });
  }
  return sections;
}

/** Hoeveel taken, over alle posten heen, nog niemand hebben. */
export function countUnassigned(tasks: RegisterTask[], postId: string | null): number {
  return tasks.filter((task) => (!postId || task.groupId === postId) && isUnassigned(task)).length;
}
