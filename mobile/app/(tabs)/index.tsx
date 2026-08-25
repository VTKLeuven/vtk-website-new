import { useRouter } from 'expo-router';
import {
  BookOpen,
  ChevronRight,
  Coins,
  ExternalLink,
  Images,
  Music,
  QrCode,
  Wrench,
} from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchToday, setEventInterest } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { EventRow } from '../../src/components/EventRow';
import { Prose } from '../../src/components/Prose';
import { ServiceList } from '../../src/components/ServiceList';
import { TaskCard } from '../../src/components/TaskCard';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Home: **vandaag**.
 *
 * Dit scherm beantwoordt de twee vragen waarmee iemand de app opent: *wat is er
 * open* en *wat wacht er op mij*. In die volgorde, allebei boven de vouw.
 *
 * De vorige versie was de voorpagina van de site: fotohero, aftermovies, career,
 * partners, en jouw broodje ergens onderaan. Dat is een goede voorpagina en een
 * slecht beginscherm; op een telefoon open je de app niet om te lezen wat VTK
 * doet, maar om iets te doen. De hero is daarom een compacte donkere kop met de
 * datum, en aftermovies, career en partners staan er niet meer in. Wie de site
 * wil lezen, vindt alles onder Meer.
 *
 * Wat er wél bleef van het ontwerp van de site: de donkere kop met de gele
 * onderlijn, de witte kaarten met dunne rand op papieren grond, de gele rail voor
 * wat dringend is, en geel enkel als accent.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, viewer, gate, refresh: refreshApp } = useApp();
  const resource = useResource('vandaag', () => fetchToday(locale), locale);

  if (resource.loading) return <Loading label="VTK openen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const today = resource.data;

  /**
   * De ster meteen omzetten en pas daarna verversen. Wachten op het rondje zou
   * betekenen dat een tik op een trage verbinding een seconde lang niets lijkt te
   * doen, en dan tikt iedereen twee keer.
   */
  const toggleInterest = (id: string, next: boolean) => {
    void setEventInterest(id, next)
      .catch(() => undefined)
      .then(() => resource.refresh());
  };

  const dayLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(today.now));

  return (
    <View style={styles.root}>
      {/* De donkere kop staat buiten de scroll, net als `PageHead` elders. Zat hij
          erbinnen, dan kon je hem naar beneden trekken en verscheen er een lege
          strook; dat gebeurt nergens anders in de app. */}
      <View style={[styles.head, { paddingTop: insets.top + SPACING.lg }]}>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.kicker}>{dayLabel.toUpperCase()}</Text>
            <Text style={styles.title}>
              {today.greetingName ? `Dag ${today.greetingName}` : 'VTK Leuven'}
            </Text>
          </View>

          {viewer ? (
            <View style={styles.headActions}>
              {today.canScanTickets || today.canAcceptVouchers ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Een code scannen"
                  onPress={() => router.push('/scannen')}
                  hitSlop={10}
                  style={({ pressed }) => [styles.headButton, pressed && styles.pressedDark]}
                >
                  <QrCode color={COLORS.yellow} size={20} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Bonnetjes, ${today.vouchers ?? 0} openstaand`}
                onPress={() => router.push('/bonnetjes')}
                hitSlop={10}
                style={({ pressed }) => [styles.coins, pressed && styles.pressedDark]}
              >
                <Coins color={COLORS.yellow} size={16} />
                <Text style={styles.coinsValue}>{today.vouchers ?? 0}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => {
              void resource.refresh();
              void refreshApp();
            }}
          />
        }
      >
        {/* Openingsuren eerst. Het is de vraag die het vaakst gesteld wordt, en de
            enige reden waarom sommigen de app überhaupt openen. */}
        <Section title="Nu open">
          <ServiceList services={today.services} />
        </Section>

        {today.tasks.length > 0 ? (
          <Section title="Voor jou">
            <View style={styles.stack}>
              {today.tasks.map((task, index) => (
                <TaskCard key={`${task.kind}-${task.at ?? index}`} task={task} />
              ))}
            </View>
          </Section>
        ) : null}

        <Section>
          <Shortcuts
            onOpen={(route) => router.push(route as never)}
            onExternal={(url) => void WebBrowser.openBrowserAsync(url)}
          />
        </Section>

        {today.announcement ? (
          <Section>
            <Card>
              <Text style={styles.announceKicker}>AANKONDIGING</Text>
              <Text style={styles.cardTitle}>{today.announcement.title}</Text>
              <Prose>{today.announcement.body}</Prose>
              {today.announcement.ctaUrl ? (
                <Button
                  label={today.announcement.ctaLabel ?? 'Meer weten'}
                  variant="ghost"
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(today.announcement!.ctaUrl as string)
                  }
                />
              ) : null}
            </Card>
          </Section>
        ) : null}

        {today.upcomingEvents.length > 0 ? (
          <View style={styles.band}>
            <View style={styles.bandHead}>
              <Text style={styles.sectionTitle}>Binnenkort</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Naar de kalender"
                onPress={() => router.push('/kalender')}
                style={styles.more}
              >
                <Text style={styles.moreText}>kalender</Text>
                <ChevronRight color={COLORS.muted} size={16} />
              </Pressable>
            </View>
            <View style={styles.stack}>
              {today.upcomingEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  locale={locale}
                  onPress={() => router.push(`/evenement/${event.id}`)}
                  onToggleInterest={
                    viewer ? (next) => toggleInterest(event.id, next) : undefined
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {!viewer ? (
          <Section>
            <Card>
              <Text style={styles.cardTitle}>Log in met je VTK-account</Text>
              <Text style={styles.cardBody}>
                Zonder inloggen kan je alles lezen. Broodjes, tickets, je bonnetjes en je shiften
                vragen een account; hetzelfde als op de site, KU Leuven-login inbegrepen.
              </Text>
              <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
            </Card>
          </Section>
        ) : null}

        {viewer && !gate && today.tasks.length === 0 ? (
          <Section>
            <Text style={styles.quiet}>
              Er wacht niets op je. Wat je bestelt of koopt, verschijnt hier vanzelf.
            </Text>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/**
 * De vier dingen die geen eigen tab hebben maar wel vaak gebruikt worden, plus de
 * twee die de app verlaten.
 *
 * Cursusdienst en tijdsloten draaien op Cudi en niet op deze site, dus die
 * krijgen het pijltje naar buiten: je hoort te weten dat je in een browser
 * terechtkomt voor je tikt, niet erna. Burgieclan idem.
 */
const CUDI = 'https://cudi.vtk.be';

function Shortcuts({
  onOpen,
  onExternal,
}: {
  onOpen: (route: string) => void;
  onExternal: (url: string) => void;
}) {
  const items = [
    { key: 'shiften', label: 'Shiften', icon: <Wrench color={COLORS.navy} size={20} />, to: '/shiften' },
    { key: 'media', label: "Foto's", icon: <Images color={COLORS.navy} size={20} />, to: '/media' },
    { key: 'piano', label: 'Piano', icon: <Music color={COLORS.navy} size={20} />, to: '/piano' },
    {
      key: 'cursusdienst',
      label: 'Cursusdienst',
      icon: <BookOpen color={COLORS.navy} size={20} />,
      to: `${CUDI}/vtk/shop`,
      external: true,
    },
  ];

  return (
    <View style={styles.tiles}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.external ? `${item.label}, opent cudi.vtk.be` : item.label}
          onPress={() => (item.external ? onExternal(item.to) : onOpen(item.to))}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <View style={styles.tileTop}>
            {item.icon}
            {item.external ? <ExternalLink color={COLORS.muted} size={12} /> : null}
          </View>
          <Text style={styles.tileLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING.xxl },

  head: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  headText: { flex: 1, gap: SPACING.xs },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  coinsValue: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.onDark },
  pressedDark: { opacity: 0.6 },
  kicker: { ...TYPE.kicker, color: COLORS.yellow },
  title: { ...TYPE.pageTitle, color: COLORS.onDark },

  section: { padding: SPACING.lg, paddingBottom: 0, gap: SPACING.md },
  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  stack: { gap: SPACING.sm },

  band: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.paper2,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  bandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { ...TYPE.small, color: COLORS.muted },

  tiles: { flexDirection: 'row', gap: SPACING.sm },
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  tilePressed: { backgroundColor: COLORS.paper2 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileLabel: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },

  announceKicker: { ...TYPE.kicker, color: COLORS.muted },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  cardBody: { ...TYPE.body, color: COLORS.body },
  quiet: { ...TYPE.small, color: COLORS.muted },
});
