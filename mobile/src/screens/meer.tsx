import { Image } from 'expo-image';

import * as WebBrowser from 'expo-web-browser';
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../api/client';
import type { AppNavTab } from '../api/contract';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { nativeRouteFor, pageSlugFor } from '../nativeRoute';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Meer: alles wat je opzoekt in plaats van doet.
 *
 * De vier tabs ervoor zijn werkwoorden (kijken wat er open is, plannen, kopen,
 * bestellen). Dit is het zelfstandig naamwoord: de mensen, de foto's, de piano,
 * de shiften, de hele CMS-boom uit het beheer, en je eigen profiel.
 *
 * In de vorm van de site (november 2026): je profiel als donker glas in de kop,
 * de snelkoppelingen als het register in de marge (een kleine kop in kapitalen,
 * een haarlijn links, gedempte links met lucht ertussen; geen witte groepen met
 * icoontjes), en de onderdelen van VTK als de tegels van een categoriepagina:
 * de foto links, de naam rechts.
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

type Link = { label: string; hint?: string; onPress: () => void; external?: boolean };

export default function MeerScreen() {
  const router = useTabRouter();
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

  const doen: Link[] = [
    ...(viewer ? [{ label: 'Bonnetjes', onPress: () => router.push('/bonnetjes') }] : []),
    { label: 'Shiften', onPress: () => router.push('/shiften') },
    { label: "Foto's", onPress: () => router.push('/media') },
    { label: 'Piano', onPress: () => router.push('/piano') },
    ...(viewer ? [{ label: 'Code scannen', onPress: () => router.push('/scannen') }] : []),
  ];
  const mensen: Link[] = [
    { label: 'Praesidium', onPress: () => router.push('/praesidium') },
    { label: 'Werkgroepen', onPress: () => router.push('/werkgroepen') },
    { label: "POC's", onPress: () => router.push('/pocs') },
    ...(viewer ? [{ label: 'Peilingen', onPress: () => router.push('/peilingen') }] : []),
  ];
  const elders: Link[] = [
    {
      label: 'Cursusdienst',
      hint: 'cudi.vtk.be',
      external: true,
      onPress: () => void WebBrowser.openBrowserAsync(`${CUDI}/vtk/shop`),
    },
    {
      label: 'Tijdsloten cursusdienst',
      hint: 'cudi.vtk.be',
      external: true,
      onPress: () => void WebBrowser.openBrowserAsync(`${CUDI}/vtk/account/slots`),
    },
    {
      label: 'Burgieclan',
      hint: 'burgieclan.be',
      external: true,
      onPress: () => void WebBrowser.openBrowserAsync(BURGIECLAN),
    },
  ];

  return (
    <>
      <PageHead title="Meer" back={false}>
        {/* Jij, in de kop als donker glas. Een eigen tab was dat niet waard: je
            opent je profiel een paar keer per jaar, niet een paar keer per dag. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={viewer ? `Profiel van ${viewer.name}` : 'Inloggen'}
          onPress={() => router.push(viewer ? '/profiel' : '/inloggen')}
          style={({ pressed }) => [styles.me, pressed && styles.pressedDark]}
        >
          {viewer?.avatarUrl ? (
            <Image source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.initials}>{viewer ? initialsOf(viewer.name) : '?'}</Text>
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.meName} numberOfLines={1}>
              {viewer?.name ?? 'Niet ingelogd'}
            </Text>
            <Text style={styles.meHint} numberOfLines={1}>
              {viewer ? 'Je profiel en meldingen' : 'Log in om te bestellen en tickets te kopen'}
            </Text>
          </View>
          <ChevronRight color={COLORS.onDarkMuted} size={18} />
        </Pressable>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Zoeken"
          onPress={() => router.push('/zoeken')}
          style={({ pressed }) => [styles.search, pressed && styles.pressedDark]}
        >
          <Search color={COLORS.muted} size={16} />
          <Text style={styles.searchText}>Zoeken op vtk.be</Text>
        </Pressable>
      </PageHead>

      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}

        <View style={styles.columns}>
          <Register title="Doen" links={doen} />
          <Register title="Mensen" links={mensen} />
        </View>
        {viewer ? (
          <Register
            title="Meldingen"
            links={[{ label: 'Wat je wil weten', hint: 'Broodjes, shiften, categorieën', onPress: () => router.push('/meldingen') }]}
          />
        ) : null}
        <Register title="Elders" links={elders} />

        <View style={styles.tiles}>
          <SectionHeading>Alles van VTK</SectionHeading>
          {bootstrap.tabs.map((tab) => (
            <TabTile
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
            <Text style={styles.hint}>Er staan nog geen onderdelen klaar.</Text>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

/**
 * Het register in de marge van de site: een kleine kop in kapitalen, een haarlijn
 * links, gedempte links met lucht ertussen.
 */
function Register({ title, links }: { title: string; links: Link[] }) {
  return (
    <View style={styles.register}>
      <Text style={styles.registerTitle}>{title}</Text>
      <View style={styles.registerLine}>
        {links.map((link) => (
          <Pressable
            key={link.label}
            accessibilityRole={link.external ? 'link' : 'button'}
            accessibilityLabel={link.external ? `${link.label}, opent een browser` : link.label}
            onPress={link.onPress}
            hitSlop={4}
            style={({ pressed }) => [styles.registerRow, pressed && styles.pressed]}
          >
            <Text style={styles.registerLabel}>{link.label}</Text>
            {link.hint ? (
              <Text style={styles.registerHint} numberOfLines={1}>
                {link.hint}
                {link.external ? ' ↗' : ''}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Een onderdeel van de site als de tegel van een categoriepagina: de foto links
 * (uit /admin/home), de naam rechts. Zonder foto het gestreepte vlak van de site.
 * Een onderdeel met items klapt uit en toont ze als register; een onderdeel met
 * een eigen scherm (Broodjes, Media) opent dat scherm.
 */
function TabTile({
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
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ expanded: expandable ? expanded : undefined }}
        onPress={openTab}
        style={({ pressed }) => [styles.tileHead, pressed && styles.pressed]}
      >
        {tab.imageUrl ? (
          <Image source={{ uri: tab.imageUrl }} style={styles.tilePhoto} contentFit="cover" />
        ) : (
          <View style={[styles.tilePhoto, styles.striped]}>
            {Array.from({ length: 8 }, (_, index) => (
              <View key={index} style={[styles.stripe, { left: index * 16 - 30 }]} />
            ))}
          </View>
        )}
        <View style={styles.tileText}>
          <Text style={styles.tileLabel}>{tab.label}</Text>
          <Text style={styles.hint}>
            {external
              ? 'Opent een andere site'
              : expandable
                ? `${tab.children.length} ${tab.children.length === 1 ? 'onderdeel' : 'onderdelen'}`
                : 'Lees meer'}
          </Text>
        </View>
        {external ? (
          <ExternalLink color={COLORS.muted} size={17} />
        ) : expandable ? (
          <ChevronDown color={COLORS.muted} size={18} style={expanded ? styles.chevronOpen : undefined} />
        ) : (
          <ChevronRight color={COLORS.muted} size={18} />
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
                style={({ pressed }) => [styles.child, pressed && styles.pressed]}
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
    </View>
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
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  pressedDark: { opacity: 0.7 },
  hint: { ...TYPE.small, color: COLORS.muted },

  // Op de navy band: donker glas, zoals de panelen op de navy banden van de site.
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  avatar: { width: 42, height: 42, borderRadius: RADIUS.pill, backgroundColor: COLORS.yellow },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  meName: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.onDark },
  meHint: { ...TYPE.small, fontSize: 12.5, color: COLORS.onDarkMuted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper,
  },
  searchText: { ...TYPE.small, fontSize: 14, color: COLORS.muted },

  columns: { flexDirection: 'row', gap: SPACING.xl },
  register: { flex: 1, gap: SPACING.sm },
  registerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  registerLine: { borderLeftWidth: 1, borderLeftColor: COLORS.line2, paddingLeft: 14 },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 7,
  },
  registerLabel: { ...TYPE.body, color: COLORS.body },
  registerHint: { ...TYPE.small, fontSize: 12.5, color: COLORS.muted, flexShrink: 1 },

  tiles: { gap: SPACING.md },
  tile: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingRight: SPACING.lg },
  tilePhoto: { width: 76, height: 76, backgroundColor: COLORS.paper2 },
  // Het gestreepte vlak van de site voor een tegel zonder foto.
  striped: { overflow: 'hidden' },
  stripe: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 7,
    backgroundColor: COLORS.paper,
    transform: [{ rotate: '35deg' }],
  },
  tileText: { flex: 1, gap: 2, paddingVertical: SPACING.sm },
  tileLabel: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 21, color: COLORS.ink },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  children: { borderTopWidth: 1, borderTopColor: COLORS.line },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  childLabel: { ...TYPE.body, color: COLORS.body, flex: 1 },
});
