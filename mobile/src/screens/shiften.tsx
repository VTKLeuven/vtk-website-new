
import { Globe, MapPin, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppShift } from '../api/contract';
import {
  fetchShifts,
  registerForShift,
  setShiftReplaceable,
  unregisterFromShift,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Prose } from '../components/Prose';
import { Button, Card, Empty, ErrorState, Loading, SectionTitle, StaleNotice } from '../components/ui';
import { formatDay, formatTimeRange } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * Shiften: waar je op staat, en waar je nog op kan.
 *
 * Alle regels staan op de server. Of je nog kan uitschrijven is een veld dat de
 * API meestuurt (`canUnregister`) en geen berekening hier: de 24-uursgrens en de
 * bedenktijd na een misklik horen op één plek te leven, en dat is de plek die ze
 * ook afdwingt.
 */
export default function ShiftenScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('shiften', () => fetchShifts(locale), locale);
  const weeks = useMemo(
    () => groupByWeek(resource.data?.available ?? [], locale),
    [resource.data, locale],
  );

  if (!viewer) {
    return (
      <>
        <PageHead title="Shiften" subtitle="Help mee en verdien wat" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Inschrijven op een shift hangt aan je account.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Shiften ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { mine, available } = resource.data;

  return (
    <>
      <PageHead title="Shiften" subtitle="Help mee en verdien wat" />
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
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {mine.length > 0 ? (
          <>
            <SectionTitle>Jouw shiften</SectionTitle>
            {mine.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                locale={locale}
                onChanged={() => void resource.refresh()}
              />
            ))}
          </>
        ) : null}

        <SectionTitle>Nog vrij</SectionTitle>
        {available.length === 0 ? (
          <Empty
            title="Geen vrije shiften"
            hint="Er staat nu niets open. Nieuwe shiften verschijnen hier zodra ze ingepland zijn."
          />
        ) : (
          weeks.map((week) => (
            <View key={week.key} style={styles.week}>
              <View style={styles.weekHead}>
                <Text style={styles.weekName}>{week.name}</Text>
                <Text style={styles.hint}>{week.range}</Text>
              </View>
              {week.shifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  locale={locale}
                  onChanged={() => void resource.refresh()}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

function ShiftCard({
  shift,
  locale,
  onChanged,
}: {
  shift: AppShift;
  locale: 'nl' | 'en';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // Voor het inschrijven: mag een student deze plaats later innemen? Op een
  // shift waar je al op staat, is het de opgeslagen keuze.
  const [replaceable, setReplaceable] = useState(shift.replaceable ?? false);

  const act = async (kind: 'register' | 'unregister') => {
    setBusy(true);
    try {
      if (kind === 'register') {
        await registerForShift(shift.id, { replaceable: shift.replaceableOption && replaceable });
      } else await unregisterFromShift(shift.id);
      onChanged();
    } catch (error) {
      Alert.alert(
        kind === 'register' ? 'Inschrijven lukte niet' : 'Uitschrijven lukte niet',
        shiftErrorText(error),
      );
      // Ook bij een fout opnieuw ophalen: "vol" en "al begonnen" betekenen
      // allebei dat dit scherm achterloopt.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmUnregister = () => {
    Alert.alert(
      'Uitschrijven',
      `Je schrijft je uit voor ${shift.name} op ${formatDay(shift.start, locale)}. De plaats komt weer vrij voor iemand anders.`,
      [
        { text: 'Blijven staan', style: 'cancel' },
        { text: 'Uitschrijven', style: 'destructive', onPress: () => void act('unregister') },
      ],
    );
  };

  /**
   * Achteraf omzetten: meteen tonen, en bij een fout terugzetten en het zeggen.
   * Er is geen apart opslaan; de schakelaar ís de keuze.
   */
  const toggleReplaceable = async (next: boolean) => {
    setReplaceable(next);
    try {
      await setShiftReplaceable(shift.id, next);
      onChanged();
    } catch (error) {
      setReplaceable(!next);
      Alert.alert('Niet opgeslagen', shiftErrorText(error));
    }
  };

  const free = shift.maxParticipants - shift.takenSpots;

  return (
    <Card featured={shift.registered}>
      <Text style={styles.shiftName}>{shift.name}</Text>

      <View style={styles.facts}>
        <Text style={styles.factDay}>{formatDay(shift.start, locale)}</Text>
        <Text style={styles.fact}>{formatTimeRange(shift.start, shift.end, locale)}</Text>
      </View>

      <View style={styles.factRow}>
        <MapPin color={COLORS.muted} size={15} />
        <Text style={styles.fact}>{shift.location}</Text>
      </View>
      <View style={styles.factRow}>
        <Users color={COLORS.muted} size={15} />
        <Text style={styles.fact}>
          {shift.takenSpots} van {shift.maxParticipants}
          {free > 0 ? `, nog ${free} vrij` : ', volzet'}
        </Text>
      </View>
      {shift.openToInternationals ? (
        <View style={styles.factRow}>
          <Globe color={COLORS.muted} size={15} />
          <Text style={styles.fact}>Ook zonder Nederlands</Text>
        </View>
      ) : null}

      {shift.description ? <Text style={styles.body}>{shift.description}</Text> : null}

      {shift.instructions ? (
        <>
          <Button
            label={open ? 'Minder uitleg' : 'Wat houdt dit in?'}
            variant="ghost"
            onPress={() => setOpen(!open)}
          />
          {open ? <Prose>{shift.instructions}</Prose> : null}
        </>
      ) : null}

      {shift.replaceableOption && (shift.registered || shift.canRegister) ? (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>Een student mag mijn plaats innemen</Text>
            <Text style={styles.hint}>
              Schrijft er zich een student in terwijl de shift vol is, dan neemt die je plaats in.
              Je krijgt dan een mail en hoeft niet meer te komen.
            </Text>
          </View>
          <Switch
            value={replaceable}
            onValueChange={(next) =>
              shift.registered ? void toggleReplaceable(next) : setReplaceable(next)
            }
            trackColor={{ true: COLORS.yellow, false: COLORS.line2 }}
            thumbColor={COLORS.surface}
            accessibilityLabel="Een student mag mijn plaats innemen"
          />
        </View>
      ) : null}

      {shift.registered ? (
        shift.canUnregister ? (
          <Button label="Uitschrijven" variant="ghost" busy={busy} onPress={confirmUnregister} />
        ) : (
          <Text style={styles.hint}>
            Uitschrijven kan niet meer: de shift begint binnen het etmaal. Kan je echt niet, laat
            het dan weten aan de verantwoordelijke.
          </Text>
        )
      ) : (
        <Button
          label="Inschrijven"
          busy={busy}
          disabled={!shift.canRegister}
          onPress={() => void act('register')}
        />
      )}
    </Card>
  );
}

type ShiftWeek = { key: string; name: string; range: string; shifts: AppShift[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC-middag van een Brusselse datumsleutel; zie `monthGrid.ts` voor waarom middag. */
function noonOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** De maandag van de week waarin een datumsleutel valt, als UTC-middag. */
function mondayOf(key: string): Date {
  const date = noonOf(key);
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * DAY_MS);
}

/** ISO-weeknummer van een maandag (UTC-middag). */
function isoWeek(monday: Date): number {
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstMonday = new Date(firstThursday.getTime() - ((firstThursday.getUTCDay() + 6) % 7) * DAY_MS);
  return Math.round((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
}

/**
 * De vrije shiften per week, met een kop zoals op /shift: "Deze week",
 * "Volgende week", daarna het weeknummer. De weken lopen op de klok van Brussel.
 */
function groupByWeek(shifts: AppShift[], locale: 'nl' | 'en'): ShiftWeek[] {
  const thisMonday = mondayOf(todayKey()).getTime();
  const dayMonth = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  });
  const dayOnly = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    day: 'numeric',
  });

  const weeks = new Map<number, ShiftWeek>();
  for (const shift of shifts) {
    const monday = mondayOf(dayKeyOf(shift.start));
    const offset = Math.round((monday.getTime() - thisMonday) / (7 * DAY_MS));
    let week = weeks.get(monday.getTime());
    if (!week) {
      const sunday = new Date(monday.getTime() + 6 * DAY_MS);
      const from =
        monday.getUTCMonth() === sunday.getUTCMonth() ? dayOnly.format(monday) : dayMonth.format(monday);
      week = {
        key: String(monday.getTime()),
        name:
          offset <= 0
            ? locale === 'en' ? 'This week' : 'Deze week'
            : offset === 1
              ? locale === 'en' ? 'Next week' : 'Volgende week'
              : `Week ${isoWeek(monday)}`,
        range: `${from} ${locale === 'en' ? 'to' : 'tot'} ${dayMonth.format(sunday)}`,
        shifts: [],
      };
      weeks.set(monday.getTime(), week);
    }
    week.shifts.push(shift);
  }
  return [...weeks.values()];
}

/**
 * De melding bij een geweigerde in- of uitschrijving.
 *
 * De bestaande route antwoordt met Engelse zinnen en geen codes, dus dit leest de
 * status en de tekst. Zou die route ooit codes krijgen, dan hoort dit mee te
 * veranderen; tot dan is de status het betrouwbaarste deel.
 */
function shiftErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  const text = error.message.toLowerCase();
  if (text.includes('overlap')) return 'Je staat al op een shift die hiermee overlapt.';
  if (text.includes('full')) return 'Deze shift is intussen volzet.';
  if (text.includes('started')) return 'Deze shift is al begonnen.';
  if (text.includes('already registered')) return 'Je stond hier al op ingeschreven.';
  if (text.includes('only praesidium')) return 'Enkel een praesidiumlid kan vervangen worden.';
  if (text.includes('not registered')) return 'Je staat niet (meer) op deze shift.';
  if (text.includes('closed')) return 'Deze shift is al begonnen.';
  if (error.status === 409) {
    return 'Uitschrijven kan niet meer: de shift begint binnen het etmaal.';
  }
  if (error.isNotFound) return 'Deze shift bestaat niet meer.';
  return error.message;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  shiftName: { ...TYPE.sectionTitle, color: COLORS.ink },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'baseline' },
  factDay: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fact: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  week: { gap: SPACING.md },
  // De kop van een week, met de haarlijn erboven zoals op /shift.
  weekHead: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  weekName: { ...TYPE.cardTitle, color: COLORS.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
});
