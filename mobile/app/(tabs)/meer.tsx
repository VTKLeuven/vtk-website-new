import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  Bell,
  BookOpen,
  ChevronRight,
  Coins,
  ExternalLink,
  GraduationCap,
  Images,
  Music,
  QrCode,
  Search,
  Users,
  Wrench,
} from 'lucide-react-native';
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
 * Meer: alles wat je opzoekt in plaats van doet.
 *
 * De vier tabs ervoor zijn werkwoorden (kijken wat er open is, plannen, kopen,
 * bestellen). Dit is het zelfstandig naamwoord: de mensen, de foto's, de piano,
 * de shiften, de hele CMS-boom uit het beheer, en je eigen profiel.
 *
 * **De scheiding met Home blijft dezelfde als vroeger tussen Home en Info**: wat
 * je vaak doet staat op Home, wat je opzoekt staat hier. Anders komt de helft
 * twee keer voor, één keer als tegel en één keer als menu-item uit het CMS. Dat
 * is ook de reden dat er hier geen tegelraster staat.
 *
 * De structuur van de onderste helft komt uit `bootstrap` en dus uit `HeaderTab`
 * in het beheer. Er staat hier geen vaste lijst in de app: wie in de admin een
 * pagina publiceert, ziet ze meteen.
 *
 * **Alles wat een eigen scherm heeft, opent native.** Het CMS kent de app niet,
 * dus daar staat "Piano reserveren" als link naar `/piano`; `nativeRouteFor`
 * vertaalt dat naar het pianoscherm in plaats van naar een browser. Een browser
 * is de laatste optie, niet de eerste.
 */

/** Wat op Cudi draait en dus buiten deze app en buiten deze site valt. */
const CUDI = 'https://cudi.vtk.be';
const BURGIECLAN = 'https://burgieclan.be';

export default function MeerScreen() {
  const router = useRouter();
  const { bootstrap, viewer, loading, stale, error, refresh } = useApp();
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
        title="Meer"
        subtitle="Mensen, foto's en alles van VTK"
        back={false}
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

        {/* Jij, bovenaan. Een eigen tab was dat niet waard: je opent je profiel
            een paar keer per jaar, niet een paar keer per dag. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={viewer ? `Profiel van ${viewer.name}` : 'Inloggen'}
          onPress={() => router.push(viewer ? '/profiel' : '/inloggen')}
          style={({ pressed }) => [styles.person, pressed && styles.pressed]}
        >
          {viewer?.avatarUrl ? (
            <Image source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.initials}>{viewer ? initialsOf(viewer.name) : '?'}</Text>
            </View>
          )}
          <View style={styles.personText}>
            <Text style={styles.personName}>{viewer?.name ?? 'Niet ingelogd'}</Text>
            <Text style={styles.hint}>
              {viewer?.email ?? 'Log in om te bestellen, tickets te kopen en je shiften te zien'}
            </Text>
          </View>
          <ChevronRight color={COLORS.muted} size={18} />
        </Pressable>

        <Group>
          {viewer ? (
            <Row
              icon={<Coins color={COLORS.navy} size={19} />}
              label="Mijn bonnetjes"
              hint="Verdiend met shiften, uit te geven aan de toog"
              onPress={() => router.push('/bonnetjes')}
            />
          ) : null}
          <Row
            icon={<Wrench color={COLORS.navy} size={19} />}
            label="Shiften"
            onPress={() => router.push('/shiften')}
          />
          <Row
            icon={<Images color={COLORS.navy} size={19} />}
            label="Foto's en media"
            onPress={() => router.push('/media')}
          />
          <Row
            icon={<Music color={COLORS.navy} size={19} />}
            label="Piano reserveren"
            onPress={() => router.push('/piano')}
          />
          {viewer ? (
            <Row
              icon={<QrCode color={COLORS.navy} size={19} />}
              label="Een code scannen"
              hint="Ticket, uitnodiging, fakbar of een pas"
              onPress={() => router.push('/scannen')}
            />
          ) : null}
        </Group>

        <SectionLabel>Mensen</SectionLabel>
        <Group>
          <Row
            icon={<Users color={COLORS.navy} size={19} />}
            label="Praesidium"
            onPress={() => router.push('/praesidium')}
          />
          <Row
            icon={<Users color={COLORS.navy} size={19} />}
            label="Werkgroepen"
            onPress={() => router.push('/werkgroepen')}
          />
          <Row
            icon={<GraduationCap color={COLORS.navy} size={19} />}
            label="POC's"
            onPress={() => router.push('/pocs')}
          />
        </Group>

        {viewer ? (
          <>
            <SectionLabel>Meldingen</SectionLabel>
            <Group>
              <Row
                icon={<Bell color={COLORS.navy} size={19} />}
                label="Wat je wil weten"
                hint="Broodjes, shiften en de categorieën die je volgt"
                onPress={() => router.push('/meldingen')}
              />
            </Group>
          </>
        ) : null}

        {/* Twee adressen die deze app en deze site verlaten. Ze staan hier en niet
            verstopt in de CMS-boom, want ze horen bij wat een student van VTK
            gebruikt; het pijltje zegt vooraf dat er een browser opengaat. */}
        <SectionLabel>Elders</SectionLabel>
        <Group>
          <Row
            icon={<BookOpen color={COLORS.navy} size={19} />}
            label="Cursusdienst"
            hint="cudi.vtk.be"
            external
            onPress={() => void WebBrowser.openBrowserAsync(`${CUDI}/vtk/shop`)}
          />
          <Row
            icon={<BookOpen color={COLORS.navy} size={19} />}
            label="Tijdsloten cursusdienst"
            hint="cudi.vtk.be"
            external
            onPress={() => void WebBrowser.openBrowserAsync(`${CUDI}/vtk/account/slots`)}
          />
          <Row
            icon={<GraduationCap color={COLORS.navy} size={19} />}
            label="Burgieclan"
            hint="burgieclan.be"
            external
            onPress={() => void WebBrowser.openBrowserAsync(BURGIECLAN)}
          />
        </Group>

        <SectionLabel>Alles van VTK</SectionLabel>
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

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({
  icon,
  label,
  hint,
  external = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  external?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={external ? `${label}, opent een browser` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {external ? (
        <ExternalLink color={COLORS.muted} size={16} />
      ) : (
        <ChevronRight color={COLORS.muted} size={18} />
      )}
    </Pressable>
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
  //
  // Een categorie mét items klapt uit en toont die items rechtstreeks; er staat
  // geen "Overzicht"-regel meer boven. Het categoriescherm blijft wel bestaan:
  // het is waar een categorie zónder items op uitkomt.
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

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },

  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  avatar: { width: 46, height: 46, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...TYPE.cardTitle, color: COLORS.navy },
  personText: { flex: 1, gap: 2 },
  personName: { ...TYPE.cardTitle, color: COLORS.ink },

  sectionLabel: { ...TYPE.kicker, color: COLORS.muted, marginTop: SPACING.md },
  group: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
  },
  rowIcon: { width: 24, alignItems: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  pressed: { backgroundColor: COLORS.paper2 },

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
  children: { borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.paper2 },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  childLabel: { ...TYPE.body, color: COLORS.body, flex: 1 },

  hint: { ...TYPE.small, color: COLORS.muted },
  body: { ...TYPE.body, color: COLORS.body },
});
