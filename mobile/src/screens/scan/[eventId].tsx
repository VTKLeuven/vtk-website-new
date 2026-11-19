import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronRight,
  Flashlight,
  History,
  IdCard,
  Keyboard,
  MapPin,
  RefreshCw,
  ScanLine,
  Signal,
  SignalZero,
  UserRoundCog,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConflictBanner, OfflineBanner, QueueBanner } from '../../components/scanner/Banners';
import { ScannerFeedback } from '../../components/scanner/ScannerFeedback';
import { ScanCounters } from '../../components/scanner/SessionPanel';
import {
  CardReaderSheet,
  GateSheet,
  HistorySheet,
  ManualSheet,
  NameListSheet,
  ScannersSheet,
} from '../../components/scanner/Sheets';
import { useScanner } from '../../scanner/useScanner';
import { FONTS, HIT_TARGET, RADIUS, SCANNER, SPACING } from '../../theme/tokens';

type Sheet = 'none' | 'gate' | 'manual' | 'card' | 'names' | 'history' | 'scanners';

/**
 * Tickets scannen aan de deur van één evenement.
 *
 * Dit was vtk-scanner-app en is nu een scherm van de app: dezelfde werking
 * (`src/scanner/useScanner.ts`), met het offline manifest, de wachtrij, de
 * namenlijst, de kaartlezer, terugdraaien en het scannerspaneel. Zie
 * `docs/architecture.md` voor de weg van een scan.
 *
 * **Het enige donkere scherm van de app, en het ligt over de tabbalk.** Het staat
 * aan de wortel als `fullScreenModal` (`app/_layout.tsx`) en niet in een tab: de
 * tabbalk zou hier enkel een rij knoppen zijn waar je per ongeluk op tikt terwijl
 * er een rij voor je staat, en een veeg naar beneden mag de scanner niet sluiten.
 * Dicht gaat met het kruis. Het palet is `SCANNER` uit de tokens.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const scanner = useScanner(eventId);

  // Wie via een link of een melding meteen hier binnenkwam, heeft niets om naar
  // terug te gaan; die komt dan op Home uit in plaats van nergens.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [sheet, setSheet] = useState<Sheet>('none');

  // Een telefoon die na dertig seconden in slaap valt is aan een deur onbruikbaar.
  useKeepAwake();

  if (scanner.loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={SCANNER.accent} />
        <Text style={styles.muted}>Scanner laden</Text>
      </SafeAreaView>
    );
  }

  if (!scanner.bootstrap || scanner.bootstrapError) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <XCircle size={32} color={SCANNER.countRejected} />
        <Text style={styles.errorTitle}>Scanner niet beschikbaar</Text>
        <Text style={styles.muted}>{scanner.bootstrapError}</Text>
        <Pressable
          style={styles.retry}
          onPress={() => void scanner.loadBootstrap()}
          accessibilityRole="button"
        >
          <RefreshCw size={16} color={SCANNER.accentInk} />
          <Text style={styles.retryText}>Opnieuw proberen</Text>
        </Pressable>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={styles.muted}>Sluiten</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { bootstrap } = scanner;
  const gateName = bootstrap.gates.find((gate) => gate.id === scanner.gateId)?.name;
  const cameraReady = permission?.granted && cameraOn;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.eyebrow}>AAN DE DEUR</Text>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {bootstrap.event.title}
          </Text>
        </View>
        <View
          style={[styles.pill, scanner.online ? styles.pillOnline : styles.pillOffline]}
          accessibilityLabel={scanner.online ? 'Online' : 'Offline'}
        >
          {scanner.online ? (
            <Signal size={13} color={SCANNER.onlineInk} />
          ) : (
            <SignalZero size={13} color={SCANNER.offlineInk} />
          )}
          <Text style={[styles.pillText, { color: scanner.online ? SCANNER.onlineInk : SCANNER.offlineInk }]}>
            {scanner.online ? 'Online' : 'Offline'}
          </Text>
        </View>
        {bootstrap.canManageScanners ? (
          <Pressable
            onPress={() => setSheet('scanners')}
            disabled={!scanner.online}
            hitSlop={12}
            accessibilityLabel="Scanners beheren"
            accessibilityRole="button"
          >
            <UserRoundCog size={21} color={scanner.online ? SCANNER.textMuted : SCANNER.line} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityLabel="Scanner sluiten"
          accessibilityRole="button"
        >
          <X size={22} color={SCANNER.textMuted} />
        </Pressable>
      </View>

      <Pressable
        style={styles.gateRow}
        onPress={() => setSheet('gate')}
        disabled={bootstrap.gates.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Ingang kiezen"
      >
        <MapPin size={15} color={SCANNER.textMuted} />
        <Text style={styles.gateText}>{gateName ?? 'Geen actieve ingang'}</Text>
        {bootstrap.gates.length > 0 ? <ChevronDown size={15} color={SCANNER.textMuted} /> : null}
      </Pressable>

      {!scanner.online ? <OfflineBanner manifest={scanner.manifest} /> : null}
      {scanner.queueSize > 0 ? (
        <QueueBanner
          size={scanner.queueSize}
          syncing={scanner.syncing}
          online={scanner.online}
          onSync={() => void scanner.flushQueue()}
        />
      ) : null}
      {scanner.conflicts.length > 0 ? (
        <ConflictBanner conflicts={scanner.conflicts} onDismiss={scanner.clearConflicts} />
      ) : null}

      <View style={styles.videoWrap}>
        {cameraReady ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            // De debounce zit in `useScanner`: expo-camera vuurt dit tientallen
            // keren per seconde zolang de QR in beeld is.
            onBarcodeScanned={({ data }) => void scanner.processCredential(data)}
          />
        ) : (
          <View style={styles.cameraEmpty}>
            <Camera size={32} color={SCANNER.textMuted} />
            <Text style={styles.cameraEmptyTitle}>
              {permission?.granted ? 'Camera is uitgeschakeld' : 'Cameratoegang is nodig'}
            </Text>
            <Pressable
              style={styles.retry}
              onPress={() => {
                if (permission?.granted) setCameraOn(true);
                else void requestPermission();
              }}
              accessibilityRole="button"
            >
              <Camera size={16} color={SCANNER.accentInk} />
              <Text style={styles.retryText}>
                {permission?.granted ? 'Camera starten' : 'Toegang geven'}
              </Text>
            </Pressable>
            {permission && !permission.canAskAgain && !permission.granted ? (
              <View style={styles.cameraDenied}>
                <AlertCircle size={15} color={SCANNER.offlineInk} />
                <Text style={styles.cameraDeniedText}>
                  Cameratoegang werd geweigerd; zet ze aan in de instellingen van je toestel.
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {cameraReady && !scanner.feedback ? (
          <View style={styles.reticle} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <ScanLine size={26} color="rgba(255,210,63,.35)" />
          </View>
        ) : null}

        {scanner.feedback ? <ScannerFeedback item={scanner.feedback} /> : null}
      </View>

      <View style={styles.tools}>
        <Tool
          icon={<Flashlight size={19} color={torchOn ? SCANNER.accentInk : SCANNER.text} />}
          label="Zaklamp"
          active={torchOn}
          disabled={!cameraReady}
          onPress={() => setTorchOn((current) => !current)}
        />
        <Tool
          icon={<Keyboard size={19} color={SCANNER.text} />}
          label="Handmatig"
          onPress={() => setSheet('manual')}
        />
        <Tool
          icon={<Users size={19} color={SCANNER.text} />}
          label="Op naam"
          disabled={!scanner.manifest}
          onPress={() => setSheet('names')}
        />
        {bootstrap.event.cardCheckIn ? (
          <Tool
            icon={<IdCard size={19} color={SCANNER.text} />}
            label="Kaartlezer"
            onPress={() => setSheet('card')}
          />
        ) : null}
      </View>

      {/* De tellers blijven staan, het logboek niet: ingeklemd tussen camera en
          knoppenrij bleef er één rij van over, te weinig om iets aan te hebben en
          te weinig om in te scrollen. Als paneel heeft het de hele hoogte. */}
      <View style={styles.session}>
        <ScanCounters counts={scanner.sessionCounts} stats={scanner.serverStats} />
        <Pressable
          style={styles.historyButton}
          onPress={() => setSheet('history')}
          accessibilityRole="button"
          accessibilityLabel={`Recente scans openen, ${scanner.history.length} op dit toestel`}
        >
          <History size={17} color={SCANNER.textMuted} />
          <Text style={styles.historyButtonLabel}>Recente scans</Text>
          <Text style={styles.historyButtonCount}>{scanner.history.length}</Text>
          <ChevronRight size={16} color={SCANNER.textMuted} />
        </Pressable>
      </View>

      <GateSheet
        visible={sheet === 'gate'}
        gates={bootstrap.gates}
        gateId={scanner.gateId}
        onPick={scanner.setGateId}
        onClose={() => setSheet('none')}
      />
      <ManualSheet
        visible={sheet === 'manual'}
        onSubmit={(code) => void scanner.processCredential(code)}
        onClose={() => setSheet('none')}
      />
      <CardReaderSheet
        visible={sheet === 'card'}
        onRead={scanner.processReaderInput}
        onClose={() => setSheet('none')}
      />
      <NameListSheet
        visible={sheet === 'names'}
        manifest={scanner.manifest}
        scannedCodes={scanner.scannedCodes}
        onCheckIn={(code) => void scanner.processCredential(code)}
        onClose={() => setSheet('none')}
      />
      <ScannersSheet
        visible={sheet === 'scanners'}
        eventId={eventId}
        openScanning={bootstrap.event.openScanning ?? true}
        onClose={() => setSheet('none')}
      />
      <HistorySheet
        visible={sheet === 'history'}
        history={scanner.history}
        reversingScanId={scanner.reversingScanId}
        onReverse={(target) => void scanner.reverseScan(target)}
        onClose={() => setSheet('none')}
      />
    </SafeAreaView>
  );
}

function Tool({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tool, active && styles.toolActive, disabled && styles.toolDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
    >
      {icon}
      <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SCANNER.shell },
  muted: { fontFamily: FONTS.regular, fontSize: 13, color: SCANNER.textMuted },
  eyebrow: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1.4, color: SCANNER.accent },
  center: { alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xxl },
  errorTitle: { fontFamily: FONTS.bold, fontSize: 18, color: SCANNER.text },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SCANNER.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
  },
  retryText: { fontFamily: FONTS.semibold, fontSize: 14, color: SCANNER.accentInk },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: SCANNER.header,
  },
  headerTitle: { flex: 1, gap: 2 },
  eventTitle: { fontFamily: FONTS.bold, fontSize: 17, color: SCANNER.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillOnline: { backgroundColor: SCANNER.onlineBg },
  pillOffline: { backgroundColor: SCANNER.offlineBg },
  pillText: { fontFamily: FONTS.semibold, fontSize: 12 },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: SCANNER.header,
  },
  gateText: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: SCANNER.textMuted },
  videoWrap: { flex: 1, minHeight: 240, backgroundColor: SCANNER.videoWell, overflow: 'hidden' },
  cameraEmpty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  cameraEmptyTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: SCANNER.text },
  cameraDenied: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg },
  cameraDeniedText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: SCANNER.offlineInk },
  reticle: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: 42, height: 42, borderColor: SCANNER.accent },
  cornerTL: { top: '22%', left: '14%', borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: '22%', right: '14%', borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: '22%', left: '14%', borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: '22%', right: '14%', borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  tools: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: SCANNER.header,
  },
  tool: {
    flex: 1,
    minHeight: HIT_TARGET + 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: SCANNER.field,
    borderRadius: RADIUS.sm,
  },
  toolActive: { backgroundColor: SCANNER.accent },
  toolDisabled: { opacity: 0.4 },
  toolLabel: { fontFamily: FONTS.medium, fontSize: 11, color: SCANNER.text },
  toolLabelActive: { color: SCANNER.accentInk, fontFamily: FONTS.semibold },
  session: { backgroundColor: SCANNER.header },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: HIT_TARGET,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SCANNER.line,
  },
  historyButtonLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: SCANNER.text },
  historyButtonCount: { fontFamily: FONTS.semibold, fontSize: 14, color: SCANNER.textMuted },
});
