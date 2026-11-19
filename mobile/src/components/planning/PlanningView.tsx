import { useFocusEffect } from 'expo-router';
import { AlertTriangle, CalendarPlus, Check, Flag, Settings2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { AppLocale } from '../../api/contract';
import { messageFor } from '../../api/useResource';
import {
  contentByDay,
  dayNumber,
  dayRange,
  isoWeek,
  monthSpan,
  place,
  weekdayOf,
  weekdayShort,
  type Block,
  type Chip,
  type DayContent,
  type Ref,
} from '../../planning/grid';
import { usePlanning } from '../../planning/usePlanning';
import { getPref, setPref } from '../../storage';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Empty, ErrorState, Loading, StaleNotice } from '../ui';
import { DetailSheet, ExportSheet, selectionOf, SettingsSheet, SetupForm, Sheet, type Selection } from './PlanningSheets';

const GUTTER = 44;
const HOUR = 52;
const DAY_HEIGHT = 24 * HOUR;
const VISIBLE_DAYS = 3;
const CHIP_ROW = 20;
const SHOW_HIDDEN_KEY = 'planning-verborgen';

const nowFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Vandaag en het uur in Leuven, wat de klok van de telefoon ook zegt. */
function nowInLeuven(): { date: string; minutes: number } {
  const part = (type: string) => nowFormat.formatToParts(new Date()).find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

const BLOCK_STYLE = {
  lecture: { backgroundColor: PLANNING.lectureBg, borderColor: PLANNING.lectureBorder, color: PLANNING.lectureText },
  practice: { backgroundColor: PLANNING.practiceBg, borderColor: PLANNING.practiceBorder, color: PLANNING.practiceText },
  other: { backgroundColor: PLANNING.otherBg, borderColor: PLANNING.otherBorder, color: PLANNING.otherText },
  vtk: { backgroundColor: COLORS.surface, borderColor: COLORS.line2, color: COLORS.navy },
} as const;

/**
 * De planning van Burgieclan in de kalender: drie dagen naast elkaar, verticaal
 * door alle uren van de dag, horizontaal per dag verder. Bovenaan elke dag een
 * strook voor wat geen uur heeft (deadlines, iets dat de hele dag duurt).
 *
 * **Dit is de planning van Burgieclan, niet een kopie ervan.** Alles wat hier
 * gebeurt, gaat via de site naar Burgieclan (`usePlanning`); afvinken in de app
 * is afvinken op burgieclan.be. Een VTK-evenement zet je erin vanaf zijn eigen
 * scherm ("In mijn planning").
 *
 * Waarom drie dagen en geen week: zeven kolommen op een telefoon zijn elk 50
 * punten breed, en daarin past geen vaknaam. Drie is wat je vandaag en morgen
 * nodig hebt, en vegen brengt je verder.
 */
export function PlanningView({ locale, onOpenEvent }: { locale: AppLocale; onOpenEvent: (id: string) => void }) {
  const handle = usePlanning(locale);
  const { resource, data } = handle;
  const [selection, setSelection] = useState<Selection>(null);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [showHidden, setShowHiddenState] = useState(() => getPref(SHOW_HIDDEN_KEY) === '1');

  // Terug op dit scherm (na een evenement in je planning gezet te hebben): opnieuw.
  const refresh = resource.refresh;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refresh();
      focusedOnce.current = true;
    }, [refresh]),
  );

  const days = useMemo(() => (data ? dayRange(data) : []), [data]);
  const content = useMemo(() => (data ? contentByDay(data, showHidden) : new Map<string, DayContent>()), [data, showHidden]);

  if (resource.loading && !data) return <Loading label="Planning ophalen" />;
  if (!data) {
    return <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />;
  }

  if (!data.available) {
    return (
      <View style={styles.padded}>
        <Empty
          title="Planning nog niet beschikbaar"
          hint="De koppeling met Burgieclan staat op deze server nog niet aan."
        />
      </View>
    );
  }

  if (!data.subscribed) {
    return (
      <ScrollView
        contentContainerStyle={styles.padded}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />}
      >
        <Text style={styles.setupTitle}>Je lessenrooster en VTK in één agenda</Text>
        <Text style={styles.setupText}>
          Koppel je KU Leuven-lessenrooster één keer. Je planning is dezelfde als die op Burgieclan:
          vink lessen af, verberg de groepen waar je niet naartoe gaat, zet VTK-evenementen erbij, en
          abonneer je agenda-app op het geheel.
        </Text>
        <SetupForm handle={handle} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
      {data.syncError ? (
        <Pressable style={styles.warning} onPress={() => setSettings(true)} accessibilityRole="button">
          <AlertTriangle size={16} color={COLORS.ink} />
          <Text style={styles.warningText}>
            Je lessenrooster kon niet bijgewerkt worden: {data.syncError} Tik om opnieuw te proberen of
            een andere link te koppelen.
          </Text>
        </Pressable>
      ) : null}

      <Grid
        key={data.today}
        planningToday={data.today}
        content={content}
        days={days}
        refreshing={resource.refreshing}
        onRefresh={() => void resource.refresh()}
        onSelect={(ref) => setSelection(selectionOf(ref))}
        toolbarRight={
          <>
            <IconButton label="Exporteren naar je agenda" onPress={() => setExporting(true)}>
              <CalendarPlus size={19} color={COLORS.ink} />
            </IconButton>
            <IconButton label="Instellingen van de planning" onPress={() => setSettings(true)}>
              <Settings2 size={19} color={COLORS.ink} />
            </IconButton>
          </>
        }
      />

      <DetailSheet handle={handle} selection={selection} onClose={() => setSelection(null)} onOpenEvent={onOpenEvent} />
      <ExportSheet visible={exporting} handle={handle} onClose={() => setExporting(false)} />
      <SettingsSheet
        visible={settings}
        handle={handle}
        showHidden={showHidden}
        onToggleHidden={() => {
          setPref(SHOW_HIDDEN_KEY, showHidden ? '0' : '1');
          setShowHiddenState(!showHidden);
        }}
        onChangeLink={() => {
          setSettings(false);
          setRelinking(true);
        }}
        onClose={() => setSettings(false)}
      />
      <Sheet visible={relinking} title="Ander lessenrooster koppelen" onClose={() => setRelinking(false)}>
        <Text style={styles.setupText}>
          Met een andere link begint een nieuw rooster: wat je bij lessen aanduidde, gaat weg. Je
          wekelijkse regels, je deadlines en je VTK-evenementen blijven.
        </Text>
        <SetupForm handle={handle} initial={data.icsUrl} onDone={() => setRelinking(false)} />
      </Sheet>
    </View>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function Grid({
  planningToday,
  days,
  content,
  refreshing,
  onRefresh,
  onSelect,
  toolbarRight,
}: {
  planningToday: string;
  days: string[];
  content: Map<string, DayContent>;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (ref: Ref) => void;
  toolbarRight: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const column = (width - GUTTER) / VISIBLE_DAYS;
  const todayIndex = Math.max(0, days.indexOf(planningToday));
  const [first, setFirst] = useState(todayIndex);
  const [now, setNow] = useState(nowInLeuven);
  const [scrollX] = useState(() => new Animated.Value(todayIndex * column));
  const list = useRef<FlatList<string>>(null);
  const vertical = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(nowInLeuven()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Open op het uur dat ertoe doet: een uur voor nu, of 's ochtends om half acht.
  const initialY = useMemo(() => {
    const start = Math.min(Math.max(nowInLeuven().minutes - 60, 7.5 * 60), 17 * 60);
    return (start / 60) * HOUR;
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => vertical.current?.scrollTo({ y: initialY, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [initialY]);

  const chipRows = useMemo(() => {
    let most = 0;
    for (const day of content.values()) most = Math.max(most, day.chips.length);
    return Math.min(most, 2);
  }, [content]);

  const visible = days.slice(first, first + VISIBLE_DAYS);
  const label = visible.length > 0 ? monthSpan(visible[0], visible[visible.length - 1]) : '';

  const goToday = () => {
    list.current?.scrollToIndex({ index: todayIndex, animated: true });
    setFirst(todayIndex);
  };

  const onSettle = (x: number) => setFirst(Math.max(0, Math.min(days.length - 1, Math.round(x / column))));

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLabel}>
          <Text style={styles.month}>{label}</Text>
          {visible[0] ? <Text style={styles.week}>Week {isoWeek(visible[0])}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: first === todayIndex }}
          onPress={goToday}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
        >
          <Text style={styles.todayLabel}>Vandaag</Text>
        </Pressable>
        {toolbarRight}
      </View>

      {/* De dagkoppen schuiven mee met het raster eronder, op de native thread. */}
      <View style={styles.headRow}>
        <View style={{ width: GUTTER }} />
        <View style={styles.headClip}>
          <Animated.View
            style={{
              flexDirection: 'row',
              width: column * days.length,
              transform: [{ translateX: Animated.multiply(scrollX, -1) }],
            }}
          >
            {days.map((date) => (
              <DayHead
                key={date}
                date={date}
                width={column}
                today={date === now.date}
                chips={content.get(date)?.chips ?? []}
                chipRows={chipRows}
                onSelect={onSelect}
              />
            ))}
          </Animated.View>
        </View>
      </View>

      <ScrollView
        ref={vertical}
        style={styles.root}
        contentOffset={{ x: 0, y: initialY }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.body}>
          <View style={styles.gutter}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <Text key={h} style={[styles.hour, { top: h * HOUR - 7 }]}>
                {String(h).padStart(2, '0')}:00
              </Text>
            ))}
          </View>
          <View style={styles.columns}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <View key={h} pointerEvents="none" style={[styles.hourLine, { top: h * HOUR }]} />
            ))}
            <Animated.FlatList
              ref={list}
              horizontal
              data={days}
              keyExtractor={(date) => date}
              getItemLayout={(_, index) => ({ length: column, offset: column * index, index })}
              initialScrollIndex={todayIndex}
              snapToInterval={column}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              initialNumToRender={VISIBLE_DAYS + 4}
              maxToRenderPerBatch={6}
              windowSize={7}
              scrollEventThrottle={16}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
              onMomentumScrollEnd={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              onScrollEndDrag={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              extraData={`${now.date}:${now.minutes}:${content.size}`}
              renderItem={({ item }) => (
                <DayColumn
                  date={item}
                  width={column}
                  blocks={content.get(item)?.blocks ?? []}
                  nowMinutes={item === now.date ? now.minutes : null}
                  onSelect={onSelect}
                />
              )}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DayHead({
  date,
  width,
  today,
  chips,
  chipRows,
  onSelect,
}: {
  date: string;
  width: number;
  today: boolean;
  chips: Chip[];
  chipRows: number;
  onSelect: (ref: Ref) => void;
}) {
  const shown = chips.length > chipRows ? chips.slice(0, Math.max(chipRows - 1, 0)) : chips;
  const more = chips.length - shown.length;
  const weekend = weekdayOf(date) >= 5;
  return (
    <View style={[styles.dayHead, { width }]}>
      <View style={styles.dayLabel}>
        <Text style={[styles.dayName, weekend && styles.muted]}>{weekdayShort(date)}</Text>
        <View style={[styles.dayNumber, today && styles.dayNumberToday]}>
          <Text style={[styles.dayNumberText, today && styles.dayNumberTextToday]}>{dayNumber(date)}</Text>
        </View>
      </View>
      {chipRows > 0 ? (
        <View style={{ height: chipRows * CHIP_ROW + 2, gap: 2 }}>
          {shown.map((chip) => (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              onPress={() => onSelect(chip.ref)}
              style={[styles.chip, chip.vtk && styles.chipVtk, chip.done && styles.done]}
            >
              <Text numberOfLines={1} style={[styles.chipText, chip.done && styles.struck]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
          {more > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Nog ${more} op deze dag`}
              onPress={() => onSelect(chips[shown.length].ref)}
              style={styles.chip}
            >
              <Text numberOfLines={1} style={styles.chipText}>
                +{more} meer
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const DayColumn = memo(function DayColumn({
  date,
  width,
  blocks,
  nowMinutes,
  onSelect,
}: {
  date: string;
  width: number;
  blocks: Block[];
  nowMinutes: number | null;
  onSelect: (ref: Ref) => void;
}) {
  const placed = useMemo(() => place(blocks), [blocks]);
  const weekend = weekdayOf(date) >= 5;
  return (
    <View style={[styles.column, { width }, weekend && styles.weekend]}>
      {placed.map((block) => {
        const top = (block.startMin / 60) * HOUR + 1;
        const height = Math.max(24, ((block.endMin - block.startMin) / 60) * HOUR - 2);
        const look = BLOCK_STYLE[block.tone];
        const laneWidth = width / block.lanes;
        const lines = Math.max(1, Math.floor((height - 18) / 15));
        return (
          <Pressable
            key={block.key}
            accessibilityRole="button"
            accessibilityLabel={[
              block.title,
              block.time,
              block.place,
              block.mandatory ? 'verplicht' : null,
              block.done ? 'afgevinkt' : null,
              block.hidden ? 'verborgen' : null,
            ]
              .filter(Boolean)
              .join(', ')}
            onPress={() => onSelect(block.ref)}
            style={({ pressed }) => [
              styles.block,
              {
                top,
                height,
                left: block.lane * laneWidth + 2,
                width: laneWidth - 4,
                backgroundColor: look.backgroundColor,
                borderColor: look.borderColor,
              },
              block.tone === 'vtk' && styles.blockVtk,
              block.mandatory && styles.blockMandatory,
              block.done && styles.done,
              block.hidden && styles.blockHidden,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.blockTop}>
              {block.time ? <Text style={[styles.blockTime, { color: look.color }]}>{block.time}</Text> : null}
              {block.mandatory ? <Flag size={10} color={PLANNING.danger} /> : null}
              {block.done ? <Check size={11} color={look.color} /> : null}
            </View>
            <Text numberOfLines={lines} style={[styles.blockTitle, block.done && styles.struck]}>
              {block.title}
            </Text>
            {height > 70 && block.place ? (
              <Text numberOfLines={1} style={[styles.blockPlace, { color: look.color }]}>
                {block.place}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {nowMinutes !== null ? (
        <View pointerEvents="none" style={[styles.nowLine, { top: (nowMinutes / 60) * HOUR }]}>
          <View style={styles.nowDot} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  padded: { padding: SPACING.xl - 4, gap: SPACING.md },
  pressed: { opacity: 0.7 },
  muted: { color: COLORS.muted },

  setupTitle: { ...TYPE.heading, color: COLORS.ink },
  setupText: { ...TYPE.body, color: COLORS.body },

  warning: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
  },
  warningText: { ...TYPE.small, color: COLORS.ink, flex: 1 },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  toolbarLabel: { flex: 1 },
  month: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink },
  week: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  todayButton: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  todayLabel: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.ink },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },

  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
    backgroundColor: COLORS.paper,
  },
  headClip: { flex: 1, overflow: 'hidden' },
  dayHead: { paddingHorizontal: 3, paddingBottom: 6, gap: 4, borderLeftWidth: 1, borderLeftColor: COLORS.line },
  dayLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 2 },
  dayName: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.body },
  dayNumber: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dayNumberToday: { backgroundColor: COLORS.yellow },
  dayNumberText: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  dayNumberTextToday: { color: COLORS.ink },
  chip: {
    height: CHIP_ROW - 2,
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  chipVtk: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
  chipText: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.ink },

  body: { flexDirection: 'row', height: DAY_HEIGHT },
  gutter: { width: GUTTER },
  hour: {
    position: 'absolute',
    right: 6,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  columns: { flex: 1 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.line },
  column: { height: DAY_HEIGHT, borderLeftWidth: 1, borderLeftColor: COLORS.line },
  weekend: { backgroundColor: 'rgba(14, 26, 54, 0.025)' },

  block: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  blockVtk: { borderLeftWidth: 4, borderLeftColor: COLORS.yellow },
  blockMandatory: { borderLeftWidth: 3, borderLeftColor: PLANNING.danger },
  blockHidden: { borderStyle: 'dashed', opacity: 0.5 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  blockTime: { fontFamily: FONTS.semibold, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  blockTitle: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 15, color: COLORS.ink },
  blockPlace: { fontFamily: FONTS.regular, fontSize: 10.5, marginTop: 1 },
  done: { opacity: 0.55 },
  struck: { textDecorationLine: 'line-through' },

  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: PLANNING.danger },
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PLANNING.danger,
  },
});

