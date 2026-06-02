import type { CSSProperties, ReactNode } from "react";

// -----------------------------------------------------------------------------
// Curated icon set. Stroke-based line icons on a 24x24 grid; they inherit the
// current text color so a colored chip can pass `currentColor` down.
// -----------------------------------------------------------------------------

export type TileIconKey =
  | "link"
  | "book"
  | "users"
  | "cloud"
  | "ticket"
  | "calendar"
  | "mail"
  | "chat"
  | "doc"
  | "folder"
  | "money"
  | "code"
  | "image"
  | "globe"
  | "settings"
  | "star"
  | "pin"
  | "lock"
  | "video"
  | "megaphone";

export const TILE_ICONS: Array<{ key: TileIconKey; labelNl: string; labelEn: string }> = [
  { key: "link", labelNl: "Link", labelEn: "Link" },
  { key: "book", labelNl: "Wiki / boek", labelEn: "Wiki / book" },
  { key: "users", labelNl: "Mensen", labelEn: "People" },
  { key: "cloud", labelNl: "Cloud / drive", labelEn: "Cloud / drive" },
  { key: "ticket", labelNl: "Tickets", labelEn: "Tickets" },
  { key: "calendar", labelNl: "Kalender", labelEn: "Calendar" },
  { key: "mail", labelNl: "Mail", labelEn: "Mail" },
  { key: "chat", labelNl: "Chat", labelEn: "Chat" },
  { key: "doc", labelNl: "Document", labelEn: "Document" },
  { key: "folder", labelNl: "Map", labelEn: "Folder" },
  { key: "money", labelNl: "Financiën", labelEn: "Finance" },
  { key: "code", labelNl: "Code", labelEn: "Code" },
  { key: "image", labelNl: "Foto's", labelEn: "Photos" },
  { key: "globe", labelNl: "Website", labelEn: "Website" },
  { key: "settings", labelNl: "Instellingen", labelEn: "Settings" },
  { key: "star", labelNl: "Ster", labelEn: "Star" },
  { key: "pin", labelNl: "Locatie", labelEn: "Location" },
  { key: "lock", labelNl: "Beveiligd", labelEn: "Secure" },
  { key: "video", labelNl: "Video", labelEn: "Video" },
  { key: "megaphone", labelNl: "Aankondiging", labelEn: "Announcement" },
];

const ICON_PATHS: Record<TileIconKey, ReactNode> = {
  link: <path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1" />,
  book: <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5zM5 17.5h13" />,
  users: <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15 4.7a3 3 0 0 1 0 5.8" />,
  cloud: <path d="M7.5 18a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.75 3.75 0 0 1 16.75 18z" />,
  ticket: <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.25a1.75 1.75 0 0 0 0 4.5v1.25A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.25a1.75 1.75 0 0 0 0-4.5zM12 7v10" />,
  calendar: <path d="M5 7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 10h14M8 4v3M16 4v3" />,
  mail: <path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4.5 7l7.5 6 7.5-6" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  doc: <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v4h4M9 12h6M9 16h6" />,
  folder: <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  money: <path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5" />,
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13 6l-2 12" />,
  image: <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16l4-4 3 3 4-4 5 5M9 10a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 9 10" />,
  globe: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 12h17M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3" />,
  settings: <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M19 12a7 7 0 0 0-.13-1.3l1.7-1.3-2-3.4-2 .8a7 7 0 0 0-2.27-1.3L13.8 3h-3.6l-.3 2.2a7 7 0 0 0-2.27 1.3l-2-.8-2 3.4 1.7 1.3A7 7 0 0 0 5 12c0 .44.05.87.13 1.3l-1.7 1.3 2 3.4 2-.8c.68.55 1.45.99 2.27 1.3l.3 2.2h3.6l.3-2.2a7 7 0 0 0 2.27-1.3l2 .8 2-3.4-1.7-1.3c.08-.43.13-.86.13-1.3" />,
  star: <path d="M12 4l2.4 5 5.6.6-4 3.9 1 5.5L12 16.4 7 19l1-5.5-4-3.9 5.6-.6z" />,
  pin: <path d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4" />,
  lock: <path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1" />,
  video: <path d="M4 7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM15 10l5-3v10l-5-3z" />,
  megaphone: <path d="M4 10v4a1 1 0 0 0 1 1h2l3 4V5L7 9H5a1 1 0 0 0-1 1M14 8a5 5 0 0 1 0 8M17 5a9 9 0 0 1 0 14" />,
};

export function TileIcon({
  name,
  size = 22,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const key = (name in ICON_PATHS ? name : "link") as TileIconKey;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICON_PATHS[key]}
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Color palette. Each tile renders a colored icon chip; `chipBg`/`chipFg` are
// the chip background and icon color, aligned to the VTK design tokens.
// -----------------------------------------------------------------------------

export type TileColorKey =
  | "navy"
  | "blue"
  | "yellow"
  | "green"
  | "red"
  | "purple"
  | "teal"
  | "slate"
  | "paper";

export const TILE_COLORS: Array<{
  key: TileColorKey;
  labelNl: string;
  labelEn: string;
  chipBg: string;
  chipFg: string;
}> = [
  { key: "navy", labelNl: "Marineblauw", labelEn: "Navy", chipBg: "#0E1A36", chipFg: "#FAFAF7" },
  { key: "blue", labelNl: "Blauw", labelEn: "Blue", chipBg: "#E4ECFB", chipFg: "#1B3C8A" },
  { key: "yellow", labelNl: "Geel", labelEn: "Yellow", chipBg: "#FFD23F", chipFg: "#0A0F1F" },
  { key: "green", labelNl: "Groen", labelEn: "Green", chipBg: "#E1F0E4", chipFg: "#1F6B3A" },
  { key: "red", labelNl: "Rood", labelEn: "Red", chipBg: "#FBE4E4", chipFg: "#A31F1F" },
  { key: "purple", labelNl: "Paars", labelEn: "Purple", chipBg: "#EDE6FB", chipFg: "#5B2EA3" },
  { key: "teal", labelNl: "Turquoise", labelEn: "Teal", chipBg: "#DEF1F0", chipFg: "#13726B" },
  { key: "slate", labelNl: "Grijsblauw", labelEn: "Slate", chipBg: "#E7E9EE", chipFg: "#3A4358" },
  { key: "paper", labelNl: "Papier", labelEn: "Paper", chipBg: "#F2F0E9", chipFg: "#0A0F1F" },
];

const COLOR_MAP = new Map(TILE_COLORS.map((c) => [c.key, c]));

export function tileColor(key: string): { chipBg: string; chipFg: string } {
  return COLOR_MAP.get(key as TileColorKey) ?? COLOR_MAP.get("navy")!;
}

// -----------------------------------------------------------------------------
// Merge logic: turn shared (global/group) tiles + per-user prefs + personal
// tiles into a single ordered list of effective tiles for one user.
// -----------------------------------------------------------------------------

export type TileSource = "global" | "group" | "personal";

export type EffectiveTile = {
  /** Stable React/payload key. */
  key: string;
  /** Underlying DashboardTile id. */
  tileId: string;
  source: TileSource;
  label: string;
  url: string;
  icon: string;
  color: string;
  order: number;
  /** Whether this tile is currently hidden for the user (shared tiles only). */
  hidden: boolean;
  /** Shared tile has a per-user display override. */
  overridden: boolean;
  /** Group label, for display in edit mode on group tiles. */
  groupLabel?: string;
};

type SharedTileRow = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  order: number;
  scope: "GLOBAL" | "GROUP" | "USER" | string;
  groupId: string | null;
  groupLabel?: string;
};

type PersonalTileRow = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  order: number;
};

type PrefRow = {
  tileId: string;
  hidden: boolean;
  order: number | null;
  label: string | null;
  url: string | null;
  icon: string | null;
  color: string | null;
};

export function mergeTiles(
  sharedTiles: SharedTileRow[],
  prefs: PrefRow[],
  personalTiles: PersonalTileRow[]
): EffectiveTile[] {
  const prefByTile = new Map(prefs.map((p) => [p.tileId, p]));

  const shared: EffectiveTile[] = sharedTiles.map((t) => {
    const pref = prefByTile.get(t.id);
    const overridden =
      !!pref && (pref.label != null || pref.url != null || pref.icon != null || pref.color != null);
    return {
      key: t.id,
      tileId: t.id,
      source: t.scope === "GROUP" ? "group" : "global",
      label: pref?.label ?? t.label,
      url: pref?.url ?? t.url,
      icon: pref?.icon ?? t.icon,
      color: pref?.color ?? t.color,
      order: pref?.order ?? t.order,
      hidden: pref?.hidden ?? false,
      overridden,
      groupLabel: t.groupLabel,
    };
  });

  const personal: EffectiveTile[] = personalTiles.map((t) => ({
    key: `personal:${t.id}`,
    tileId: t.id,
    source: "personal",
    label: t.label,
    url: t.url,
    icon: t.icon,
    color: t.color,
    order: t.order,
    hidden: false,
    overridden: false,
  }));

  return [...shared, ...personal].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label)
  );
}
