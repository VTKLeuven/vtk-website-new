import { ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppHoursWindow, AppServiceStatus } from '../api/contract';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';

/**
 * Theokot, cursusdienst en 't ElixIr: open of niet, en tot hoe laat.
 *
 * De openingsuren "zonder kader" van de homepage, op de navy band van de kop van
 * Home: per dienst een regel met de naam en een statuszin, vandaag als dunne lijn
 * op één gedeelde tijdas, en één gele nu-lijn door alle diensten. Geen glazen
 * paneel, geen statusbolletjes, geen kapitalen: op de site lazen die samen als een
 * sjabloon en zijn ze weggehaald. Een avond zonder sluitingsuur loopt twee uur vol
 * en daarna gearceerd, want een einduur verzinnen mag niet. Tik een dienst aan en
 * de week klapt open.
 *
 * **Het rekenwerk gebeurt op de server** (`lib/app-api/serviceStatus.ts`), op de
 * klok van Brussel. Een oudere server stuurt `today` niet mee; dan valt de lijn
 * weg en blijft de statuszin staan.
 */
export function ServiceList({ services }: { services: AppServiceStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const axis = useMemo(() => timelineAxis(services), [services]);
  const nowMinutes = brusselsMinutes(new Date());
  const showNow = axis !== null && nowMinutes >= axis.start && nowMinutes <= axis.end;

  return (
    <View>
      {axis ? (
        <View style={styles.axisRow}>
          <View style={styles.nameCol} />
          <View style={styles.axis}>
            {axisLabels(axis).map((label) => (
              <Text key={label.text} style={[styles.axisLabel, { left: `${label.left}%` }]}>
                {label.text}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {services.map((service) => {
        const expanded = open === service.key;
        const hasSchedule = service.entries.length > 0;

        return (
          <View key={service.key}>
            <Pressable
              accessibilityRole={hasSchedule ? 'button' : 'text'}
              accessibilityState={hasSchedule ? { expanded } : undefined}
              accessibilityLabel={`${service.name}, ${statusLine(service)}`}
              disabled={!hasSchedule}
              onPress={() => setOpen(expanded ? null : service.key)}
              style={({ pressed }) => [styles.row, pressed && hasSchedule && styles.pressed]}
            >
              <View style={styles.nameCol}>
                <Text style={styles.name} numberOfLines={1}>
                  {service.name}
                </Text>
                <Text style={[styles.status, service.openNow && styles.statusOpen]} numberOfLines={1}>
                  {statusLine(service)}
                </Text>
              </View>

              {axis && service.today && !service.unavailable ? (
                <View style={styles.track}>
                  {service.today.map((window, index) => (
                    <WindowBar key={index} window={window} axis={axis} open={service.openNow} now={nowMinutes} />
                  ))}
                  {showNow ? <View style={[styles.nowLine, { left: `${pct(nowMinutes, axis)}%` }]} /> : null}
                </View>
              ) : (
                <View style={styles.trackEmpty} />
              )}

              {hasSchedule ? (
                <ChevronDown
                  color={COLORS.onDarkMuted}
                  size={14}
                  style={expanded ? styles.chevronOpen : undefined}
                />
              ) : null}
            </Pressable>

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
                  <Text style={styles.note}>Live gemeten; dat kan van het rooster afwijken.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "Open tot 14:00", "Opent 18:00", "Opent do 12:00": de regel van de server, als zin. */
function statusLine(service: AppServiceStatus): string {
  const detail = service.detail.trim();
  if (service.unavailable) return detail;
  if (service.openNow) {
    return detail.startsWith('tot') ? `Open ${detail}` : 'Nu open';
  }
  if (detail === 'gesloten') return 'Gesloten';
  if (detail.startsWith('opent')) return `O${detail.slice(1)}`;
  return `Opent ${detail}`;
}

type Axis = { start: number; end: number };

/** Hoe lang het vaste stuk van een avond zonder sluitingsuur is, en de arcering erna. */
const OPEN_END_SOLID = 2 * 60;
const OPEN_END_TAIL = 5 * 60;

/**
 * Eén tijdas voor alle diensten, zodat de nu-lijn er recht door loopt. Minstens
 * 9:00 tot 19:00, zoals op de site; een avond zonder einde trekt ze verder.
 */
function timelineAxis(services: AppServiceStatus[]): Axis | null {
  if (!services.some((service) => service.today)) return null;
  let start = 9 * 60;
  let end = 19 * 60;
  for (const window of services.flatMap((service) => service.today ?? [])) {
    start = Math.min(start, Math.floor(window.start / 60) * 60);
    end = Math.max(end, Math.ceil((window.end ?? window.start + OPEN_END_TAIL) / 60) * 60);
  }
  return { start, end: Math.min(end, start + 24 * 60) };
}

function axisLabels(axis: Axis): { text: string; left: number }[] {
  const labels: { text: string; left: number }[] = [];
  const step = axis.end - axis.start > 12 * 60 ? 4 * 60 : 3 * 60;
  for (let minutes = Math.ceil(axis.start / step) * step; minutes <= axis.end; minutes += step) {
    labels.push({ text: String((minutes / 60) % 24), left: pct(minutes, axis) });
  }
  return labels;
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

function WindowBar({
  window,
  axis,
  open,
  now,
}: {
  window: AppHoursWindow;
  axis: Axis;
  open: boolean;
  now: number;
}) {
  const left = pct(window.start, axis);
  // Het venster waarin "nu" valt en dat open is, licht geel op.
  const running = open && now >= window.start && (window.end === null || now < window.end);
  if (window.end !== null) {
    return (
      <View
        style={[styles.bar, running && styles.barOn, { left: `${left}%`, width: `${pct(window.end, axis) - left}%` }]}
      />
    );
  }
  const solidEnd = pct(window.start + OPEN_END_SOLID, axis);
  return (
    <>
      <View style={[styles.bar, running && styles.barOn, { left: `${left}%`, width: `${solidEnd - left}%` }]} />
      <View style={[styles.bar, styles.tail, { left: `${solidEnd}%`, width: `${100 - solidEnd}%` }]} />
    </>
  );
}

const styles = StyleSheet.create({
  axisRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: 4, paddingRight: 26 },
  axis: { flex: 1, height: 14 },
  axisLabel: {
    position: 'absolute',
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.onDarkMuted,
    fontVariant: ['tabular-nums'],
    marginLeft: -4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  pressed: { opacity: 0.7 },
  nameCol: { width: 112 },
  name: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 18, color: COLORS.onDark },
  status: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 16, color: COLORS.onDarkMuted },
  statusOpen: { color: COLORS.yellow },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  trackEmpty: { flex: 1 },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: 'rgba(239,242,248,0.55)',
  },
  barOn: { backgroundColor: COLORS.yellow },
  tail: { backgroundColor: 'rgba(239,242,248,0.18)' },
  nowLine: {
    position: 'absolute',
    top: -9,
    bottom: -9,
    width: 2,
    marginLeft: -1,
    backgroundColor: COLORS.yellow,
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  schedule: { paddingLeft: 112 + SPACING.md, paddingBottom: SPACING.md, gap: 3 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  scheduleDay: { ...TYPE.small, color: COLORS.onDarkMuted, flex: 1 },
  scheduleHours: { ...TYPE.small, color: COLORS.onDark },
  note: { ...TYPE.small, color: COLORS.onDarkMuted, marginTop: SPACING.xs },
});
