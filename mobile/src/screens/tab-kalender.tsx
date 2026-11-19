
import { Bell } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCalendar, setEventInterest } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { EventTile } from '../components/EventTile';
import { MonthView } from '../components/MonthView';
import { PlanningView } from '../components/planning/PlanningView';
import { PageHead } from '../components/PageHead';
import { Empty, ErrorState, Loading, StaleNotice, WeekHead } from '../components/ui';
import { formatDay } from '../format';
import { anchorOf, dayKeyOf, gridRange, todayKey, type MonthAnchor } from '../monthGrid';
import { displayStart, eventDayKeys } from '../moments';
import { getPref, setPref } from '../storage';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { groupByWeek } from '../weeks';

type Weergave = 'lijst' | 'maand' | 'planning';

const VIEW_KEY = 'kalender-weergave';

/** De filterchip die enkel toont wat je zelf aanduidde. */
const MINE = '__mijn__';

/**
 * De kalender, in twee weergaven, in de vorm van /kalender op de site: de
 * eventtegel met de gele datumpin, per week een kop, en de thema's als chips.
 * De tegels zijn lager dan op de site (`compact`), zodat er meer onder elkaar
 * past op een telefoon.
 *
 * **Lijst** is wat je meestal wil: wat komt er nu. **Maand** is wat je wil
 * wanneer je een datum in gedachten hebt ("wanneer was die cantus ook weer") of
 * wanneer je iets plant en wil zien welke avonden al vol zitten. Dat zijn twee
 * verschillende vragen, en geen van beide weergaven beantwoordt ze allebei goed.
 *
 * De keuze blijft bewaard. Wie de maandweergave verkiest, wil die niet elke keer
 * opnieuw aanzetten.
 *
 * **Planning** is iets anders: de planning van Burgieclan (lessenrooster,
 * deadlines en de VTK-evenementen die je erin zette) als drie dagen naast
 * elkaar. Ze staat naast de kalender en vervangt hem niet; zie `PlanningView`.
 *
 * De twee halen ook andere gegevens op: de lijst vraagt alles vanaf nu, de
 * maandweergave precies het zichtbare rooster, inclusief het verleden. Anders zou
 * bladeren naar vorige maand een leeg rooster geven.
 *
 * **De ster is geen inschrijving.** Ze zet een evenement in jouw lijst (het
 * tabblad "Mijn lijst" in de kop) en hangt er de herinnering van de dag ervoor aan. Wat ze niet
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
  const router = useTabRouter();
  const { locale, viewer } = useApp();

  const [view, setViewState] = useState<Weergave>(() => {
    const saved = getPref(VIEW_KEY);
    return saved === 'maand' || saved === 'planning' ? saved : 'lijst';
  });
  const [category, setCategory] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MonthAnchor>(() => anchorOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const setView = (next: Weergave) => {
    setPref(VIEW_KEY, next);
    setViewState(next);
  };

  // De planning vraagt een login; uitgelogd valt een bewaarde keuze terug op de lijst.
  const planning = view === 'planning' && viewer !== null;
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

  // Een reeks die al loopt, staat op haar eerstvolgende moment; de server sorteert
  // op de start van de reeks, dus hier opnieuw.
  const events = useMemo(
    () =>
      [...(resource.data?.events ?? [])].sort((a, b) =>
        displayStart(a).localeCompare(displayStart(b)),
      ),
    [resource.data],
  );

  const dayEvents = useMemo(
    () =>
      selectedDay
        ? events
            .filter((event) => eventDayKeys(event).includes(selectedDay))
            .map((event) => ({
              event,
              // Bij een reeks het moment van die dag, niet het eerstvolgende.
              at: event.moments?.find((moment) => dayKeyOf(moment.start) === selectedDay)?.start,
            }))
        : [],
    [events, selectedDay],
  );

  const weeks = useMemo(() => groupByWeek(events, (event) => displayStart(event), locale), [events, locale]);

  const headTabs = {
    onChange: (next: 'lijst' | 'maand' | 'mijn' | 'planning') => {
      if (next === 'mijn') {
        setView('lijst');
        setCategory(MINE);
      } else {
        setView(next);
        if (mine) setCategory(null);
      }
    },
    options: [
      { value: 'lijst' as const, label: 'Agenda' },
      { value: 'maand' as const, label: 'Maand' },
      ...(viewer
        ? [
            { value: 'mijn' as const, label: 'Mijn lijst' },
            { value: 'planning' as const, label: 'Planning' },
          ]
        : []),
    ],
  };

  const bell = viewer ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Meldingen instellen"
      onPress={() => router.push('/meldingen')}
      hitSlop={10}
    >
      <Bell color={COLORS.yellow} size={20} />
    </Pressable>
  ) : undefined;

  // De planning heeft haar eigen verticale scroll (de uren van de dag), dus de
  // kop staat hier vast in plaats van mee te schuiven zoals in de lijst.
  if (planning) {
    return (
      <View style={styles.root}>
        <PageHead
          title="Kalender"
          subtitle="Je lessen en VTK in één agenda"
          back={false}
          right={bell}
          tabs={{ ...headTabs, value: 'planning' }}
        />
        <PlanningView locale={locale} onOpenEvent={(id) => router.push(`/evenement/${id}`)} />
      </View>
    );
  }

  if (resource.loading) return <Loading label="Kalender ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { categories, filteredByAudience } = resource.data;
  // "Mijn lijst" staat als derde tabblad in de kop: het is een andere lijst, geen
  // thema om op te filteren.
  const headTab: 'lijst' | 'maand' | 'mijn' = mine ? 'mijn' : view === 'maand' ? 'maand' : 'lijst';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.onDark}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        <View style={styles.overscroll} />
        <PageHead
          title="Kalender"
          subtitle="Alles wat er bij VTK te doen is"
          back={false}
          right={bell}
          tabs={{ ...headTabs, value: headTab }}
        />

        {categories.length > 0 && !mine ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="Alles" active={category === null} onPress={() => setCategory(null)} />
            {categories.map((item) => (
              <Chip
                key={item.slug}
                label={item.name}
                colour={item.colour}
                active={category === item.slug}
                onPress={() => setCategory(category === item.slug ? null : item.slug)}
              />
            ))}
          </ScrollView>
        ) : null}

        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        <View style={styles.content}>
          {view === 'maand' && !mine ? (
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
                    dayEvents.map(({ event, at }) => (
                      <EventTile
                        key={event.id}
                        event={event}
                        at={at}
                        locale={locale}
                        compact
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
              action={category && !mine ? { label: 'Toon alles', onPress: () => setCategory(null) } : undefined}
            />
          ) : (
            <>
              {weeks.map((week) => (
                <View key={week.key} style={styles.week}>
                  <WeekHead name={week.name} range={week.range} />
                  {week.items.map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      locale={locale}
                      compact
                      onPress={() => router.push(`/evenement/${event.id}`)}
                      onToggleInterest={viewer ? (next) => toggleInterest(event.id, next) : undefined}
                    />
                  ))}
                </View>
              ))}
              {viewer && filteredByAudience ? (
                <Text style={styles.footer}>
                  Je ziet de evenementen die bij jouw studiejaar horen. Activiteiten voor een andere
                  doelgroep staan er niet tussen.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Een themafilter zoals de chips van /tickets: wit, met de kleur als stip, actief in inkt. */
function Chip({
  label,
  active,
  onPress,
  colour,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colour?: string | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {colour ? <View style={[styles.chipDot, { backgroundColor: colour }]} /> : null}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scrollContent: { paddingBottom: SPACING.xxl },
  // Vangt het omlaag trekken op iOS op: daar verschijnt dan navy in plaats van papier.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.navy,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.sm, gap: SPACING.md },
  week: { gap: SPACING.md, marginTop: SPACING.sm },

  chips: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.lg, paddingBottom: SPACING.xs, gap: SPACING.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipLabel: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.body },
  chipLabelActive: { color: COLORS.paper },

  dayTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.lg },
});
