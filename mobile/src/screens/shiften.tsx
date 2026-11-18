import { ChevronDown, Globe } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppShift } from '../api/contract';
import {
  fetchShifts,
  registerForShift,
  setShiftReplaceable,
  unregisterFromShift,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { DatePin } from '../components/DatePin';
import { PageHead } from '../components/PageHead';
import { Prose } from '../components/Prose';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice, WeekHead } from '../components/ui';
import { formatDay, formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { groupByWeek } from '../weeks';

/**
 * Shiften: de agenda van /shift.
 *
 * Alles onder elkaar, per week een kop en per dag een kaart met de gele
 * datumpin; de shiften zijn rijen met het uur, de naam, de plaats en een teller
 * (1/3), en een knop om in te schrijven. Tik een rij aan voor de uitleg, de keuze
 * om je plaats af te staan en uitschrijven. Je eigen shiften staan ertussen, met
 * de gele rail, zoals op de site; een aparte lijst erboven herhaalde ze enkel.
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
  const weeks = useMemo(() => {
    const all = [...(resource.data?.mine ?? []), ...(resource.data?.available ?? [])].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    return groupByWeek(all, (shift) => shift.start, locale).map((week) => ({
      ...week,
      days: groupByDay(week.items),
    }));
  }, [resource.data, locale]);

  if (!viewer) {
    return (
      <>
        <PageHead title="Shiften" subtitle="Help mee en verdien bonnetjes" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Inschrijven op een shift hangt aan je account.</Text>
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

  return (
    <>
      <PageHead title="Shiften" subtitle="Help mee en verdien bonnetjes" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {weeks.length === 0 ? (
          <Empty
            title="Geen shiften"
            hint="Er staat nu niets open. Nieuwe shiften verschijnen hier zodra ze ingepland zijn."
          />
        ) : null}

        {weeks.map((week) => (
          <View key={week.key} style={styles.week}>
            <WeekHead name={week.name} range={week.range} />
            {week.days.map((day) => (
              <View key={day.key} style={styles.day}>
                <View style={styles.dayHead}>
                  <DatePin iso={day.shifts[0].start} locale={locale} size="sm" month={false} />
                  <View style={styles.flex}>
                    <Text style={styles.dayName}>{dayName(day.key, day.shifts[0].start, locale)}</Text>
                    <Text style={styles.hint}>
                      {day.shifts.length === 1 ? '1 shift' : `${day.shifts.length} shiften`}
                      {day.shifts.some((shift) => shift.registered) ? ', jij staat erop' : ''}
                    </Text>
                  </View>
                </View>
                {day.shifts.map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    locale={locale}
                    onChanged={() => void resource.refresh()}
                  />
                ))}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function groupByDay(shifts: AppShift[]): { key: string; shifts: AppShift[] }[] {
  const days = new Map<string, AppShift[]>();
  for (const shift of shifts) {
    const key = dayKeyOf(shift.start);
    days.set(key, [...(days.get(key) ?? []), shift]);
  }
  return [...days.entries()].map(([key, items]) => ({ key, shifts: items }));
}

/** "Vandaag", "Morgen", anders de weekdag. */
function dayName(key: string, iso: string, locale: 'nl' | 'en'): string {
  const today = todayKey();
  const tomorrow = todayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (key === today) return locale === 'en' ? 'Today' : 'Vandaag';
  if (key === tomorrow) return locale === 'en' ? 'Tomorrow' : 'Morgen';
  const name = new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function ShiftRow({
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

  const full = shift.takenSpots >= shift.maxParticipants;

  return (
    <View style={[styles.shift, shift.registered && styles.mine]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${shift.name}, ${formatTime(shift.start, locale)}`}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.shiftRow, pressed && styles.pressed]}
      >
        <Text style={styles.time}>
          {formatTime(shift.start, locale)}
          {'\n'}
          <Text style={styles.timeEnd}>{formatTime(shift.end, locale)}</Text>
        </Text>
        <View style={styles.flex}>
          <Text style={styles.shiftName} numberOfLines={1}>
            {shift.name}
          </Text>
          <Text style={styles.hint} numberOfLines={1}>
            {shift.location}{'  '}
            <Text style={styles.count}>
              {shift.takenSpots}/{shift.maxParticipants}
            </Text>
          </Text>
        </View>
        {shift.registered ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>Ingeschreven</Text>
          </View>
        ) : shift.canRegister ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Inschrijven voor ${shift.name}`}
            disabled={busy}
            onPress={() => void act('register')}
            hitSlop={6}
            style={({ pressed }) => [styles.go, (busy || pressed) && styles.pressed]}
          >
            <Text style={styles.goText}>Schrijf in</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>{full ? 'Volzet' : 'Gesloten'}</Text>
        )}
        <ChevronDown color={COLORS.muted} size={15} style={open ? styles.chevronOpen : undefined} />
      </Pressable>

      {open ? (
        <View style={styles.details}>
          {shift.openToInternationals ? (
            <View style={styles.factRow}>
              <Globe color={COLORS.muted} size={14} />
              <Text style={styles.hint}>Ook zonder Nederlands</Text>
            </View>
          ) : null}
          {shift.description ? <Text style={styles.body}>{shift.description}</Text> : null}
          {shift.instructions ? <Prose>{shift.instructions}</Prose> : null}

          {shift.replaceableOption && (shift.registered || shift.canRegister) ? (
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Een student mag mijn plaats innemen</Text>
                <Text style={styles.hint}>
                  Schrijft er zich een student in terwijl de shift vol is, dan neemt die je plaats
                  in. Je krijgt dan een mail en hoeft niet meer te komen.
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
                Uitschrijven kan niet meer: de shift begint binnen het etmaal. Kan je echt niet,
                laat het dan weten aan de verantwoordelijke.
              </Text>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
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
  content: { padding: SPACING.xl - 4, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  pressed: { opacity: 0.7 },

  week: { gap: SPACING.sm },
  day: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  dayName: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },

  shift: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  // Je eigen shift: de gele rail van de site.
  mine: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  time: {
    width: 46,
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    lineHeight: 17,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  timeEnd: { fontFamily: FONTS.regular, color: COLORS.muted },
  shiftName: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  count: { fontVariant: ['tabular-nums'], color: COLORS.body },
  go: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.paper },
  tag: {
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  details: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  switchLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
});
