/**
 * Wie er echt een mail krijgt die naar een groep gaat: de groep recursief
 * uitgeklapt, tot op de postbussen.
 *
 * Een groep kan groepen als lid hebben, en die weer groepen. Google bezorgt
 * een mail één keer per postbus, hoe vaak die ook via verschillende groepen
 * bereikt wordt, dus de platte lijst ontdubbelt per adres en onthoudt het
 * eerste pad waarlangs hij er komt ("loko-av › loko › jan@vtk.be"). Een groep
 * die zichzelf (via een omweg) bevat, wordt één keer uitgeklapt; de tweede
 * keer staat ze als lus in de boom en gaan we niet verder.
 *
 * Bewust zonder Google erin: wie de leden van een groep ophaalt, wordt
 * meegegeven, zodat dit zonder netwerk te testen is.
 */

export type DirectoryMember = {
  email: string;
  /** USER, GROUP, CUSTOMER (iedereen in het domein) of EXTERNAL. */
  type: string;
  role?: string;
  status?: string;
};

export type RecipientNode = {
  email: string;
  type: string;
  role?: string;
  /** Een groep die hoger in dit pad al uitgeklapt werd: niet nog eens. */
  cycle?: boolean;
  /** Een groep die elders in de boom al uitgeklapt werd: hier niet herhaald. */
  repeated?: boolean;
  /** De leden van deze groep kon Google niet geven (geen rechten, verwijderd). */
  unreadable?: boolean;
  children?: RecipientNode[];
};

export type Mailbox = {
  email: string;
  /** USER, EXTERNAL of CUSTOMER. */
  type: string;
  /** De groepen langs waar de mail er komt, van buiten naar binnen. */
  via: string[];
};

export type Expansion = {
  root: RecipientNode;
  mailboxes: Mailbox[];
  /** Hoeveel groepen er uitgeklapt werden, de bovenste meegeteld. */
  groupCount: number;
  /** Hoe diep de diepste groep zit (0 = enkel de groep zelf). */
  depth: number;
  cycles: number;
};

/** Bovengrens op het aantal groepen: een dolgedraaide structuur mag het scherm niet ophouden. */
export const MAX_GROUPS = 300;

export async function expandRecipients(
  rootEmail: string,
  membersOf: (groupEmail: string) => Promise<DirectoryMember[] | null>,
): Promise<Expansion> {
  const expanded = new Set<string>();
  const mailboxes = new Map<string, Mailbox>();
  let depth = 0;
  let cycles = 0;

  async function visit(email: string, path: string[], level: number): Promise<RecipientNode> {
    const key = email.toLowerCase();
    const node: RecipientNode = { email, type: "GROUP" };
    if (path.some((step) => step.toLowerCase() === key)) {
      cycles += 1;
      return { ...node, cycle: true };
    }
    if (expanded.has(key)) return { ...node, repeated: true };
    if (expanded.size >= MAX_GROUPS) return { ...node, unreadable: true };
    expanded.add(key);
    depth = Math.max(depth, level);

    const members = await membersOf(email);
    if (members === null) return { ...node, unreadable: true };
    const here = [...path, email];
    const children: RecipientNode[] = [];
    // Eerst de postbussen, dan de groepen: zo staan de directe leden bovenaan
    // en krijgt een adres dat ook dieper zit, het kortste pad.
    const sorted = [...members].sort(
      (a, b) =>
        Number(a.type === "GROUP") - Number(b.type === "GROUP") || a.email.localeCompare(b.email),
    );
    for (const member of sorted.filter((m) => m.type !== "GROUP")) {
      children.push({ email: member.email, type: member.type, role: member.role });
      const memberKey = member.email.toLowerCase();
      if (!mailboxes.has(memberKey)) {
        mailboxes.set(memberKey, { email: member.email, type: member.type, via: here });
      }
    }
    for (const member of sorted.filter((m) => m.type === "GROUP")) {
      const child = await visit(member.email, here, level + 1);
      children.push({ ...child, role: member.role });
    }
    return { ...node, children };
  }

  const root = await visit(rootEmail, [], 0);
  return {
    root,
    mailboxes: [...mailboxes.values()].sort((a, b) => a.email.localeCompare(b.email)),
    groupCount: expanded.size,
    depth,
    cycles,
  };
}

/**
 * Maakt van wat iemand intikt een volledig adres: `loko-av` wordt
 * `loko-av@vtk.be`, hoofdletters en spaties vallen weg.
 */
export function normaliseAddress(input: string, domain: string): string {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed : `${trimmed}@${domain.toLowerCase()}`;
}
