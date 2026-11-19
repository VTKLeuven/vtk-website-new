import { Check, RotateCcw, Undo2, Users, X } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, RADIUS, SCANNER, SPACING, TICKET_COLORS } from '../../theme/tokens';
import type { ScanHistoryItem } from '../../scanner/types';

const clockFormat = new Intl.DateTimeFormat('nl-BE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Aanwezigen en de tellers van deze sessie aan deze ingang. */
export function ScanCounters({
  counts,
  stats,
}: {
  counts: { accepted: number; duplicate: number; rejected: number };
  stats: { checkedIn?: number; total?: number };
}) {
  const checkedIn = stats.checkedIn ?? 0;
  const total = stats.total ?? 0;
  const ratio = total > 0 ? Math.min(1, checkedIn / total) : 0;

  return (
    <View style={styles.counters}>
      <View style={styles.presentRow}>
        <Users size={16} color={SCANNER.textMuted} />
        <Text style={styles.presentLabel}>Aanwezig</Text>
        <Text style={styles.presentValue}>
          {checkedIn}
          <Text style={styles.presentTotal}> / {total}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.countRow}>
        <Counter label="Aanvaard" value={counts.accepted} color={SCANNER.countAccepted} />
        <Counter label="Dubbel" value={counts.duplicate} color={SCANNER.countDuplicate} />
        <Counter label="Geweigerd" value={counts.rejected} color={SCANNER.countRejected} />
      </View>
    </View>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

/**
 * Eén regel uit het scanlogboek van dit toestel. `memo`, want deze lijst wordt
 * bij elke scan opnieuw getekend en groeit tot vijftig rijen.
 */
export const HistoryRow = memo(function HistoryRow({
  item,
  reversing,
  onReverse,
}: {
  item: ScanHistoryItem;
  reversing: boolean;
  onReverse: (item: ScanHistoryItem) => void;
}) {
  const tint =
    item.kind === 'accepted'
      ? SCANNER.countAccepted
      : item.kind === 'duplicate'
        ? SCANNER.countDuplicate
        : item.kind === 'reversed'
          ? SCANNER.countReversed
          : SCANNER.countRejected;
  const Icon = item.kind === 'accepted' ? Check : item.kind === 'reversed' ? RotateCcw : X;

  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyIcon, { backgroundColor: `${tint}22` }]}>
        <Icon size={15} color={tint} />
      </View>
      <View style={styles.historyBody}>
        <Text style={styles.historyName} numberOfLines={1}>
          {item.attendeeName ?? item.code}
        </Text>
        <Text style={styles.historyMeta} numberOfLines={1}>
          {clockFormat.format(new Date(item.scannedAt))} · {item.message}
          {item.typeName ? ` · ${item.typeName}` : ''}
        </Text>
      </View>
      {item.typeColor && item.kind === 'accepted' ? (
        <View style={[styles.typePin, { backgroundColor: TICKET_COLORS[item.typeColor] }]} />
      ) : null}
      {item.kind === 'accepted' && item.scanId ? (
        <Pressable
          onPress={() => onReverse(item)}
          disabled={reversing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Check-in terugdraaien: ${item.attendeeName ?? item.code}`}
        >
          {reversing ? (
            <ActivityIndicator size="small" color={SCANNER.textMuted} />
          ) : (
            <Undo2 size={17} color={SCANNER.textMuted} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  counters: { gap: SPACING.sm, padding: SPACING.lg },
  presentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  presentLabel: { flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: SCANNER.textMuted },
  presentValue: { fontFamily: FONTS.bold, fontSize: 20, color: SCANNER.text },
  presentTotal: { fontFamily: FONTS.regular, fontSize: 14, color: SCANNER.textMuted },
  track: { height: 6, borderRadius: RADIUS.pill, backgroundColor: SCANNER.field, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: SCANNER.accent },
  countRow: { flexDirection: 'row', gap: SPACING.sm },
  counter: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: SCANNER.field,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
  },
  counterValue: { fontFamily: FONTS.bold, fontSize: 20 },
  counterLabel: { fontFamily: FONTS.regular, fontSize: 11, color: SCANNER.textMuted },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SCANNER.line,
  },
  historyIcon: { width: 28, height: 28, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  historyBody: { flex: 1 },
  historyName: { fontFamily: FONTS.semibold, fontSize: 14, color: SCANNER.text },
  historyMeta: { fontFamily: FONTS.regular, fontSize: 12, color: SCANNER.textMuted },
  typePin: { width: 10, height: 10, borderRadius: RADIUS.pill },
});
