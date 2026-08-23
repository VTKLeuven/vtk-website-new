import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, ExternalLink } from 'lucide-react-native';
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
 * De pagina's zelf worden in fase 3 native gerenderd (Markdown, met de kop-index
 * en de downloads). Tot dan opent een tik de webpagina; dat is één scherm dat
 * verdwijnt, niet een architectuur.
 */
export default function InfoScreen() {
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
      <PageHead title="Info" subtitle="Alles wat VTK doet, per onderdeel" />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}

        {bootstrap.tabs.map((tab) => (
          <TabRow
            key={tab.id}
            tab={tab}
            expanded={open === tab.id}
            onToggle={() => setOpen(open === tab.id ? null : tab.id)}
            onOpen={openPath}
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

function TabRow({
  tab,
  expanded,
  onToggle,
  onOpen,
}: {
  tab: AppNavTab;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (path: string) => void;
}) {
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
          if (external) onOpen(tab.externalUrl as string);
          else if (hasChildren) onToggle();
          else onOpen(`/${tab.slug}`);
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
          {tab.children.map((child) => (
            <Pressable
              key={child.id}
              accessibilityRole="button"
              accessibilityLabel={child.label}
              onPress={() => onOpen(child.href)}
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
