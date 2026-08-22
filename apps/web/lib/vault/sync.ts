import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { logAudit } from "@/lib/audit";
import { type VaultConfig, getVaultConfig } from "./config";
import {
  MEMBER_STATUS,
  type VaultMember as RemoteMember,
  confirmMember,
  createCollection,
  createGroup,
  inviteMember,
  listCollections,
  listGroups,
  listMembers,
  memberPublicKey,
  removeMember,
  setGroupMembers,
} from "./client";
import { encryptString, rsaEncrypt } from "./crypto";

/**
 * Zet het lidmaatschap van de kluis gelijk met de posten van dit werkingsjaar.
 *
 * Zelfde stramien als de Brevo-koppeling (`lib/brevo/sync.ts`): een optionele
 * integratie achter een config-check, een best-effort push bij elke wijziging
 * die nooit gooit, en een reconciliatie als vangnet. Dat vangnet doet hier meer
 * werk dan bij Brevo, want de hele belofte van deze feature hangt eraan: omdat
 * `GroupMembership` per werkingsjaar staat en de resolver enkel het huidige jaar
 * telt, loopt élke groep op 15 juli vanzelf leeg en vult de eerste reconcile
 * daarna hem opnieuw. Er is geen cron die "het jaar omzet"; er is enkel dit.
 *
 * Twee regels die je niet mag omdraaien:
 *
 * - **Wij beheren enkel gewone leden** (`type === 2`). De eigenaar en de
 *   beheerders van de organisatie blijven met rust, want daar zit het botaccount
 *   zelf tussen: een sync die zichzelf uit de organisatie gooit, kan nadien niets
 *   meer rechtzetten.
 * - **Een uitgenodigd lid zonder sleutelpaar is een wachtstand, geen fout.** Het
 *   kan pas bevestigd worden nadat het één keer ingelogd heeft. De reconcile
 *   probeert het gewoon elke ronde opnieuw.
 */

export type SyncOutcome = { ok: boolean; skipped?: boolean; error?: string };

export type ReconcileOutcome =
  | { skipped: true }
  | {
      posts: number;
      members: number;
      invited: number;
      confirmed: number;
      removed: number;
      /** Uitgenodigd maar nog nooit ingelogd: wacht op de gebruiker, niet op ons. */
      pending: number;
      failed: number;
    };

/** Stabiele sleutel per post, zodat een hernoemde post zijn collection houdt. */
function externalId(groupId: string): string {
  return `post-${groupId}`;
}

function collectionName(nameNl: string): string {
  return `Post: ${nameNl}`;
}

type PostRow = {
  id: string;
  groupId: string;
  collectionId: string | null;
  vaultGroupId: string | null;
  group: { id: string; nameNl: string };
};

/**
 * Zorgt dat de post een collection en een groep heeft in de kluis, en dat de
 * groep toegang heeft tot die collection. Bestaande brokken worden hergebruikt
 * op `externalId`: dat overleeft een lege `VaultPost`-rij en voorkomt dat een
 * tweede sync een tweede collection aanmaakt naast de eerste.
 */
async function ensureStructure(
  cfg: VaultConfig,
  post: PostRow,
  remote: { collections: Awaited<ReturnType<typeof listCollections>>; groups: Awaited<ReturnType<typeof listGroups>> },
): Promise<{ collectionId: string; vaultGroupId: string }> {
  const ext = externalId(post.groupId);

  let collectionId =
    post.collectionId && remote.collections.some((c) => c.id === post.collectionId)
      ? post.collectionId
      : (remote.collections.find((c) => c.externalId === ext)?.id ?? null);

  if (!collectionId) {
    const created = await createCollection(
      cfg,
      encryptString(cfg.orgKey, collectionName(post.group.nameNl)),
      ext,
    );
    collectionId = created.id;
  }

  let vaultGroupId =
    post.vaultGroupId && remote.groups.some((g) => g.id === post.vaultGroupId)
      ? post.vaultGroupId
      : (remote.groups.find((g) => g.externalId === ext)?.id ?? null);

  if (!vaultGroupId) {
    const created = await createGroup(cfg, collectionName(post.group.nameNl), ext, collectionId);
    vaultGroupId = created.id;
  }

  if (collectionId !== post.collectionId || vaultGroupId !== post.vaultGroupId) {
    await prisma.vaultPost.update({
      where: { id: post.id },
      data: { collectionId, vaultGroupId },
    });
  }
  return { collectionId, vaultGroupId };
}

type DesiredUser = { id: string; email: string; name: string };

/** Wie er dit werkingsjaar in welke gekoppelde post zit. */
async function desiredMembership(
  posts: PostRow[],
): Promise<{ byPost: Map<string, DesiredUser[]>; all: Map<string, DesiredUser> }> {
  const year = currentWorkingYear();
  const memberships = await prisma.groupMembership.findMany({
    where: {
      year,
      groupId: { in: posts.map((p) => p.groupId) },
      // Een gedeactiveerd lid hoort nergens meer binnen te raken, ook niet als
      // het lidmaatschap van dit jaar nog in de tabel staat.
      user: { active: true },
    },
    select: { groupId: true, user: { select: { id: true, email: true, name: true } } },
  });

  const byPost = new Map<string, DesiredUser[]>();
  const all = new Map<string, DesiredUser>();
  for (const post of posts) byPost.set(post.groupId, []);
  for (const m of memberships) {
    const email = m.user.email?.trim().toLowerCase();
    // Zonder universitair adres kunnen we niemand uitnodigen: dat adres is de
    // sleutel waarop de kluis en onze SSO elkaar herkennen.
    if (!email) continue;
    const user = { id: m.user.id, email, name: m.user.name };
    byPost.get(m.groupId)?.push(user);
    all.set(user.id, user);
  }
  return { byPost, all };
}

/**
 * Nodigt uit wie nog geen lidmaatschap heeft, en bevestigt wie ingelogd is.
 * Geeft terug welk VTK-lid met welk organisatielidmaatschap overeenkomt.
 */
async function ensureMembers(
  cfg: VaultConfig,
  desired: Map<string, DesiredUser>,
  remote: RemoteMember[],
  counters: { invited: number; confirmed: number; pending: number; failed: number },
): Promise<Map<string, string>> {
  const byEmail = new Map(remote.map((m) => [m.email, m]));
  const memberIdByUser = new Map<string, string>();

  for (const user of desired.values()) {
    const member = byEmail.get(user.email);
    try {
      if (!member) {
        await inviteMember(cfg, user.email);
        counters.invited += 1;
        await prisma.vaultMember.upsert({
          where: { userId: user.id },
          create: { userId: user.id, status: "INVITED", invitedAt: new Date(), lastError: null },
          update: { status: "INVITED", invitedAt: new Date(), lastError: null },
        });
        await logAudit({
          action: "grant",
          entity: "vaultAccess",
          entityId: user.id,
          target: user.name,
          summary: `Uitgenodigd voor de wachtwoordkluis (${user.email})`,
        });
        // Het lidmaatschap bestaat nu wel, maar we kennen de id pas de volgende
        // ronde. Dat is geen probleem: het lid kan toch nog niets lezen tot het
        // ingelogd en bevestigd is.
        counters.pending += 1;
        continue;
      }

      memberIdByUser.set(user.id, member.id);

      if (member.status === MEMBER_STATUS.accepted && member.userId) {
        const publicKey = await memberPublicKey(cfg, member.userId);
        await confirmMember(cfg, member.id, rsaEncrypt(publicKey, cfg.orgKey));
        counters.confirmed += 1;
        await prisma.vaultMember.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            memberId: member.id,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
          update: { memberId: member.id, status: "CONFIRMED", confirmedAt: new Date(), lastError: null },
        });
        await logAudit({
          action: "grant",
          entity: "vaultAccess",
          entityId: user.id,
          target: user.name,
          summary: "Bevestigd in de wachtwoordkluis",
        });
      } else {
        if (member.status === MEMBER_STATUS.invited) counters.pending += 1;
        await prisma.vaultMember.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            memberId: member.id,
            status: member.status === MEMBER_STATUS.confirmed ? "CONFIRMED" : "INVITED",
          },
          update: {
            memberId: member.id,
            status: member.status === MEMBER_STATUS.confirmed ? "CONFIRMED" : "INVITED",
            lastError: null,
          },
        });
      }
    } catch (err) {
      counters.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await prisma.vaultMember
        .upsert({
          where: { userId: user.id },
          create: { userId: user.id, status: "INVITED", lastError: message },
          update: { lastError: message },
        })
        .catch(() => {});
    }
  }

  return memberIdByUser;
}

/**
 * Haalt wie geen gekoppelde post meer heeft uit de organisatie. Dat is wat
 * "toegang weg" betekent: elk gedeeld wachtwoord verdwijnt bij hen. Het
 * Vaultwarden-account blijft bestaan, want daar hangt ook hun persoonlijke kluis
 * aan en die is van hen, niet van VTK.
 */
async function removeStrays(
  cfg: VaultConfig,
  desired: Map<string, DesiredUser>,
  remote: RemoteMember[],
  counters: { removed: number; failed: number },
): Promise<void> {
  const wanted = new Set([...desired.values()].map((u) => u.email));
  for (const member of remote) {
    // Enkel gewone leden; het botaccount is eigenaar en moet blijven.
    if (member.type !== 2) continue;
    if (wanted.has(member.email)) continue;
    try {
      await removeMember(cfg, member.id);
      counters.removed += 1;
      const row = await prisma.vaultMember.findFirst({ where: { memberId: member.id } });
      if (row) await prisma.vaultMember.delete({ where: { id: row.id } });
      await logAudit({
        action: "revoke",
        entity: "vaultAccess",
        target: member.email,
        summary: "Uit de wachtwoordkluis gehaald: geen gekoppelde post meer",
      });
    } catch {
      counters.failed += 1;
    }
  }
}

/**
 * Het vangnet: herbereken alles uit de database en zet het in de kluis recht.
 * Bedoeld voor de worker (`/api/vault/maintenance`) en voor de knop "Nu
 * synchroniseren" in de admin.
 */
export async function reconcileVault(): Promise<ReconcileOutcome> {
  const cfg = await getVaultConfig();
  if (!cfg) return { skipped: true };

  const posts = (await prisma.vaultPost.findMany({
    where: { enabled: true },
    select: {
      id: true,
      groupId: true,
      collectionId: true,
      vaultGroupId: true,
      group: { select: { id: true, nameNl: true } },
    },
  })) as PostRow[];

  const counters = { invited: 0, confirmed: 0, removed: 0, pending: 0, failed: 0 };
  const [collections, groups, remoteMembers] = await Promise.all([
    listCollections(cfg),
    listGroups(cfg),
    listMembers(cfg),
  ]);

  const { byPost, all } = await desiredMembership(posts);
  const memberIdByUser = await ensureMembers(cfg, all, remoteMembers, counters);

  for (const post of posts) {
    try {
      const { vaultGroupId } = await ensureStructure(cfg, post, { collections, groups });
      const ids = (byPost.get(post.groupId) ?? [])
        .map((u) => memberIdByUser.get(u.id))
        .filter((id): id is string => Boolean(id));
      await setGroupMembers(cfg, vaultGroupId, ids);
      await prisma.vaultPost.update({
        where: { id: post.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
    } catch (err) {
      // Eén stukke post mag de andere niet tegenhouden; de route rapporteert het.
      counters.failed += 1;
      await prisma.vaultPost
        .update({
          where: { id: post.id },
          data: { lastError: err instanceof Error ? err.message : String(err) },
        })
        .catch(() => {});
    }
  }

  await removeStrays(cfg, all, remoteMembers, counters);

  return { posts: posts.length, members: all.size, ...counters };
}

/**
 * Best-effort push vanuit de schermen die lidmaatschap wijzigen. Gooit nooit:
 * een hapering bij de kluis mag het opslaan van een post niet breken, en de
 * worker zet het binnen vijf minuten recht.
 *
 * Bewust zonder `userId`-parameter, hoewel de aanroeper er meestal één heeft:
 * wie uit één post verdwijnt, moet ook uit díe groep verdwijnen, en een push die
 * enkel naar dat ene lid kijkt, laat toegang staan die weg had moeten zijn. Dus
 * gewoon de volledige reconcile; die is klein genoeg (een handvol API-calls per
 * post) om ze niet te willen optimaliseren tot ze fout is.
 */
export async function pushVaultMembership(): Promise<SyncOutcome> {
  const cfg = await getVaultConfig();
  if (!cfg) return { ok: true, skipped: true };
  try {
    const result = await reconcileVault();
    if ("skipped" in result) return { ok: true, skipped: true };
    return { ok: result.failed === 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
