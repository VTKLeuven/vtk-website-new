import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { logAudit } from "@/lib/audit";
import { type GoogleConfig, getGoogleConfig } from "./config";
import {
  type GoogleGroupSettings,
  addMember,
  createGroup,
  deleteSendAs,
  getGroup,
  getGroupSettings,
  listMembers,
  patchGroupSettings,
  removeAlias,
  removeMember,
} from "./client";
import { memberAddress, normaliseEmail } from "./members";
import { planTwoWay } from "./twoWay";
import { type AccountState, applyAccountState, desiredAccountState } from "./accountState";
import { renderAddress, yearVars } from "./addresses";
import {
  type DesiredContext,
  type MailGroupForSync,
  MAIL_GROUP_SELECT,
  desiredFor,
  isArchivedYear,
  loadDesiredContext,
} from "./desired";

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
      /** Accounts waarvan de staat (beperkt/volwaardig/geschorst) aangepast werd. */
      accountsChanged: number;
      /** Deelstappen die niet lukten, bv. een Gmail-instelling zonder scope. */
      accountWarnings: string[];
    };

type MailGroupRow = MailGroupForSync & { syncedMembers: string[]; syncBaselineAt: Date | null };
const SELECT = { ...MAIL_GROUP_SELECT, syncedMembers: true, syncBaselineAt: true } as const;

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
 * De toegangsinstellingen die VTK voor elke groep wil (Toegangsinstellingen in
 * de Admin console):
 *
 * | Wie kan...                      | eigenaars | beheerders | leden | organisatie | extern |
 * | ------------------------------- | --------- | ---------- | ----- | ----------- | ------ |
 * | contact opnemen met eigenaars   | ja        | ja         | ja    | ja          | ja     |
 * | gesprekken bekijken             | ja        | ja         | ja    |             |        |
 * | posten                          | ja        | ja         | ja    | ja          | ja     |
 * | leden bekijken                  | ja        | ja         | ja    |             |        |
 * | leden beheren                   | ja        | ja         |       |             |        |
 *
 * plus externe leden toegelaten, omdat een lijst een extern adres kan bevatten.
 * "Posten" volgt het vinkje `allowExternalSenders`: uit = enkel de organisatie.
 *
 * Exported voor de test, zodat deze tabel en de code niet uit elkaar lopen.
 */
export function wantedGroupSettings(row: { allowExternalSenders: boolean }): GoogleGroupSettings {
  return {
    whoCanContactOwner: "ANYONE_CAN_CONTACT",
    whoCanViewGroup: "ALL_MEMBERS_CAN_VIEW",
    whoCanPostMessage: row.allowExternalSenders ? "ANYONE_CAN_POST" : "ALL_IN_DOMAIN_CAN_POST",
    whoCanViewMembership: "ALL_MEMBERS_CAN_VIEW",
    whoCanModerateMembers: "OWNERS_AND_MANAGERS",
    allowExternalMembers: "true",
  };
}

/**
 * Zet de toegangsinstellingen.
 *
 * Dit is de stille faalmodus van de hele koppeling: met Google's defaults kan
 * mail van een bedrijf naar `activiteiten@vtk.be` geweigerd worden of in een
 * moderatiewachtrij belanden die niemand leest.
 *
 * De spam-moderatie raken we bewust niet aan: dat is een afweging die iemand
 * met een gezicht hoort te maken, niet een sync.
 */
async function ensureSettings(cfg: GoogleConfig, row: MailGroupRow): Promise<void> {
  const wanted = wantedGroupSettings(row);
  const current = await getGroupSettings(cfg, row.email);
  const differs =
    !current ||
    (Object.keys(wanted) as (keyof GoogleGroupSettings)[]).some((key) => current[key] !== wanted[key]);
  if (!differs) return;
  await patchGroupSettings(cfg, row.email, wanted);
}

/** De notitie op een los lid dat in Google toegevoegd en door de site overgenomen werd. */
export const ADDED_IN_GOOGLE_NOTE = "toegevoegd in Google";
/** De notitie op een uitsluiting voor iemand die in Google verwijderd werd. */
export const REMOVED_IN_GOOGLE_NOTE = "verwijderd in Google";

/**
 * Zet in de regel op de site wat iemand in Google veranderde, en geeft de
 * nieuwe ledenlijst terug.
 *
 * - Toegevoegd in Google: een los lid (het account van een lid van de site als
 *   het adres zijn gekoppelde account is, anders het vrije adres).
 * - Verwijderd in Google: een los lid verdwijnt; wie er dan nog via een bron
 *   in zit (een post), krijgt een uitsluiting, anders zet de sync hem terug.
 */
async function adoptGoogleChanges(
  row: MailGroupRow,
  ctx: DesiredContext,
  takeOver: string[],
  dropped: string[],
) {
  const reload = async () =>
    (await prisma.mailGroup.findUniqueOrThrow({ where: { id: row.id }, select: SELECT })) as unknown as MailGroupRow;
  const addressOf = (extra: MailGroupRow["extras"][number]) =>
    extra.email
      ? normaliseEmail(extra.email)
      : extra.user
        ? memberAddress(
            {
              id: extra.user.id,
              name: extra.user.name,
              googleEmail: extra.user.googleEmail,
              werkgroepEmails: Object.fromEntries(extra.user.werkgroepAccounts.map((a) => [a.groupId, a.email])),
            },
            row.ownerGroupId,
          )
        : null;

  if (dropped.length > 0) {
    const current = await prisma.mailGroupExtra.findMany({
      where: { mailGroupId: row.id, kind: "INCLUDE" },
      select: { id: true, email: true, user: { select: MAIL_GROUP_SELECT.extras.select.user.select } },
    });
    const loose = current.filter((e) => {
      const address = addressOf({ ...e, kind: "INCLUDE" } as MailGroupRow["extras"][number]);
      return address !== null && dropped.includes(address);
    });
    if (loose.length) await prisma.mailGroupExtra.deleteMany({ where: { id: { in: loose.map((e) => e.id) } } });
    // Zit iemand er nog altijd in (via een post), dan een uitsluiting.
    const still = desiredFor(await reload(), ctx).emails.filter((e) => dropped.includes(e));
    if (still.length) {
      const users = await prisma.user.findMany({
        where: { googleEmail: { in: still }, deletedAt: null },
        select: { id: true, googleEmail: true },
      });
      const userBy = new Map(users.map((u) => [u.googleEmail as string, u.id]));
      await prisma.mailGroupExtra.createMany({
        data: still.map((email) =>
          userBy.has(email)
            ? { mailGroupId: row.id, userId: userBy.get(email), kind: "EXCLUDE" as const, note: REMOVED_IN_GOOGLE_NOTE }
            : { mailGroupId: row.id, email, kind: "EXCLUDE" as const, note: REMOVED_IN_GOOGLE_NOTE },
        ),
        skipDuplicates: true,
      });
    }
  }

  if (takeOver.length > 0) {
    // Een lid van de site herkennen we enkel op zijn gekoppelde account, zoals
    // bij het overnemen (lib/google/import.ts); nooit op naam.
    const users = await prisma.user.findMany({
      where: { googleEmail: { in: takeOver }, deletedAt: null },
      select: { id: true, googleEmail: true },
    });
    const userBy = new Map(users.map((u) => [u.googleEmail as string, u.id]));
    // Een uitsluiting voor hetzelfde adres valt weg: iemand zette hem net bewust terug.
    await prisma.mailGroupExtra.deleteMany({
      where: {
        mailGroupId: row.id,
        kind: "EXCLUDE",
        OR: [{ email: { in: takeOver } }, { userId: { in: users.map((u) => u.id) } }],
      },
    });
    await prisma.mailGroupExtra.createMany({
      data: takeOver.map((email) =>
        userBy.has(email)
          ? { mailGroupId: row.id, userId: userBy.get(email), kind: "INCLUDE" as const, note: ADDED_IN_GOOGLE_NOTE }
          : { mailGroupId: row.id, email, kind: "INCLUDE" as const, note: ADDED_IN_GOOGLE_NOTE },
      ),
      skipDuplicates: true,
    });
  }

  return desiredFor(await reload(), ctx);
}

type Counters = { added: number; removed: number; unlinked: number; failed: number };

async function syncOne(
  cfg: GoogleConfig,
  row: MailGroupRow,
  ctx: DesiredContext,
  counters: Counters,
): Promise<void> {
  // Het archief van een vorige ploeg: niet meer aanraken.
  if (isArchivedYear(row, ctx.year)) return;
  try {
    const key = await ensureGroup(cfg, row);
    await ensureSettings(cfg, row);

    let desired = desiredFor(row, ctx);
    const remote = await listMembers(cfg, key);
    const remoteByEmail = new Map(remote.map((m) => [normaliseEmail(m.email), m]));
    const isPlainMember = (email: string) => remoteByEmail.get(email)?.role === "MEMBER";

    // Tweerichtingsverkeer: wat een mens in de Admin console veranderde sinds
    // de vorige ronde, neemt de site over in plaats van het terug te draaien.
    // Eigenaars en beheerders blijven buiten beschouwing, zoals altijd.
    const plan = planTwoWay({
      desired: desired.emails,
      remote: [...remoteByEmail.keys()],
      baseline: row.syncBaselineAt ? row.syncedMembers : null,
    });
    const takeOver = plan.takeOver.filter(isPlainMember);
    const dropped = plan.dropped;
    if (takeOver.length > 0 || dropped.length > 0) {
      desired = await adoptGoogleChanges(row, ctx, takeOver, dropped);
    }
    counters.unlinked += desired.unlinked.length;
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

    if (takeOver.length > 0 || dropped.length > 0) {
      await logAudit({
        action: "sync",
        entity: "mailGroup",
        entityId: row.id,
        target: row.email,
        summary: [
          takeOver.length ? `in Google toegevoegd, overgenomen als los lid: ${takeOver.join(", ")}` : null,
          dropped.length ? `in Google verwijderd, ook hier uit de lijst: ${dropped.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("; "),
      });
    }

    counters.added += added;
    counters.removed += removed;

    await prisma.mailGroup.update({
      where: { id: row.id },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        lastMemberCount: desired.emails.length,
        // Wie er nu in Google staat (gewone leden die wij zetten): de lijst
        // waartegen de volgende ronde een wijziging in Google herkent.
        syncedMembers: desired.emails,
        syncBaselineAt: new Date(),
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
 * Zorgt dat elke hoofdgroep met een jaarsjabloon haar jaargroepen heeft.
 *
 * VTK maakt elk jaar `activiteiten_2627@vtk.be` met de post van dat jaar en
 * hangt die in `activiteiten@vtk.be`. Hier gebeurt dat vanzelf: de jaargroep
 * van het lopende jaar bestaat altijd, die van volgend jaar zodra er iemand in
 * de post van volgend jaar staat (de nieuwe ploeg kan ze dan al gebruiken). Op
 * 15 juli kantelt het werkingsjaar, en `desiredFor` hangt dan de nieuwe
 * jaargroep in de hoofdgroep en haalt de oude eruit. De oude blijft bestaan.
 *
 * Een bestaande rij met het adres (bv. overgenomen uit Google) wordt
 * hergebruikt, niet verdubbeld.
 */
export async function ensureYearlyGroups(cfg: GoogleConfig, year: number): Promise<number> {
  const parents = await prisma.mailGroup.findMany({
    where: { enabled: true, yearlyTemplate: { not: null }, yearlyGroupId: { not: null } },
    select: {
      id: true,
      name: true,
      ownerGroupId: true,
      allowExternalSenders: true,
      yearlyTemplate: true,
      yearlyGroupId: true,
    },
  });

  let created = 0;
  for (const parent of parents) {
    const groupId = parent.yearlyGroupId as string;
    const nextHasMembers =
      (await prisma.groupMembership.count({ where: { groupId, year: year + 1 } })) > 0;
    const years = nextHasMembers ? [year, year + 1] : [year];

    for (const y of years) {
      const email = renderAddress(parent.yearlyTemplate as string, yearVars(y), cfg.domain);
      const existing = await prisma.mailGroup.findUnique({
        where: { email },
        select: { id: true, parentId: true, year: true, sources: { select: { groupId: true } } },
      });
      if (existing) {
        if (existing.parentId !== parent.id || existing.year !== y) {
          await prisma.mailGroup.update({
            where: { id: existing.id },
            data: { parentId: parent.id, year: y },
          });
        }
        if (!existing.sources.some((src) => src.groupId === groupId)) {
          await prisma.mailGroupSource.create({ data: { mailGroupId: existing.id, groupId } });
        }
        continue;
      }
      const row = await prisma.mailGroup.create({
        data: {
          email,
          name: `${parent.name} ${yearVars(y).jj}`,
          description: `Jaargroep van ${parent.name}, werkingsjaar ${y}-${y + 1}.`,
          parentId: parent.id,
          year: y,
          ownerGroupId: parent.ownerGroupId,
          allowExternalSenders: parent.allowExternalSenders,
          sources: { create: [{ groupId }] },
        },
        select: { id: true },
      });
      created += 1;
      await logAudit({
        action: "create",
        entity: "mailGroup",
        entityId: row.id,
        target: email,
        summary: `jaargroep aangemaakt voor ${parent.name}`,
      });
    }
  }
  return created;
}

/**
 * Het vangnet: herbereken alles uit de database en zet het in Google recht.
 * Bedoeld voor de worker (`/api/google/maintenance`) en voor de knop "Nu
 * synchroniseren" in de admin.
 *
 * Drie delen: de jaargroepen, de groepsadressen, en de staat van de accounts.
 * Dat laatste is wat op 15 juli een kiesploeglid vanzelf een werkende mailbox
 * geeft, of een schorsing wanneer het geen post kreeg.
 */
export async function reconcileGoogle(): Promise<ReconcileOutcome> {
  const cfg = await getGoogleConfig();
  if (!cfg) return { skipped: true };

  const year = currentWorkingYear();
  await ensureYearlyGroups(cfg, year).catch((err) => {
    console.error("[google] jaargroepen aanmaken mislukt", err);
  });
  const groups = await syncGroups(cfg, year);
  const accounts = await reconcileAccountStates(cfg, year);
  const transition = await transitionKiesploegen(cfg, year);

  return {
    ...groups,
    accountsChanged: accounts.changed,
    accountWarnings: [...accounts.warnings, ...transition.warnings],
    failed: groups.failed + accounts.failed + transition.failed,
  };
}

async function syncGroups(
  cfg: GoogleConfig,
  year: number,
): Promise<{ groups: number; added: number; removed: number; unlinked: number; failed: number }> {
  const rows = (await prisma.mailGroup.findMany({
    where: { enabled: true },
    select: SELECT,
    orderBy: { email: "asc" },
  })) as MailGroupRow[];
  if (rows.length === 0) {
    return { groups: 0, added: 0, removed: 0, unlinked: 0, failed: 0 };
  }

  const ctx = await loadDesiredContext(rows, year);
  const counters: Counters = { added: 0, removed: 0, unlinked: 0, failed: 0 };
  for (const row of rows) {
    await syncOne(cfg, row, ctx, counters);
  }

  return { groups: rows.length, ...counters };
}

export type AccountStateOutcome = { changed: number; warnings: string[]; failed: number };

/** Het kiesploegadres van een lid: wat er effectief gezet werd, anders het sjabloon. */
export function kiesploegAlias(
  member: {
    aliasEmail: string | null;
    kiesploeg: { code: string; aliasTemplate: string };
  },
  user: { firstName: string | null; lastName: string | null },
  domain: string,
): string | null {
  if (member.aliasEmail) return member.aliasEmail;
  if (!user.firstName || !user.lastName) return null;
  return renderAddress(
    member.kiesploeg.aliasTemplate,
    { code: member.kiesploeg.code, voornaam: user.firstName, achternaam: user.lastName },
    domain,
  );
}

/**
 * Is de postverdeling van dit werkingsjaar ingevoerd? Enkel dan mag de sync
 * kiesploegleden zonder post schorsen. Zie `desiredAccountState`.
 */
export async function postsEnteredFor(year: number): Promise<boolean> {
  const count = await prisma.groupMembership.count({
    where: { year, group: { type: "PRAESIDIUM" } },
  });
  return count > 0;
}

/**
 * Zet de staat van elk gekoppeld account gelijk met wat de posten en de
 * kiesploeg zeggen.
 *
 * Doet in de regel niets: enkel wanneer de gewenste staat verschilt van de
 * laatst toegepaste, vertrekt er een aanroep. Zo kost deze ronde niets zolang
 * er niets verandert, en wordt het op 16 juli in één keer wel wat werk.
 *
 * Wat mag zonder dat iemand erom vroeg, staat in `transitionAllowed`.
 */
export async function reconcileAccountStates(
  cfg: GoogleConfig,
  year: number = currentWorkingYear(),
): Promise<AccountStateOutcome> {
  const users = await prisma.user.findMany({
    where: { googleUserId: { not: null }, googleEmail: { not: null }, deletedAt: null },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      googleEmail: true,
      googleAccountState: true,
      memberships: { where: { year }, select: { id: true }, take: 1 },
      kiesploegMemberships: {
        where: { kiesploeg: { active: true } },
        // De jongste ploeg telt: wie twee jaar na elkaar in een ploeg zit, hoort
        // de regels van de lopende te volgen.
        orderBy: { kiesploeg: { workingYear: "desc" } },
        select: {
          sendFromAlias: true,
          forwardTo: true,
          aliasEmail: true,
          keepAccount: true,
          kiesploeg: { select: { code: true, aliasTemplate: true, workingYear: true } },
        },
        take: 1,
      },
    },
  });

  const postsEntered = new Map<number, boolean>();
  const suspensionAllowed = async (workingYear: number) => {
    if (!postsEntered.has(workingYear)) {
      postsEntered.set(workingYear, await postsEnteredFor(workingYear));
    }
    return postsEntered.get(workingYear) as boolean;
  };

  let changed = 0;
  let failed = 0;
  const warnings: string[] = [];

  for (const user of users) {
    const kiesploeg = user.kiesploegMemberships[0] ?? null;
    const tookOffice = kiesploeg ? kiesploeg.kiesploeg.workingYear <= year : false;
    const desired = desiredAccountState({
      hasCurrentPost: user.memberships.length > 0,
      kiesploeg: kiesploeg
        ? {
            sendFromAlias: kiesploeg.sendFromAlias,
            tookOffice,
            keepAccount: kiesploeg.keepAccount,
          }
        : null,
      suspensionAllowed:
        kiesploeg && tookOffice ? await suspensionAllowed(kiesploeg.kiesploeg.workingYear) : false,
    });
    if (!desired) continue;

    try {
      const outcome = await applyAccountState(
        cfg,
        {
          userId: user.id,
          name: user.name,
          googleEmail: user.googleEmail as string,
          current: user.googleAccountState as AccountState | null,
          alias: kiesploeg ? kiesploegAlias(kiesploeg, user, cfg.domain) : null,
          forwardTo: kiesploeg?.forwardTo ?? null,
        },
        desired,
      );
      if (outcome.changed) changed += 1;
      for (const warning of outcome.warnings) warnings.push(`${user.name}: ${warning}`);
    } catch (err) {
      failed += 1;
      warnings.push(`${user.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { changed, warnings, failed };
}

/**
 * Na 15 juli van het werkingsjaar van een ploeg: haal het kiesploegadres weg bij
 * iedereen van die ploeg.
 *
 * Bewust op 15 juli en niet bij de verkiezing: tot het nieuwe werkingsjaar
 * begint, is dat adres het enige waarmee de ploeg als ploeg mailt. Een lid per
 * keer, en per lid onthouden (`aliasRemovedAt`), zodat een hapering bij één
 * persoon de rest niet tegenhoudt en de volgende ronde enkel de rest doet.
 *
 * De staat van de accounts (volwaardig of geschorst) regelt
 * `reconcileAccountStates`; dit doet enkel de alias.
 */
export async function transitionKiesploegen(
  cfg: GoogleConfig,
  year: number = currentWorkingYear(),
): Promise<{ warnings: string[]; failed: number }> {
  const kiesploegen = await prisma.kiesploeg.findMany({
    where: { active: true, workingYear: { lte: year }, transitionedAt: null },
    select: {
      id: true,
      formalName: true,
      code: true,
      aliasTemplate: true,
      members: {
        where: { aliasRemovedAt: null },
        select: {
          id: true,
          aliasEmail: true,
          user: { select: { name: true, firstName: true, lastName: true, googleEmail: true } },
        },
      },
    },
  });

  const warnings: string[] = [];
  let failed = 0;

  for (const k of kiesploegen) {
    let open = 0;
    for (const member of k.members) {
      const googleEmail = member.user.googleEmail;
      const alias = kiesploegAlias(
        { aliasEmail: member.aliasEmail, kiesploeg: { code: k.code, aliasTemplate: k.aliasTemplate } },
        member.user,
        cfg.domain,
      );
      if (!googleEmail || !alias) {
        // Geen account of geen naam: er is geen alias om weg te halen.
        await prisma.kiesploegMember.update({
          where: { id: member.id },
          data: { aliasRemovedAt: new Date() },
        });
        continue;
      }
      try {
        await removeAlias(cfg, googleEmail, alias);
        try {
          await deleteSendAs(cfg, googleEmail, alias);
        } catch (err) {
          // Een geschorst account laat zich niet impersoneren; de alias is wel
          // weg, en zonder alias werkt dat afzenderadres toch niet meer.
          warnings.push(
            `${member.user.name}: afzenderadres ${alias} niet weggehaald: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await prisma.kiesploegMember.update({
          where: { id: member.id },
          data: { aliasRemovedAt: new Date() },
        });
      } catch (err) {
        open += 1;
        failed += 1;
        warnings.push(
          `${member.user.name}: kiesploegadres ${alias} niet weggehaald: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (open === 0) {
      await prisma.kiesploeg.update({ where: { id: k.id }, data: { transitionedAt: new Date() } });
      await logAudit({
        action: "update",
        entity: "kiesploeg",
        entityId: k.id,
        target: k.formalName,
        summary: "aangetreden: kiesploegadressen weggehaald",
      });
    }
  }

  return { warnings, failed };
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
  const group = await prisma.group
    .findUnique({ where: { id: groupId }, select: { type: true } })
    .catch(() => null);
  // Ook de lijsten die "elke praesidiumpost" als bron hebben: die veranderen
  // mee wanneer er in één post iemand bijkomt. En de lijsten die de werkgroep
  // zelf beheert: daar staan haar leden met hun werkgroepadres in.
  await pushFor({
    OR: [
      { sources: { some: { groupId } } },
      { ownerGroupId: groupId },
      ...(group ? [{ sources: { some: { groupType: group.type } } }] : []),
    ],
  });
}

/** Idem, na een wijziging aan een kiesploeg of aan een van haar posten. */
export async function pushMailGroupsForKiesploeg(kiesploegId: string): Promise<void> {
  await pushFor({
    OR: [
      { sources: { some: { kiesploegId } } },
      { sources: { some: { kiesploegPost: { kiesploegId } } } },
    ],
  });
}

/** Idem, na een wijziging aan de vertegenwoordigers van een POC. */
export async function pushMailGroupsForPoc(pocId: string): Promise<void> {
  await pushFor({ sources: { some: { pocId } } });
}

/** Idem, voor één lijst (na een wijziging aan haar losse leden of instellingen). */
export async function pushMailGroup(mailGroupId: string): Promise<void> {
  await pushFor({ id: mailGroupId });
}

async function pushFor(where: Prisma.MailGroupWhereInput): Promise<void> {
  try {
    const cfg = await getGoogleConfig();
    if (!cfg) return;

    const rows = (await prisma.mailGroup.findMany({
      where: { enabled: true, ...where },
      select: SELECT,
    })) as MailGroupRow[];
    if (rows.length === 0) return;

    const ctx = await loadDesiredContext(rows);
    const counters: Counters = { added: 0, removed: 0, unlinked: 0, failed: 0 };
    for (const row of rows) {
      await syncOne(cfg, row, ctx, counters);
    }
  } catch (err) {
    console.error("[google] push na wijziging mislukt", err);
  }
}
