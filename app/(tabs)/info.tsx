import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, ExternalLink, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../src/api/client';
import type { AppNavTab } from '../../src/api/contract';
import { PageHead } from '../../src/components/PageHead';
import { Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { nativeRouteFor, pageSlugFor } from '../../src/nativeRoute';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * De inhoud van de site: de categorieën uit het CMS, elk met wat eronder hangt.
 *
 * **Dit scherm is de boom, niet de snelkoppelingen.** Wat je vaak doet (broodjes,
 * tickets, shiften, cursusdienst, tijdsloten) staat op Home; hier vind je alles
 * terug, in dezelfde indeling als de header op de site. Die scheiding is er omdat
 * het anders dubbel loopt: een tegel bovenaan én hetzelfde item verderop in de
 * lijst.
 *
 * De structuur komt uit `bootstrap` en dus uit `HeaderTab` in het beheer. Er
 * staat hier geen vaste lijst in de app: wie in de admin een pagina publiceert,
 * ziet ze meteen.
 *
 * **Alles wat een eigen scherm heeft, opent native.** Het CMS kent de app niet,
 * dus daar staat "Piano reserveren" als link naar `/piano`; `nativeRouteFor`
 * vertaalt dat naar het pianoscherm in plaats van naar een browser. Een browser
 * is de laatste optie, niet de eerste.
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

  const openOnWeb = (href: string) => {
    const url = /^https?:\/\//i.test(href) ? href : `${baseUrl()}${href}`;
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

        {bootstrap.tabs.map((tab) => (
          <TabRow
            key={tab.id}
            tab={tab}
            expanded={open === tab.id}
            onToggle={() => setOpen(open === tab.id ? null : tab.id)}
            onNative={(route) => router.push(route as never)}
            onCategory={() => router.push(`/categorie/${tab.slug}`)}
            onPage={(slug) => router.push(`/pagina/${slug}`)}
            onWeb={openOnWeb}
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
  onNative,
  onCategory,
  onPage,
  onWeb,
}: {
  tab: AppNavTab;
  expanded: boolean;
  onToggle: () => void;
  onNative: (route: string) => void;
  onCategory: () => void;
  onPage: (slug: string) => void;
  onWeb: (href: string) => void;
}) {
  // De categorie zelf kan een eigen scherm hebben: "Broodjes" is het
  // bestelscherm, "Media" de galerij. Dan is uitklappen zinloos.
  const tabNative = tab.externalUrl ? null : nativeRouteFor(`/${tab.slug}`);
  const external = Boolean(tab.externalUrl);
  const expandable = !external && !tabNative && tab.children.length > 0;

  const openTab = () => {
    if (external) onWeb(tab.externalUrl as string);
    else if (tabNative) onNative(tabNative);
    else if (expandable) onToggle();
    else onCategory();
  };

  return (
    <Card style={styles.tab}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ expanded: expandable ? expanded : undefined }}
        onPress={openTab}
        style={styles.tabHeader}
      >
        <Text style={styles.tabLabel}>{tab.label}</Text>
        {external ? (
          <ExternalLink color={COLORS.muted} size={18} />
        ) : (
          <ChevronRight
            color={COLORS.muted}
            size={18}
            style={expandable && expanded ? styles.chevronOpen : undefined}
          />
        )}
      </Pressable>

      {expandable && expanded ? (
        <View style={styles.children}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Alles onder ${tab.label}`}
            onPress={onCategory}
            style={styles.child}
          >
            <Text style={styles.childLabel}>Overzicht</Text>
            <ChevronRight color={COLORS.muted} size={15} />
          </Pressable>

          {tab.children.map((child) => {
            const native = child.external ? null : nativeRouteFor(child.href);
            const page = child.external ? null : pageSlugFor(child.href, tab.slug);

            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={child.label}
                onPress={() => {
                  if (native) onNative(native);
                  else if (page) onPage(page);
                  else onWeb(child.href);
                }}
                style={styles.child}
              >
                <Text style={styles.childLabel}>{child.label}</Text>
                {/* Enkel wat de app echt verlaat, krijgt het pijltje naar buiten.
                    Een CMS-pagina en een native scherm blijven allebei binnen. */}
                {native || page ? (
                  <ChevronRight color={COLORS.muted} size={15} />
                ) : (
                  <ExternalLink color={COLORS.muted} size={15} />
                )}
              </Pressable>
            );
          })}
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
