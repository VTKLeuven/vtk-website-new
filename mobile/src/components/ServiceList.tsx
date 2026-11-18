import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppHoursWindow, AppServiceStatus } from '../api/contract';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Theokot, cursusdienst en 't ElixIr: open of niet, en tot hoe laat.
 *
 * Dit is de vraag die het vaakst gesteld wordt en daarom staat ze bovenaan Home,
 * boven de vouw. De site zet drie weekroosters naast elkaar; op een telefoon is
 * dat drie keer zeven regels waar je doorheen moet lezen voor je weet of je nu
 * kan gaan. Hier staat het antwoord vooraan en het rooster erachter: tik een
 * dienst aan en de week klapt open.
 *
 * **Het rekenwerk gebeurt op de server** (`lib/app-api/serviceStatus.ts`). De
 * openingsuren staan in wandkloktijd van Brussel, en een telefoon staat niet
 * noodzakelijk op die tijdzone; het hier nog eens uitrekenen zou betekenen dat de
 * app op reis andere uren toont dan de site.
 *
 * Naam, toestand en uur staan als drie kolommen naast elkaar en niet als één zin
 * met puntjes ertussen. Dat is de regel over gelabelde kolommen uit CLAUDE.md.
 *
 * **Vandaag als dunne lijn, met één gele nu-lijn door alle diensten**, zoals de
 * openingsuren "zonder kader" op de homepage van de site. Geen statusbolletjes:
 * die werden daar bewust weggehaald. Een avond zonder sluitingsuur loopt vol tot
 * twee uur na de opening en vervaagt daarna, want een einduur verzinnen mag niet.
 * Een oudere server stuurt de vensters niet mee; dan valt de lijn weg.
 */
export function ServiceList({ services }: { services: AppServiceStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const axis = useMemo(() => timelineAxis(services), [services]);
  const nowMinutes = brusselsMinutes(new Date());
  const nowLeft = axis ? pct(nowMinutes, axis) : null;
  const showNow = axis !== null && nowMinutes >= axis.start && nowMinutes <= axis.end;

  return (
    <View style={styles.list}>
      {services.map((service, index) => {
        const expanded = open === service.key;
        const hasSchedule = service.entries.length > 0;

        return (
          <View key={service.key}>
            <Pressable
              accessibilityRole={hasSchedule ? 'button' : 'text'}
              accessibilityState={hasSchedule ? { expanded } : undefined}
              accessibilityLabel={`${service.name}, ${service.openNow ? 'open' : 'gesloten'}, ${service.detail}`}
              disabled={!hasSchedule}
              onPress={() => setOpen(expanded ? null : service.key)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.divided,
                pressed && hasSchedule && styles.pressed,
              ]}
            >
              <Text style={styles.name} numberOfLines={1}>
                {service.name}
              </Text>

              {service.unavailable ? (
                <Text style={styles.unavailable} numberOfLines={1}>
                  {service.detail}
                </Text>
              ) : (
                <>
                  <Text style={service.openNow ? styles.openText : styles.shutText}>
                    {service.openNow ? 'Open' : 'Gesloten'}
                  </Text>
                  <Text style={styles.detail} numberOfLines={1}>
                    {service.detail}
                  </Text>
                </>
              )}

              {hasSchedule ? (
                <ChevronDown
                  color={COLORS.muted}
                  size={15}
                  style={expanded ? styles.chevronOpen : undefined}
                />
              ) : null}
            </Pressable>

            {axis && service.today && !service.unavailable ? (
              <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {service.today.map((window, windowIndex) => (
                  <WindowBar key={windowIndex} window={window} axis={axis} />
                ))}
                {showNow && nowLeft !== null ? (
                  <View style={[styles.nowLine, { left: `${nowLeft}%` }]} />
                ) : null}
              </View>
            ) : null}

            {expanded ? (
              <View style={styles.schedule}>
                {service.entries.map((entry) => (
                  <View key={entry.day} style={styles.scheduleRow}>
                    <Text style={styles.scheduleDay} numberOfLines={1}>
                      {entry.day}
                    </Text>
                    <Text style={styles.scheduleHours} numberOfLines={1}>
                      {entry.hours}
                    </Text>
                  </View>
                ))}
                {service.note ? <Text style={styles.note}>{service.note}</Text> : null}
                {service.live ? (
                  <Text style={styles.note}>
                    De toestand hierboven is live gemeten en kan van het rooster afwijken.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type Axis = { start: number; end: number };

/** Hoe lang het vaste stuk van een avond zonder sluitingsuur is, en de vervaagde staart erna. */
const OPEN_END_SOLID = 2 * 60;
const OPEN_END_TAIL = 5 * 60;

/**
 * Eén tijdas voor alle diensten, zodat de nu-lijn er recht door loopt. Minstens
 * 9:00 tot 19:00, zoals op de site; een avond zonder einde trekt ze verder.
 */
function timelineAxis(services: AppServiceStatus[]): Axis | null {
  const windows = services.flatMap((service) => service.today ?? []);
  if (!services.some((service) => service.today)) return null;
  let start = 9 * 60;
  let end = 19 * 60;
  for (const window of windows) {
    start = Math.min(start, Math.floor(window.start / 60) * 60);
    end = Math.max(end, Math.ceil((window.end ?? window.start + OPEN_END_TAIL) / 60) * 60);
  }
  return { start, end: Math.min(end, start + 24 * 60) };
}

function pct(minutes: number, axis: Axis): number {
  const clamped = Math.min(Math.max(minutes, axis.start), axis.end);
  return ((clamped - axis.start) / (axis.end - axis.start)) * 100;
}

/** Minuten sinds middernacht op de klok van Brussel, niet die van het toestel. */
function brusselsMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function WindowBar({ window, axis }: { window: AppHoursWindow; axis: Axis }) {
  const left = pct(window.start, axis);
  if (window.end !== null) {
    return <View style={[styles.bar, { left: `${left}%`, width: `${pct(window.end, axis) - left}%` }]} />;
  }
  const solidEnd = pct(window.start + OPEN_END_SOLID, axis);
  return (
    <>
      <View style={[styles.bar, { left: `${left}%`, width: `${solidEnd - left}%` }]} />
      <View style={[styles.bar, styles.tail, { left: `${solidEnd}%`, width: `${100 - solidEnd}%` }]} />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  divided: { borderTopWidth: 1, borderTopColor: COLORS.line },
  pressed: { backgroundColor: COLORS.paper2 },
  name: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink, flex: 1 },
  // De tijdlijn van vandaag: een haarlijn met de vensters erop in navy.
  track: {
    height: 4,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    marginTop: -SPACING.xs,
    backgroundColor: COLORS.paper2,
    borderRadius: 2,
  },
  bar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: COLORS.navy, borderRadius: 2 },
  tail: { opacity: 0.25 },
  nowLine: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    backgroundColor: COLORS.yellowDeep,
  },
  openText: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  shutText: { ...TYPE.small, color: COLORS.muted },
  detail: { ...TYPE.small, color: COLORS.muted, minWidth: 74, textAlign: 'right' },
  unavailable: { ...TYPE.small, color: COLORS.muted, flexShrink: 1, textAlign: 'right' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  schedule: {
    backgroundColor: COLORS.paper2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: 3,
  },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  scheduleDay: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  scheduleHours: { ...TYPE.small, color: COLORS.body },
  note: { ...TYPE.small, color: COLORS.muted, marginTop: SPACING.sm },
});
