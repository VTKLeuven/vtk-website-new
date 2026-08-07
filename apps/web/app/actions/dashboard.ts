"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { isTileImageKey } from "@/lib/dashboard-tiles";
import { requirePermission, requireSession } from "@/lib/session";

function revalidateDashboard(): void {
  revalidatePath("/admin");
  revalidatePath("/en/admin");
}

function revalidateManager(): void {
  revalidatePath("/admin/dashboard-tiles");
  revalidatePath("/en/admin/dashboard-tiles");
  revalidateDashboard();
}

/** Prepend https:// when the user omits a scheme, otherwise leave untouched. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/**
 * De client stuurt de storage-key van een geüpload tegellogo mee. Alleen keys
 * uit het `tiles/`-prefix zijn geldig: de uploadroute legt tegelafbeeldingen
 * daar, en zo kan niemand via het verborgen veld een willekeurig ander object
 * uit de bucket op zijn dashboard trekken.
 */
function cleanImageKey(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return isTileImageKey(s) ? s : null;
}

// -----------------------------------------------------------------------------
// Per-user personalization (any logged-in user)
// -----------------------------------------------------------------------------

export type LayoutItem = {
  tileId: string;
  kind: "shared" | "personal";
  order: number;
  hidden: boolean;
};

export async function saveDashboardLayoutAction(items: LayoutItem[]): Promise<void> {
  const session = await requireSession();
  const userId = session.user.id;

  const personalIds = items.filter((i) => i.kind === "personal").map((i) => i.tileId);
  const ownPersonal = personalIds.length
    ? new Set(
        (
          await prisma.dashboardTile.findMany({
            where: { id: { in: personalIds }, userId, scope: "USER" },
            select: { id: true },
          })
        ).map((t) => t.id)
      )
    : new Set<string>();

  for (const item of items) {
    if (item.kind === "personal") {
      if (!ownPersonal.has(item.tileId)) continue;
      await prisma.dashboardTile.update({
        where: { id: item.tileId },
        data: { order: item.order },
      });
    } else {
      await prisma.userDashboardTilePref.upsert({
        where: { userId_tileId: { userId, tileId: item.tileId } },
        update: { order: item.order, hidden: item.hidden },
        create: { userId, tileId: item.tileId, order: item.order, hidden: item.hidden },
      });
    }
  }
  revalidateDashboard();
}

export type TileInput = {
  label: string;
  url: string;
  icon: string;
  color: string;
  /** Storage-key van een eigen logo; null = toon het pictogram. */
  imageKey: string | null;
};

export async function addPersonalTileAction(input: TileInput): Promise<void> {
  const session = await requireSession();
  const userId = session.user.id;
  const label = input.label.trim();
  const url = normalizeUrl(input.url);
  if (!label || !url) return;
  const max = await prisma.dashboardTile.aggregate({
    where: { userId, scope: "USER" },
    _max: { order: true },
  });
  await prisma.dashboardTile.create({
    data: {
      label,
      url,
      icon: input.icon || "link",
      color: input.color || "navy",
      imageKey: cleanImageKey(input.imageKey),
      scope: "USER",
      userId,
      order: (max._max.order ?? 999) + 1,
    },
  });
  revalidateDashboard();
}

export async function updatePersonalTileAction(input: TileInput & { id: string }): Promise<void> {
  const session = await requireSession();
  const tile = await prisma.dashboardTile.findFirst({
    where: { id: input.id, userId: session.user.id, scope: "USER" },
    select: { id: true },
  });
  if (!tile) return;
  const label = input.label.trim();
  const url = normalizeUrl(input.url);
  if (!label || !url) return;
  await prisma.dashboardTile.update({
    where: { id: tile.id },
    data: {
      label,
      url,
      icon: input.icon || "link",
      color: input.color || "navy",
      imageKey: cleanImageKey(input.imageKey),
    },
  });
  revalidateDashboard();
}

export async function deletePersonalTileAction(id: string): Promise<void> {
  const session = await requireSession();
  await prisma.dashboardTile.deleteMany({
    where: { id, userId: session.user.id, scope: "USER" },
  });
  revalidateDashboard();
}

export async function overrideSharedTileAction(input: TileInput & { tileId: string }): Promise<void> {
  const session = await requireSession();
  const userId = session.user.id;
  const tile = await prisma.dashboardTile.findFirst({
    where: { id: input.tileId, scope: { in: ["GLOBAL", "GROUP"] } },
    select: { id: true, imageKey: true },
  });
  if (!tile) return;
  const label = input.label.trim();
  const url = input.url.trim();

  // De client stuurt gewoon wat de tegel moet tonen; hier vertalen we dat naar
  // "erven" of "overschrijven". Zonder deze vergelijking zou een tegel die het
  // standaardlogo houdt dat logo vastpinnen, en zou het weghalen van een
  // standaardlogo stil genegeerd worden (null leest immers als "erf").
  const wanted = cleanImageKey(input.imageKey);
  const inheritsImage = wanted === tile.imageKey;
  const imageKey = inheritsImage ? null : wanted;
  const imageCleared = wanted === null && tile.imageKey !== null;

  const fields = {
    label: label || null,
    url: url ? normalizeUrl(url) : null,
    icon: input.icon || null,
    color: input.color || null,
    imageKey,
    imageCleared,
  };

  await prisma.userDashboardTilePref.upsert({
    where: { userId_tileId: { userId, tileId: input.tileId } },
    update: fields,
    create: { userId, tileId: input.tileId, ...fields },
  });
  revalidateDashboard();
}

/** Drop the user's override/hidden/order for a shared tile (revert to default). */
export async function resetSharedTileAction(tileId: string): Promise<void> {
  const session = await requireSession();
  await prisma.userDashboardTilePref.deleteMany({
    where: { userId: session.user.id, tileId },
  });
  revalidateDashboard();
}

/** Clear all of the user's prefs (keeps their personal tiles). */
export async function resetLayoutAction(): Promise<void> {
  const session = await requireSession();
  await prisma.userDashboardTilePref.deleteMany({ where: { userId: session.user.id } });
  revalidateDashboard();
}

// -----------------------------------------------------------------------------
// Admin management of shared defaults (requires dashboard.manage)
// -----------------------------------------------------------------------------

export type DefaultTileInput = TileInput & {
  id?: string;
  scope: "GLOBAL" | "GROUP";
  groupId?: string | null;
  order: number;
};

export async function saveDefaultTileAction(input: DefaultTileInput): Promise<void> {
  await requirePermission("dashboard.manage");
  const label = input.label.trim();
  const url = normalizeUrl(input.url);
  if (!label || !url) return;
  const groupId = input.scope === "GROUP" ? input.groupId || null : null;
  if (input.scope === "GROUP" && !groupId) return;
  const data = {
    label,
    url,
    icon: input.icon || "link",
    color: input.color || "navy",
    imageKey: cleanImageKey(input.imageKey),
    order: Number.isFinite(input.order) ? input.order : 0,
    scope: input.scope,
    groupId,
  };
  if (input.id) {
    await prisma.dashboardTile.update({
      where: { id: input.id },
      data,
    });
  } else {
    await prisma.dashboardTile.create({ data });
  }
  revalidateManager();
}

export async function deleteDefaultTileAction(id: string): Promise<void> {
  await requirePermission("dashboard.manage");
  await prisma.dashboardTile.deleteMany({
    where: { id, scope: { in: ["GLOBAL", "GROUP"] } },
  });
  revalidateManager();
}
