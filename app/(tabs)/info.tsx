import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Images,
  Search,
  TicketCheck,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../src/api/client';
import type { AppNavTab } from '../../src/api/contract';
import { PageHead } from '../../src/components/PageHead';
import { Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * De inhoud van de site, in de vorm die de header op de site heeft: de
 * categorieën uit het CMS, elk met de pagina's eronder.
 *
 * De tabs komen uit `bootstrap` en dus uit `HeaderTab` in het beheer. Er staat
 * hier bewust geen vaste lijst in de app: wie in de admin een pagina publiceert,
 * hoort ze meteen in de app te zien zonder release.
 *
 * Bovenaan staan de vier bestemmingen die geen CMS-categorie zijn maar wel een
 * eigen scherm hebben. Ze zijn er te weinig voor een eigen tab en te belangrijk
 * om onderaan te verdwijnen.
 */
export default function InfoScreen() {
  const router = useRouter();
  const { bootstrap, loading, stale, error, refresh } = useApp();
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!bootstrap) {
    return (
      <ErrorState
        message={error?.message ?? 'De navigatie kon niet geladen worden.'}
        onRetry={() => void refresh()}
      />
    );
  }

  const openPath = (path: string) => {
    const url = /^https?:\/\//i.test(path) ? path : `${baseUrl()}${path}`;
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <>
      <PageHead
        title="Info"
        subtitle="Alles wat VTK doet, per onderdeel"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoeken"
            onPress={() => router.push('/zoeken')}
            hitSlop={10}
          >
            <Search color={COLORS.yellow} size={22} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}

        <Shortcut
          icon={<TicketCheck color={COLORS.navy} size={20} />}
          label="Tickets"
          onPress={() => router.push('/tickets')}
        />
        <Shortcut
          icon={<Images color={COLORS.navy} size={20} />}
          label="Media"
          onPress={() => router.push('/media')}
        />
        <Shortcut
          icon={<Wrench color={COLORS.navy} size={20} />}
          label="Shiften"
          onPress={() => router.push('/shiften')}
        />
        <Shortcut
          icon={<Users color={COLORS.navy} size={20} />}
          label="Praesidium"
          onPress={() => router.push('/praesidium')}
        />
        <Shortcut
          icon={<UsersRound color={COLORS.navy} size={20} />}
          label="Werkgroepen"
          onPress={() => router.push('/werkgroepen')}
        />
        <Shortcut
          icon={<GraduationCap color={COLORS.navy} size={20} />}
          label="POC's"
          onPress={() => router.push('/pocs')}
        />

        {bootstrap.tabs.map((tab) => (
          <TabRow
            key={tab.id}
            tab={tab}
            expanded={open === tab.id}
            onToggle={() => setOpen(open === tab.id ? null : tab.id)}
            onOpenCategory={() => router.push(`/categorie/${tab.slug}`)}
            onOpenExternal={openPath}
          />
        ))}

        {bootstrap.tabs.length === 0 ? (
          <Card>
            <Text style={styles.body}>Er staan nog geen onderdelen klaar.</Text>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.tab}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.tabHeader}
      >
        {icon}
        <Text style={styles.tabLabel}>{label}</Text>
        <ChevronRight color={COLORS.muted} size={18} />
      </Pressable>
    </Card>
  );
}

function TabRow({
  tab,
  expanded,
  onToggle,
  onOpenCategory,
  onOpenExternal,
}: {
  tab: AppNavTab;
  expanded: boolean;
  onToggle: () => void;
  onOpenCategory: () => void;
  onOpenExternal: (path: string) => void;
}) {
  const router = useRouter();
  // Een tab met een externe site (bv. Career) is gewoon een link; die klapt niet
  // uit, want er hangt niets van ons onder.
  const external = Boolean(tab.externalUrl);
  const hasChildren = !external && tab.children.length > 0;

  return (
    <Card style={styles.tab}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ expanded: hasChildren ? expanded : undefined }}
        onPress={() => {
          if (external) onOpenExternal(tab.externalUrl as string);
          else if (hasChildren) onToggle();
          else onOpenCategory();
        }}
        style={styles.tabHeader}
      >
        <Text style={styles.tabLabel}>{tab.label}</Text>
        {external ? (
          <ExternalLink color={COLORS.muted} size={18} />
        ) : (
          <ChevronRight
            color={COLORS.muted}
            size={18}
            style={expanded ? styles.chevronOpen : undefined}
          />
        )}
      </Pressable>

      {expanded && hasChildren ? (
        <View style={styles.children}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Alles onder ${tab.label}`}
            onPress={onOpenCategory}
            style={styles.child}
          >
            <Text style={styles.childLabel}>Overzicht</Text>
            <ChevronRight color={COLORS.muted} size={15} />
          </Pressable>

          {tab.children.map((child) => (
            <Pressable
              key={child.id}
              accessibilityRole="button"
              accessibilityLabel={child.label}
              onPress={() => {
                // Een pagina onder deze categorie krijgt het native scherm; een
                // menu-item wijst per definitie ergens anders heen.
                const page = pageSlugFrom(child.href, tab.slug);
                if (!child.external && page) router.push(`/pagina/${page}`);
                else onOpenExternal(child.href);
              }}
              style={styles.child}
            >
              <Text style={styles.childLabel}>{child.label}</Text>
              {child.external ? <ExternalLink color={COLORS.muted} size={15} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * `/info/theokot` onder de tab `info` is de pagina `theokot`. Een pad dat daar
 * niet aan voldoet (`/piano`, `/kalender`) is een menu-item naar iets anders en
 * heeft hier geen contentpagina.
 */
function pageSlugFrom(href: string, tabSlug: string): string | null {
  const prefix = `/${tabSlug}/`;
  if (!href.startsWith(prefix)) return null;
  const slug = href.slice(prefix.length);
  return slug.includes('/') || slug === '' ? null : slug;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  tab: { padding: 0, gap: 0, overflow: 'hidden', borderRadius: RADIUS.md },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  tabLabel: { ...TYPE.cardTitle, color: COLORS.ink, flex: 1 },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  children: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.paper2,
  },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  childLabel: { ...TYPE.body, color: COLORS.body, flex: 1 },
  body: { ...TYPE.body, color: COLORS.body },
});
