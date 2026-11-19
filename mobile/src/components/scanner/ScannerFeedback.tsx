import { Check, RotateCcw, X } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, RADIUS, SCANNER, SPACING, TICKET_COLORS } from '../../theme/tokens';
import type { ScanHistoryItem } from '../../scanner/types';

/**
 * Het volledige camerabeeld, overdekt met de uitkomst van de scan.
 *
 * Bij een **aanvaard** ticket krijgt het vlak de kleur van het tickettype en
 * staat het type als grootste woord op het scherm: aan een cantus moet de tapper
 * van drie meter zien of het water, bier of eigen drank is.
 *
 * Bij **dubbel** of **geweigerd** overrulen oranje en rood die typekleur
 * volledig. Dat is de belangrijkste regel van dit scherm: een geweigerd
 * bierticket dat geel oplicht, gaat binnen.
 *
 * De kleur is nooit het enige signaal. Zowel de naam van het type als het
 * oordeel staan er als tekst bij, want een op de twaalf mannen ziet rood en
 * groen niet uit elkaar, en die staat even goed aan de deur als in de rij.
 */
export function ScannerFeedback({ item }: { item: ScanHistoryItem }) {
  const accepted = item.kind === 'accepted';
  const showType = accepted && Boolean(item.typeName);
  const background =
    accepted && item.typeColor
      ? TICKET_COLORS[item.typeColor]
      : accepted
        ? SCANNER.accepted
        : item.kind === 'duplicate'
          ? SCANNER.duplicate
          : item.kind === 'reversed'
            ? SCANNER.reversed
            : SCANNER.rejected;

  const Icon = accepted ? Check : item.kind === 'duplicate' || item.kind === 'reversed' ? RotateCcw : X;

  return (
    <View style={[styles.overlay, { backgroundColor: background }]} accessibilityLiveRegion="assertive">
      <View style={styles.icon}>
        <Icon size={34} color={SCANNER.text} />
      </View>
      <Text style={showType ? styles.type : styles.headline} numberOfLines={2}>
        {showType ? item.typeName : item.message}
      </Text>
      {item.attendeeName ? (
        <Text style={styles.name} numberOfLines={1}>
          {item.attendeeName}
        </Text>
      ) : null}
      {showType ? (
        <View style={styles.verdict}>
          <Check size={13} color={SCANNER.accepted} />
          <Text style={styles.verdictText}>{item.message}</Text>
        </View>
      ) : item.typeName ? (
        <Text style={styles.name}>{item.typeName}</Text>
      ) : null}
      {item.pending ? <Text style={styles.pending}>Wacht op synchronisatie</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.xs,
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.16)',
    marginBottom: SPACING.sm,
  },
  headline: { fontFamily: FONTS.bold, fontSize: 24, color: SCANNER.text, textAlign: 'center' },
  type: {
    fontFamily: FONTS.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 0.5,
    color: SCANNER.text,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  name: { fontFamily: FONTS.medium, fontSize: 16, color: 'rgba(255,255,255,.86)', textAlign: 'center' },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCANNER.text,
    borderRadius: RADIUS.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginTop: SPACING.xs,
  },
  verdictText: { fontFamily: FONTS.semibold, fontSize: 13, color: SCANNER.accepted },
  pending: { fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,.7)' },
});
