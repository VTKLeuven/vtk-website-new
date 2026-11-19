import { Image } from 'expo-image';
import { Coins, ExternalLink, QrCode } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchToday, setEventInterest } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { EventTile } from '../components/EventTile';
import { PageHead } from '../components/PageHead';
import { Prose } from '../components/Prose';
import { ServiceList } from '../components/ServiceList';
import { TaskCard } from '../components/TaskCard';
import { Button, Card, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { formatVouchers } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Home: **vandaag**, in de banden van de homepage.
 *
 * Dit scherm beantwoordt de twee vragen waarmee iemand de app opent: *wat is er
 * open* en *wat wacht er op mij*. In die volgorde, allebei boven de vouw.
 *
 * De opbouw volgt de homepage van vtk.be (voorstel A van november 2026): een
 * navy kop met het technische patroon en de gele onderlijn, met de openingsuren
 * erin als "zonder kader"; daarna "Voor jou" als register op papier, de
 * aankomende evenementen als de eventtegels van de site op een lichtblauwe band,
 * en "Snel naar" als de kaarten van "Wat we doen", met een foto en de gele lijn.
 *
 * De kop scrolt mee en staat niet vast: met de openingsuren erin is ze te hoog om
 * het halve scherm te blijven innemen. Een navy vlak boven de inhoud vangt het
 * omlaag trekken op, zodat er geen papieren strook boven de kop verschijnt.
 */
export default function HomeScreen() {
  const router = useTabRouter();
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
  const kicker = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.onDark}
            onRefresh={() => {
              void resource.refresh();
              void refreshApp();
            }}
          />
        }
      >
        <View style={styles.overscroll} />
        <PageHead
          title={today.greetingName ? `Dag ${today.greetingName}` : 'VTK Leuven'}
          kicker={kicker}
          back={false}
          right={
            viewer ? (
              <View style={styles.headActions}>
                {today.canScanTickets || today.canAcceptVouchers ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Een code scannen"
                    onPress={() => router.push('/scannen')}
                    hitSlop={10}
                    style={({ pressed }) => [styles.glassButton, pressed && styles.pressedDark]}
                  >
                    <QrCode color={COLORS.yellow} size={18} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Bonnetjes, ${formatVouchers(today.vouchers ?? 0, locale)} openstaand`}
                  onPress={() => router.push('/bonnetjes')}
                  hitSlop={10}
                  style={({ pressed }) => [styles.glass, pressed && styles.pressedDark]}
                >
                  <Coins color={COLORS.yellow} size={15} />
                  <Text style={styles.glassText}>{formatVouchers(today.vouchers ?? 0, locale)}</Text>
                </Pressable>
              </View>
            ) : undefined
          }
        >
          <View style={styles.hours}>
            <ServiceList services={today.services} />
          </View>
        </PageHead>

        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {today.tasks.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.pad}>
              <SectionHeading>Voor jou</SectionHeading>
            </View>
            <View style={styles.register}>
              {today.tasks.map((task, index) => (
                <TaskCard key={`${task.kind}-${task.at ?? index}`} task={task} />
              ))}
            </View>
          </View>
        ) : null}

        {today.announcement ? (
          <View style={[styles.section, styles.pad]}>
            <Card featured>
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
          </View>
        ) : null}

        {today.upcomingEvents.length > 0 ? (
          <View style={styles.band}>
            <View style={styles.pad}>
              <SectionHeading
                right={
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Naar de kalender"
                    onPress={() => router.push('/kalender')}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>Kalender →</Text>
                  </Pressable>
                }
              >
                Aankomende evenementen
              </SectionHeading>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              decelerationRate="fast"
              snapToInterval={292 + SPACING.md}
            >
              {today.upcomingEvents.map((event) => (
                <EventTile
                  key={event.id}
                  event={event}
                  locale={locale}
                  width={292}
                  onPress={() => router.push(`/evenement/${event.id}`)}
                  onToggleInterest={viewer ? (next) => toggleInterest(event.id, next) : undefined}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.section, styles.pad]}>
          <SectionHeading>Snel naar</SectionHeading>
          <Shortcuts
            onOpen={(route) => router.push(route as never)}
            onExternal={(url) => void WebBrowser.openBrowserAsync(url)}
          />
        </View>

        {!viewer ? (
          <View style={[styles.section, styles.pad]}>
            <Card featured>
              <Text style={styles.cardTitle}>Log in met je VTK-account</Text>
              <Text style={styles.cardBody}>
                Zonder inloggen kan je alles lezen. Broodjes, tickets, je bonnetjes en je shiften
                vragen een account; hetzelfde als op de site, KU Leuven-login inbegrepen.
              </Text>
              <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
            </Card>
          </View>
        ) : null}

        {viewer && !gate && today.tasks.length === 0 ? (
          <View style={[styles.section, styles.pad]}>
            <Text style={styles.quiet}>
              Er wacht niets op je. Wat je bestelt of koopt, verschijnt hier vanzelf.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * De dingen die geen eigen tab hebben maar wel vaak gebruikt worden, als de
 * kaarten van "Wat we doen" op de homepage: een foto bovenaan, de titel met de
 * gele lijn. Lokalen staat er niet bij: dat heeft een eigen plek onder Studeren.
 *
 * De cursusdienst draait op Cudi en niet op deze site, dus die krijgt het pijltje
 * naar buiten: je hoort te weten dat je in een browser terechtkomt voor je tikt.
 */
const CUDI = 'https://cudi.vtk.be';

const SHORTCUTS: {
  key: string;
  label: string;
  to: string;
  photo: number;
  external?: boolean;
}[] = [
  { key: 'broodjes', label: 'Broodjes', to: '/broodjes', photo: require('../../assets/snel/theokot.jpg') },
  { key: 'shiften', label: 'Shiften', to: '/shiften', photo: require('../../assets/snel/onderwijs.jpg') },
  { key: 'media', label: "Foto's", to: '/media', photo: require('../../assets/snel/sport.jpg') },
  {
    key: 'cursusdienst',
    label: 'Cursusdienst',
    to: `${CUDI}/vtk/shop`,
    photo: require('../../assets/snel/cursusdienst.jpg'),
    external: true,
  },
];

function Shortcuts({
  onOpen,
  onExternal,
}: {
  onOpen: (route: string) => void;
  onExternal: (url: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {SHORTCUTS.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.external ? `${item.label}, opent cudi.vtk.be` : item.label}
          onPress={() => (item.external ? onExternal(item.to) : onOpen(item.to))}
          style={({ pressed }) => [styles.aanbod, pressed && styles.aanbodPressed]}
        >
          <Image source={item.photo} style={styles.aanbodPhoto} contentFit="cover" />
          <View style={styles.aanbodBody}>
            <View style={styles.aanbodTitle}>
              <Text style={styles.aanbodLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            {item.external ? (
              <ExternalLink color={COLORS.muted} size={13} />
            ) : (
              <Text style={styles.ontdek}>Ontdek</Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING.xxl },
  // Vangt het omlaag trekken op iOS op: daar verschijnt dan navy in plaats van papier.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.navy,
  },

  headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // Op een navy band zijn panelen "dark glass", zoals op de site.
  glassButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.onDark },
  pressedDark: { opacity: 0.6 },
  hours: { marginTop: SPACING.xl },

  section: { marginTop: SPACING.xl, gap: SPACING.md },
  pad: { paddingHorizontal: SPACING.xl - 4 },
  register: { borderTopWidth: 1, borderTopColor: COLORS.line },

  band: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.paper2,
    paddingVertical: SPACING.xl,
    gap: SPACING.lg,
  },
  link: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.navy },
  carousel: { gap: SPACING.md, paddingHorizontal: SPACING.xl - 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  aanbod: {
    width: '47.8%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  aanbodPressed: { borderColor: COLORS.line2, opacity: 0.92 },
  aanbodPhoto: { width: '100%', aspectRatio: 16 / 9, backgroundColor: COLORS.paper2 },
  aanbodBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.md,
  },
  aanbodTitle: {
    flexShrink: 1,
    paddingBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  aanbodLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  ontdek: { ...TYPE.small, fontSize: 12, color: COLORS.muted },

  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  cardBody: { ...TYPE.body, color: COLORS.body },
  quiet: { ...TYPE.small, color: COLORS.muted },
});
