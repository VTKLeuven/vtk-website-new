import { useRouter } from 'expo-router';
import { Bell, CalendarDays, List, Star } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCalendar, setEventInterest } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { EventRow } from '../../src/components/EventRow';
import { MonthView } from '../../src/components/MonthView';
import { PageHead } from '../../src/components/PageHead';
import { Empty, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatDay } from '../../src/format';
import { anchorOf, dayKeyOf, gridRange, todayKey, type MonthAnchor } from '../../src/monthGrid';
import { getPref, setPref } from '../../src/storage';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

type Weergave = 'lijst' | 'maand';

const VIEW_KEY = 'kalender-weergave';

/** De filterchip die enkel toont wat je zelf aanduidde. */
const MINE = '__mijn__';

/**
 * De kalender, in twee weergaven.
 *
 * **Lijst** is wat je meestal wil: wat komt er nu. **Maand** is wat je wil
 * wanneer je een datum in gedachten hebt ("wanneer was die cantus ook weer") of
 * wanneer je iets plant en wil zien welke avonden al vol zitten. Dat zijn twee
 * verschillende vragen, en geen van beide weergaven beantwoordt ze allebei goed.
 *
 * De keuze blijft bewaard. Wie de maandweergave verkiest, wil die niet elke keer
 * opnieuw aanzetten.
 *
 * De twee halen ook andere gegevens op: de lijst vraagt alles vanaf nu, de
 * maandweergave precies het zichtbare rooster, inclusief het verleden. Anders zou
 * bladeren naar vorige maand een leeg rooster geven.
 *
 * **De ster is geen inschrijving.** Ze zet een evenement in jouw lijst (de chip
 * "Mijn lijst") en hangt er de herinnering van de dag ervoor aan. Wat ze niet
 * doet: een plaats reserveren, een ticket kopen of iemand laten weten dat je
 * komt. Dat onderscheid is de reden dat ze naast de rij staat en niet de rij zelf
 * is.
 *
 * Naast de ster staat een belknop in de kop: die opent de meldingen, waar je een
 * categorie kan volgen. Interesse gaat over één evenement, een categorie volgen
 * over alles wat er nog bij komt; die twee verwarren is de makkelijkste manier om
 * te veel of te weinig berichten te krijgen.
 */
export default function KalenderScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();

  const [view, setViewState] = useState<Weergave>(() =>
    getPref(VIEW_KEY) === 'maand' ? 'maand' : 'lijst',
  );
  const [category, setCategory] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MonthAnchor>(() => anchorOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const setView = (next: Weergave) => {
    setPref(VIEW_KEY, next);
    setViewState(next);
  };

  const range = view === 'maand' ? gridRange(anchor) : null;
  const mine = category === MINE;

  const resource = useResource(
    'kalender',
    () =>
      fetchCalendar(locale, {
        categorie: mine ? undefined : (category ?? undefined),
        interesse: mine,
        van: range?.from,
        tot: range?.to,
      }),
    `${locale}:${category ?? ''}:${range ? `${range.from}-${range.to}` : 'nu'}`,
  );

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

  const events = useMemo(() => resource.data?.events ?? [], [resource.data]);

  const dayEvents = useMemo(
    () => (selectedDay ? events.filter((event) => dayKeyOf(event.start) === selectedDay) : []),
    [events, selectedDay],
  );

  if (resource.loading) return <Loading label="Kalender ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { categories, filteredByAudience } = resource.data;

  return (
    <>
      <PageHead
        title="Kalender"
        subtitle="Alles wat er te doen is"
        back={false}
        right={
          <View style={styles.headActions}>
            {viewer ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Meldingen instellen"
                onPress={() => router.push('/meldingen')}
                hitSlop={10}
              >
                <Bell color={COLORS.yellow} size={20} />
              </Pressable>
            ) : null}
            <View style={styles.toggle}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: view === 'lijst' }}
              accessibilityLabel="Lijstweergave"
              onPress={() => setView('lijst')}
              style={[styles.toggleButton, view === 'lijst' && styles.toggleActive]}
            >
              <List color={view === 'lijst' ? COLORS.ink : COLORS.onDarkMuted} size={17} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: view === 'maand' }}
              accessibilityLabel="Maandweergave"
              onPress={() => setView('maand')}
              style={[styles.toggleButton, view === 'maand' && styles.toggleActive]}
            >
              <CalendarDays
                color={view === 'maand' ? COLORS.ink : COLORS.onDarkMuted}
                size={17}
              />
            </Pressable>
            </View>
          </View>
        }
      />

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipBar}
        >
          <Chip label="Alles" active={category === null} onPress={() => setCategory(null)} />
          {viewer ? (
            <Chip
              label="Mijn lijst"
              icon={<Star color={mine ? COLORS.ink : COLORS.body} size={13} fill={mine ? COLORS.ink : 'transparent'} />}
              active={mine}
              onPress={() => setCategory(mine ? null : MINE)}
            />
          ) : null}
          {categories.map((item) => (
            <Chip
              key={item.slug}
              label={item.name}
              active={category === item.slug}
              onPress={() => setCategory(category === item.slug ? null : item.slug)}
            />
          ))}
        </ScrollView>
      ) : null}

      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {view === 'maand' ? (
          <>
            <MonthView
              anchor={anchor}
              onAnchorChange={(next) => {
                setAnchor(next);
                setSelectedDay(null);
              }}
              events={events}
              locale={locale}
              selected={selectedDay}
              onSelect={setSelectedDay}
            />

            {selectedDay ? (
              <>
                <Text style={styles.dayTitle}>
                  {formatDay(`${selectedDay}T12:00:00.000Z`, locale)}
                </Text>
                {dayEvents.length === 0 ? (
                  <Text style={styles.hint}>Niets gepland op deze dag.</Text>
                ) : (
                  dayEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      locale={locale}
                      onPress={() => router.push(`/evenement/${event.id}`)}
                      onToggleInterest={
                        viewer ? (next) => toggleInterest(event.id, next) : undefined
                      }
                    />
                  ))
                )}
              </>
            ) : (
              <Text style={styles.hint}>
                Tik een dag aan om te zien wat er die dag te doen is.
              </Text>
            )}
          </>
        ) : events.length === 0 ? (
          <Empty
            title="Niets gevonden"
            hint={
              mine
                ? 'Je hebt nog niets aangeduid. Tik het sterretje bij een evenement en het komt hier te staan.'
                : category
                  ? 'Er staat niets in deze categorie. Zet de filter op Alles om de rest te zien.'
                  : 'Er staat nog niets gepland.'
            }
            action={category ? { label: 'Toon alles', onPress: () => setCategory(null) } : undefined}
          />
        ) : (
          <>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                locale={locale}
                onPress={() => router.push(`/evenement/${event.id}`)}
                onToggleInterest={viewer ? (next) => toggleInterest(event.id, next) : undefined}
              />
            ))}
            {viewer && filteredByAudience ? (
              <Text style={styles.footer}>
                Je ziet de evenementen die bij jouw studiejaar horen. Activiteiten voor een andere
                doelgroep staan er niet tussen.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },

  // De schakelaar staat in de donkere paginakop, dus de inactieve kant gebruikt
  // de gedempte kleur voor een donkere band.
  headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  toggle: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: RADIUS.pill,
    padding: 2,
  },
  toggleButton: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  toggleActive: { backgroundColor: COLORS.yellow },

  chipBar: {
    flexGrow: 0,
    backgroundColor: COLORS.paper,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  chips: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipLabel: { ...TYPE.small, color: COLORS.body },
  chipLabelActive: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },

  dayTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.lg },
});
