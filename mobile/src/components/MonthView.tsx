import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import {
  dayKeyOf,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayKey,
  weekdayLabels,
  type MonthAnchor,
} from '../monthGrid';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Hoogstens zoveel stipjes per dag; daarboven wordt het een vlek. */
const MAX_DOTS = 3;

/**
 * De maandweergave van de kalender.
 *
 * Een raster is op een telefoon niet de plek om te lezen wát er is, wel om te
 * zien wánneer er iets is: elke dag met een activiteit krijgt een stipje in de
 * kleur van zijn categorie. Wat er die dag staat, komt onder het rooster zodra je
 * de dag aantikt. Alles in één vakje proppen levert zes regels van drie letters
 * op.
 *
 * Altijd zes weken hoog, ook wanneer een maand er vijf nodig heeft. Anders
 * verspringt de lijst eronder telkens als je een maand verder bladert.
 */
export function MonthView({
  anchor,
  onAnchorChange,
  events,
  locale,
  selected,
  onSelect,
}: {
  anchor: MonthAnchor;
  onAnchorChange: (next: MonthAnchor) => void;
  events: AppCalendarEvent[];
  locale: AppLocale;
  /** De aangetikte dag (`YYYY-MM-DD`), of `null`. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const today = todayKey();

  /**
   * De categoriekleuren per dag. Een evenement over meerdere dagen zetten we op
   * zijn startdag: het rooster zegt wanneer iets begint, niet hoe lang het duurt.
   */
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const event of events) {
      const key = dayKeyOf(event.start);
      const colours = map.get(key) ?? [];
      colours.push(event.categories[0]?.colour ?? COLORS.navy);
      map.set(key, colours);
    }
    return map;
  }, [events]);

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vorige maand"
          onPress={() => onAnchorChange(shiftMonth(anchor, -1))}
          hitSlop={12}
          style={styles.arrow}
        >
          <ChevronLeft color={COLORS.ink} size={20} />
        </Pressable>

        <Text style={styles.month}>{monthLabel(anchor, locale)}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volgende maand"
          onPress={() => onAnchorChange(shiftMonth(anchor, 1))}
          hitSlop={12}
          style={styles.arrow}
        >
          <ChevronRight color={COLORS.ink} size={20} />
        </Pressable>
      </View>

      <View style={styles.weekdays}>
        {weekdays.map((label, index) => (
          <Text key={index} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const colours = byDay.get(cell.key) ?? [];
          const isToday = cell.key === today;
          const isSelected = cell.key === selected;

          return (
            <Pressable
              key={cell.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                colours.length === 0
                  ? `${cell.day}, niets gepland`
                  : `${cell.day}, ${colours.length} ${colours.length === 1 ? 'activiteit' : 'activiteiten'}`
              }
              onPress={() => onSelect(isSelected ? null : cell.key)}
              style={styles.cellWrap}
            >
              <View
                style={[
                  styles.cell,
                  isToday && styles.cellToday,
                  isSelected && styles.cellSelected,
                ]}
              >
                <Text
                  style={[
                    styles.day,
                    !cell.inMonth && styles.dayOutside,
                    isSelected && styles.daySelected,
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.dots}>
                  {colours.slice(0, MAX_DOTS).map((colour, index) => (
                    <View
                      key={index}
                      style={[
                        styles.dot,
                        { backgroundColor: colour ?? COLORS.navy },
                        // Op een geel vakje zou een geel stipje verdwijnen.
                        isSelected && styles.dotOnSelected,
                      ]}
                    />
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { padding: SPACING.xs },
  month: { ...TYPE.cardTitle, color: COLORS.ink, textTransform: 'capitalize' },
  weekdays: { flexDirection: 'row' },
  weekday: {
    ...TYPE.small,
    fontSize: 11,
    color: COLORS.muted,
    width: `${100 / 7}%`,
    textAlign: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cell: {
    flex: 1,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // Vandaag krijgt een rand, de gekozen dag een vulling. Twee verschillende
  // signalen, zodat ze naast elkaar kunnen bestaan.
  cellToday: { borderWidth: 1, borderColor: COLORS.line2 },
  cellSelected: { backgroundColor: COLORS.yellow },
  day: { ...TYPE.small, color: COLORS.ink },
  dayOutside: { color: COLORS.muted, opacity: 0.5 },
  daySelected: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOnSelected: { backgroundColor: COLORS.ink },
});
