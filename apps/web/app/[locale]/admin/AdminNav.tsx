'use client';

import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import { AdminNav as SharedAdminNav, type AdminNavItem, type AdminNavNode } from '@vtk/ui';
import { toggleAdminNavPinAction } from '@/app/actions/admin-nav';
import { useToast } from '@/components/ui/toast';
import { ADMIN_NAV_COLLAPSED_COOKIE } from '@/lib/adminNavCookie';
import { useAdminDensity } from './AdminSurface';
import { ADMIN_NAV_ICONS as icons } from '@/lib/admin-nav-icons';

export type NavItem = AdminNavItem;
export type NavNode = AdminNavNode;

export type PinLabels = {
  section: string;
  all: string;
  pin: string;
  unpin: string;
  error: string;
};

/** Onthoudt de keuze voor de volgende pagina; zie `lib/adminNavCookie.ts`. */
function rememberCollapsed(collapsed: boolean) {
  document.cookie = collapsed
    ? `${ADMIN_NAV_COLLAPSED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    : `${ADMIN_NAV_COLLAPSED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function AdminNav({
  title,
  nodes,
  pinnedKeys,
  pinLabels,
  collapsed,
  collapseLabels,
  searchLabels,
  densityLabel,
}: {
  title: string;
  nodes: NavNode[];
  pinnedKeys: string[];
  pinLabels: PinLabels;
  collapsed: boolean;
  collapseLabels: { collapse: string; expand: string; shortcut: string };
  searchLabels: { open: string; placeholder: string; empty: string };
  densityLabel: string;
}) {
  const showToast = useToast();
  const density = useAdminDensity();
  const { error, ...labels } = pinLabels;

  return (
    <SharedAdminNav
      title={title}
      nodes={nodes}
      icons={icons}
      collapse={{ initial: collapsed, onChange: rememberCollapsed, labels: collapseLabels }}
      search={{ labels: searchLabels }}
      density={density ? { compact: density.compact, onChange: density.setCompact, label: densityLabel } : undefined}
      pins={{
        keys: pinnedKeys,
        labels,
        // Het speldje meldt zijn succes door de tab zichtbaar te verplaatsen;
        // enkel een mislukking heeft een toast nodig (zie CLAUDE.md).
        // Gooien is het sein aan de nav om de pin terug te zetten; de melding
        // is hier al getoond.
        onToggle: async (key, pinned) => {
          let result;
          try {
            result = await unsentGuard.run(() => toggleAdminNavPinAction(key, pinned));
            if (result === UNSENT) return;
          } catch (cause) {
            showToast({ message: error, variant: 'error', duration: 0 });
            throw cause;
          }
          if (result.status === 'error') {
            showToast({ message: error, variant: 'error', duration: 0 });
            throw new Error(`admin nav pin failed: ${result.code}`);
          }
        },
      }}
    />
  );
}
