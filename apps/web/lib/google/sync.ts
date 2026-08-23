import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { logAudit } from "@/lib/audit";
import { type GoogleConfig, getGoogleConfig } from "./config";
import {
  type GoogleGroupSettings,
  addMember,
  createGroup,
  getGroup,
  getGroupSettings,
  listMembers,
  patchGroupSettings,
  removeMember,
} from "./client";
import { type MembershipRow, desiredMembers, normaliseEmail } from "./members";

/**
 * Zet de groepsadressen in Google Workspace gelijk met de posten van dit
 * werkingsjaar.
 *
 * Zelfde stramien als de wachtwoordkluis (`lib/vault/sync.ts`): een optionele
 * integratie achter een config-check, een best-effort push bij elke wijziging
 * die nooit gooit, en een reconciliatie als vangnet. Net als daar draagt dat
 * vangnet de hele belofte: omdat `GroupMembership` per werkingsjaar staat en we
 * enkel het huidige jaar tellen, loopt elke postgebonden lijst op 15 juli
 * vanzelf leeg en vult de eerste reconcile daarna hem met het nieuwe
 * praesidium. Er is geen cron die "het jaar omzet"; er is enkel dit.
 *
 * Drie regels die je niet mag omdraaien (zie docs/design-decisions.md):
 *
 * - **Enkel gekoppelde groepen.** Een Google-groep zonder `MailGroup`-rij wordt
 *   niet gelezen en niet aangeraakt, zodat IT lijsten met de hand kan blijven
 *   beheren zonder dat wij ze leegmaken.
 * - **Enkel gewone leden.** `OWNER` en `MANAGER` blijven staan, ook als ze niet
 *   in onze berekening zitten. Daar zit het botaccount tussen, en een sync die
 *   zichzelf uit de groep gooit kan nadien niets meer rechtzetten.
 * - **Nooit een groep verwijderen.** Aan een groepsadres hangt het archief, en
 *   het staat op affiches en in mailhandtekeningen.
 */

export type ReconcileOutcome =
  | { skipped: true }
  | {
      groups: number;
      added: number;
      removed: number;
      /** Leden die in een lijst horen maar nog geen gekoppeld @vtk.be-adres hebben. */
      unlinked: number;
      failed: number;
    };

type MailGroupRow = {
  id: string;
  email: string;
  name: string;
  description: string | null;
  googleId: string | null;
  allowExternalSenders: boolean;
  sources: { groupId: string; onlyLead: boolean }[];
  extras: { email: string; kind: "INCLUDE" | "EXCLUDE" }[];
};

const SELECT = {
  id: true,
  email: true,
  name: true,
  description: true,
  googleId: true,
  allowExternalSenders: true,
  sources: { select: { groupId: true, onlyLead: true } },
  extras: { select: { email: true, kind: true } },
} as const;

/**
 * Zorgt dat de groep in Google bestaat en geeft de sleutel terug waarmee we
 * haar aanspreken. Hergebruikt op `googleId` en anders op het adres: dat
 * overleeft een leeggelopen `googleId`-kolom en voorkomt dat een tweede sync
 * naast een bestaande groep een tweede aanmaakt.
 */
async function ensureGroup(cfg: GoogleConfig, row: MailGroupRow): Promise<string> {
  const existing = await getGroup(cfg, row.googleId ?? row.email);
  if (existing) {
    if (existing.id !== row.googleId) {
      await prisma.mailGroup.update({ where: { id: row.id }, data: { googleId: existing.id } });
    }
    return existing.id;
  }

  const created = await createGroup(cfg, {
    email: row.email,
    name: row.name,
    description: row.description ?? undefined,
  });
  await prisma.mailGroup.update({ where: { id: row.id }, data: { googleId: created.id } });
  await logAudit({
    action: "create",
    entity: "mailGroup",
    entityId: row.id,
    target: row.email,
    summary: "Groep aangemaakt in Google Workspace",
  });
  return created.id;
}

/**
 * Zet wie er naar dit adres mag mailen.
 *
 * Dit is de stille faalmodus van de hele koppeling: met Google's defaults kan
 * mail van een bedrijf naar `activiteiten@vtk.be` geweigerd worden of in een
 * moderatiewachtrij belanden die niemand leest. `allowExternalMembers` staat
 * altijd aan omdat een lijst een extern adres als extra kan bevatten.
 *
 * De spam-moderatie raken we bewust niet aan: dat is een afweging die iemand
 * met een gezicht hoort te maken, niet een sync.
 */
async function ensureSettings(cfg: GoogleConfig, row: MailGroupRow): Promise<void> {
  const wanted: GoogleGroupSettings = {
    whoCanPostMessage: row.allowExternalSenders ? "ANYONE_CAN_POST" : "ALL_IN_DOMAIN_CAN_POST",
    allowExternalMembers: "true",
  };
  const current = await getGroupSettings(cfg, row.email);
  if (
    current &&
    current.whoCanPostMessage === wanted.whoCanPostMessage &&
    current.allowExternalMembers === wanted.allowExternalMembers
  ) {
    return;
  }
  await patchGroupSettings(cfg, row.email, wanted);
}

/** Alle lidmaatschappen die de opgegeven lijsten samen nodig hebben, in één query. */
async function loadMemberships(rows: MailGroupRow[]): Promise<MembershipRow[]> {
  const groupIds = [...new Set(rows.flatMap((r) => r.sources.map((s) => s.groupId)))];
  if (groupIds.length === 0) return [];

  const memberships = await prisma.groupMembership.findMany({
    where: {
      year: currentWorkingYear(),
      groupId: { in: groupIds },
      // Een gedeactiveerd of gewist account hoort in geen enkele lijst meer,
      // ook niet wanneer het lidmaatschap van dit jaar nog in de tabel staat.
      user: { active: true, deletedAt: null },
    },
    select: {
      groupId: true,
      role: true,
      user: { select: { id: true, name: true, googleEmail: true } },
    },
  });

  return memberships.map((m) => ({
    groupId: m.groupId,
    role: m.role,
    user: m.user,
  }));
}

type Counters = { added: number; removed: number; unlinked: number; failed: number };

async function syncOne(
  cfg: GoogleConfig,
  row: MailGroupRow,
  memberships: MembershipRow[],
  counters: Counters,
): Promise<void> {
  try {
    const key = await ensureGroup(cfg, row);
    await ensureSettings(cfg, row);

    const desired = desiredMembers({
      sources: row.sources,
      memberships,
      extras: row.extras,
    });
    counters.unlinked += desired.unlinked.length;

    const remote = await listMembers(cfg, key);
    const remoteByEmail = new Map(remote.map((m) => [normaliseEmail(m.email), m]));
    const wanted = new Set(desired.emails);

    let added = 0;
    for (const email of desired.emails) {
      if (remoteByEmail.has(email)) continue;
      await addMember(cfg, key, email);
      added += 1;
    }

    let removed = 0;
    for (const member of remote) {
      // Enkel gewone leden: de eigenaar en de beheerders van de groep blijven.
      if (member.role !== "MEMBER") continue;
      if (wanted.has(normaliseEmail(member.email))) continue;
      await removeMember(cfg, key, member.id || member.email);
      removed += 1;
    }

    counters.added += added;
    counters.removed += removed;

    await prisma.mailGroup.update({
      where: { id: row.id },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        lastMemberCount: desired.emails.length,
      },
    });

    // Per lijst één regel, en enkel wanneer er effectief iets veranderde: een
    // logboek dat elke ronde vijftien "niets gewijzigd"-regels schrijft, is een
    // logboek dat niemand nog openslaat.
    if (added > 0 || removed > 0) {
      await logAudit({
        action: "sync",
        entity: "mailGroup",
        entityId: row.id,
        target: row.email,
        summary: `${added} toegevoegd, ${removed} verwijderd (${desired.emails.length} leden)`,
      });
    }
  } catch (err) {
    counters.failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    await prisma.mailGroup
      .update({ where: { id: row.id }, data: { lastError: message } })
      .catch(() => {});
  }
}

/**
 * Het vangnet: herbereken alles uit de database en zet het in Google recht.
 * Bedoeld voor de worker (`/api/google/maintenance`) en voor de knop "Nu
 * synchroniseren" in de admin.
 */
export async function reconcileMailGroups(): Promise<ReconcileOutcome> {
  const cfg = await getGoogleConfig();
  if (!cfg) return { skipped: true };

  const rows = (await prisma.mailGroup.findMany({
    where: { enabled: true },
    select: SELECT,
    orderBy: { email: "asc" },
  })) as MailGroupRow[];
  if (rows.length === 0) {
    return { groups: 0, added: 0, removed: 0, unlinked: 0, failed: 0 };
  }

  const memberships = await loadMemberships(rows);
  const counters: Counters = { added: 0, removed: 0, unlinked: 0, failed: 0 };
  for (const row of rows) {
    await syncOne(cfg, row, memberships, counters);
  }

  return { groups: rows.length, ...counters };
}

/**
 * Best-effort push na een wijziging aan één post: enkel de lijsten die deze
 * post als bron hebben. Gooit nooit; een hapering bij Google mag het opslaan
 * van een lidmaatschap niet breken, want de reconcile haalt het toch weer in.
 *
 * Roep dit aan in `after()`, niet in de request zelf: anders wacht wie een lid
 * toevoegt op een round-trip naar Google.
 */
export async function pushMailGroupsForGroup(groupId: string): Promise<void> {
  try {
    const cfg = await getGoogleConfig();
    if (!cfg) return;

    const rows = (await prisma.mailGroup.findMany({
      where: { enabled: true, sources: { some: { groupId } } },
      select: SELECT,
    })) as MailGroupRow[];
    if (rows.length === 0) return;

    const memberships = await loadMemberships(rows);
    const counters: Counters = { added: 0, removed: 0, unlinked: 0, failed: 0 };
    for (const row of rows) {
      await syncOne(cfg, row, memberships, counters);
    }
  } catch (err) {
    console.error("[google] push na postwijziging mislukt", err);
  }
}
