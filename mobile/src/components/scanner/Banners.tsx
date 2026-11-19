import { AlertCircle, CloudUpload, RefreshCw, WifiOff, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, RADIUS, SCANNER, SPACING } from '../../theme/tokens';
import type { ScanConflict, ScannerManifest } from '../../scanner/types';

const timeFormat = new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' });

/**
 * Offline is een werkende toestand, geen fout: de balk is daarom okergeel en
 * niet alarmrood, en zegt waarop het toestel beslist.
 */
export function OfflineBanner({ manifest }: { manifest: ScannerManifest | null }) {
  return (
    <View style={[styles.banner, { backgroundColor: SCANNER.offlineBanner }]}>
      <WifiOff size={18} color={SCANNER.text} />
      <Text style={styles.bannerText}>
        {manifest
          ? `Offline scannen op de lijst van ${timeFormat.format(new Date(manifest.generatedAt))}. Scans worden bewaard.`
          : 'Geen netwerk en geen ticketlijst op dit toestel'}
      </Text>
    </View>
  );
}

export function QueueBanner({
  size,
  syncing,
  online,
  onSync,
}: {
  size: number;
  syncing: boolean;
  online: boolean;
  onSync: () => void;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: SCANNER.field }]}>
      <CloudUpload size={18} color={SCANNER.accent} />
      <Text style={styles.bannerText}>
        {size} {size === 1 ? 'scan wacht' : 'scans wachten'} op synchronisatie
      </Text>
      <Pressable
        style={[styles.bannerButton, (syncing || !online) && styles.bannerButtonDisabled]}
        disabled={syncing || !online}
        onPress={onSync}
        accessibilityRole="button"
      >
        {syncing ? (
          <ActivityIndicator size="small" color={SCANNER.accentInk} />
        ) : (
          <RefreshCw size={14} color={SCANNER.accentInk} />
        )}
        <Text style={styles.bannerButtonText}>{syncing ? 'Bezig' : 'Nu synchroniseren'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Offline aanvaard, achteraf toch geweigerd: meestal iemand die aan een tweede
 * deur nog eens binnen probeerde. Blijft staan tot de deurploeg ze wegklikt.
 */
export function ConflictBanner({
  conflicts,
  onDismiss,
}: {
  conflicts: ScanConflict[];
  onDismiss: () => void;
}) {
  return (
    <View style={[styles.banner, styles.conflict]} accessibilityRole="alert">
      <AlertCircle size={18} color={SCANNER.offlineInk} />
      <View style={styles.conflictBody}>
        <Text style={styles.conflictTitle}>
          {conflicts.length} offline aanvaarde{' '}
          {conflicts.length === 1 ? 'scan bleek' : 'scans bleken'} toch niet geldig
        </Text>
        {conflicts.slice(0, 5).map((conflict) => (
          <Text key={conflict.clientScanId} style={styles.conflictRow} numberOfLines={1}>
            {conflict.attendeeName ?? conflict.code} ·{' '}
            {conflict.result === 'ALREADY_USED' ? 'was al binnen' : conflict.result.toLowerCase()}
          </Text>
        ))}
      </View>
      <Pressable onPress={onDismiss} accessibilityLabel="Meldingen wissen" hitSlop={10}>
        <X size={18} color={SCANNER.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
  },
  bannerText: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: SCANNER.text },
  bannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCANNER.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  bannerButtonDisabled: { opacity: 0.5 },
  bannerButtonText: { fontFamily: FONTS.semibold, fontSize: 13, color: SCANNER.accentInk },
  conflict: { backgroundColor: SCANNER.conflictBanner, alignItems: 'flex-start' },
  conflictBody: { flex: 1, gap: 2 },
  conflictTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: SCANNER.text },
  conflictRow: { fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,.75)' },
});
