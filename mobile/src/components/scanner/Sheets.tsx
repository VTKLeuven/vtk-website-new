import { IdCard, MapPin, QrCode, Search, UserPlus, UserRoundX, X } from 'lucide-react-native';
import QRCodeView from 'react-native-qrcode-svg';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { ApiError } from '../../api/client';
import {
  addEventScanner,
  fetchEventScanners,
  fetchScannerInvite,
  removeEventScanner,
  searchScannerCandidates,
} from '../../api/scanner';
import { COLORS, FONTS, HIT_TARGET, RADIUS, SCANNER, SPACING, TICKET_COLORS } from '../../theme/tokens';
import type {
  EventScanner,
  ScanHistoryItem,
  ScannerCandidate,
  ScannerGate,
  ScannerManifest,
  ScannerManifestEntry,
} from '../../scanner/types';
import { HistoryRow } from './SessionPanel';

/**
 * Hoeveel het klavier onderaan het scherm inneemt, nul wanneer het weg is.
 *
 * `KeyboardAvoidingView` stond hier eerst en deed te veel: die duwt het hele
 * paneel omhoog en liet het bij het openen al opengeklapt staan nog voor er
 * iemand tikte. Deze hoogte is precies wat we nodig hebben; het paneel groeit er
 * enkel mee naar boven.
 *
 * `willChangeFrame` op iOS omdat het klavier daar animeert en we mee willen
 * bewegen; op Android bestaat dat event niet en is `didShow` het juiste moment.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(
      ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => setInset(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setInset(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}

/**
 * De gedeelde schil van elk paneel dat van onderen opkomt.
 *
 * Het paneel is zo hoog als zijn inhoud en niet hoger: het komt op met de camera
 * er nog achter, en dat hoort zo. Komt het klavier op, dan groeit het paneel er
 * net genoeg mee naar boven zodat de inhoud erboven blijft; er beweegt verder
 * niets op het scherm.
 */
function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const keyboard = useKeyboardInset();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Sluiten" />
        <View style={[styles.sheet, { paddingBottom: SPACING.xxl + keyboard }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Sluiten" accessibilityRole="button">
              <X size={20} color={SCANNER.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/**
 * De deelnemerslijst, gefilterd op naam of ticketcode.
 *
 * Voor wie zijn QR kwijt is of een telefoon zonder batterij heeft. Werkt ook
 * offline, want de lijst is het manifest dat al op het toestel staat, en
 * inchecken loopt door dezelfde weg als een gescande QR.
 *
 * Bewust afgekapt op vijftig rijen: een galabal telt er meer dan duizend, en die
 * allemaal tekenen maakt het scrollen op een telefoon stroperig. Wie iemand
 * zoekt, typt toch een paar letters.
 */
export function NameListSheet({
  visible,
  manifest,
  scannedCodes,
  onCheckIn,
  onClose,
}: {
  visible: boolean;
  manifest: ScannerManifest | null;
  scannedCodes: Set<string>;
  onCheckIn: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!manifest) return { rows: [] as ScannerManifestEntry[], total: 0 };
    const needle = query.trim().toLowerCase();
    const matches = manifest.tickets
      .filter(
        (ticket) =>
          !needle ||
          ticket.name.toLowerCase().includes(needle) ||
          ticket.code.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    return { rows: matches.slice(0, 50), total: matches.length };
  }, [manifest, query]);

  return (
    <Sheet visible={visible} title="Op naam" onClose={onClose}>
      <View style={styles.searchRow}>
        <Search size={17} color={SCANNER.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Zoek een naam"
          placeholderTextColor={SCANNER.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {manifest ? (
        <Text style={styles.hint}>
          {results.total} van {manifest.tickets.length} deelnemers
          {results.total > results.rows.length ? ` · eerste ${results.rows.length} getoond` : ''}
        </Text>
      ) : (
        <Text style={styles.hint}>Geen ticketlijst op dit toestel.</Text>
      )}
      <FlatList
        data={results.rows}
        keyExtractor={(entry) => entry.code}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={manifest ? <Text style={styles.hint}>Geen deelnemer gevonden.</Text> : undefined}
        renderItem={({ item }) => {
          const inside = item.checkedIn || scannedCodes.has(item.code);
          return (
            <View style={styles.personRow}>
              <View style={[styles.typePin, { backgroundColor: TICKET_COLORS[item.typeColor] }]} />
              <View style={styles.personBody}>
                <Text style={styles.personName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.personMeta} numberOfLines={1}>
                  {item.type}
                </Text>
              </View>
              <Pressable
                style={[styles.checkInButton, inside && styles.checkInDisabled]}
                disabled={inside}
                onPress={() => onCheckIn(item.code)}
                accessibilityRole="button"
                accessibilityLabel={`${inside ? 'Binnen' : 'Inchecken'}: ${item.name}`}
              >
                <Text style={[styles.checkInText, inside && styles.checkInTextDisabled]}>
                  {inside ? 'Binnen' : 'Inchecken'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </Sheet>
  );
}

/**
 * Het scanlogboek van dit toestel, met de terugdraai-knop per aanvaarde scan.
 *
 * Staat bewust in een paneel en niet onder de camera: daar bleef er één rij van
 * over, te weinig om iets aan te hebben. Hier heeft de lijst de hele hoogte en
 * kan ze scrollen, en het camerabeeld houdt zijn plaats.
 */
export function HistorySheet({
  visible,
  history,
  reversingScanId,
  onReverse,
  onClose,
}: {
  visible: boolean;
  history: ScanHistoryItem[];
  reversingScanId: string | null;
  onReverse: (item: ScanHistoryItem) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Recente scans" onClose={onClose}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.hint}>Nog geen scans aan deze ingang</Text>}
        renderItem={({ item }) => (
          <HistoryRow
            item={item}
            reversing={reversingScanId === item.scanId}
            onReverse={onReverse}
          />
        )}
      />
    </Sheet>
  );
}

/** Handmatig een ticketcode intikken, voor een QR die niet meer leesbaar is. */
export function ManualSheet({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');

  return (
    <Sheet visible={visible} title="Ticketcode" onClose={onClose}>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Vul de code in"
        placeholderTextColor={SCANNER.textMuted}
        style={styles.codeInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() => {
          if (!code.trim()) return;
          onSubmit(code.trim());
          setCode('');
          onClose();
        }}
      />
      <Pressable
        style={[styles.primaryButton, !code.trim() && styles.primaryDisabled]}
        disabled={!code.trim()}
        onPress={() => {
          onSubmit(code.trim());
          setCode('');
          onClose();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>Controleren</Text>
      </Pressable>
    </Sheet>
  );
}

/**
 * Het leesveld voor een bluetooth-kaartlezer.
 *
 * De lezer gedraagt zich als een toetsenbord en tikt `serial;cardAppId` in wat
 * focus heeft; zonder focus verdwijnt de scan in het niets. Vandaar dat dit veld
 * zichzelf scherp houdt zolang het paneel open staat.
 */
export function CardReaderSheet({
  visible,
  onRead,
  onClose,
}: {
  visible: boolean;
  onRead: (raw: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  function submit(raw: string) {
    const cleaned = raw.replace(/[\r\n]+/g, '').trim();
    setValue('');
    if (cleaned) onRead(cleaned);
    inputRef.current?.focus();
  }

  return (
    <Sheet visible={visible} title="Studentenkaart" onClose={onClose}>
      <View style={styles.cardWaiting}>
        <IdCard size={30} color={SCANNER.accent} />
        <Text style={styles.cardTitle}>Wachtend op een kaart</Text>
        <Text style={styles.hint}>Houd de kaart op de lezer.</Text>
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        // Sommige lezers sturen een newline in plaats van een Enter-toets.
        onChangeText={(next) => (/[\r\n]/.test(next) ? submit(next) : setValue(next))}
        onSubmitEditing={() => submit(value)}
        style={styles.codeInput}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        showSoftInputOnFocus={false}
      />
    </Sheet>
  );
}

const SCANNER_ERRORS: Record<string, string> = {
  USER_NOT_FOUND: 'Die persoon bestaat niet of is niet actief',
  GRANT_NOT_FOUND: 'Die scanner stond er al niet meer bij',
  GRANT_ROLE_CONFLICT:
    'Die persoon heeft al een andere rol op dit event; pas die aan bij Toegang in het beheer',
  FORBIDDEN: 'Je mag geen scanners beheren voor dit event',
  UNAUTHENTICATED: 'Je sessie is verlopen',
};

function scannerErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  return (code && SCANNER_ERRORS[code]) || 'Er ging iets mis';
}

/**
 * Scanners toevoegen en weghalen, aan de deur.
 *
 * Het moment waarop je dit nodig hebt ligt aan de ingang en niet achter een
 * laptop: er komt iemand bijspringen en die moet nu kunnen scannen. Zoeken gaat
 * op naam, e-mail of r-nummer, want het gaat net om mensen buiten het
 * praesidium; wie in een post zit, kan er al bij via de standaardregel.
 *
 * Werkt bewust enkel online. Iemand toegang geven is geen deurbeslissing die je
 * in een wachtrij wil laten wachten: dan weet niemand of ze doorging.
 */
export function ScannersSheet({
  visible,
  eventId,
  openScanning,
  onClose,
}: {
  visible: boolean;
  eventId: string;
  openScanning: boolean;
  onClose: () => void;
}) {
  const [scanners, setScanners] = useState<EventScanner[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScannerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setScanners((await fetchEventScanners(eventId)).scanners);
    } catch (caught) {
      setError(scannerErrorMessage(caught));
      setScanners([]);
    }
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [visible, load]);

  // Zoeken terwijl je tikt. De vorige aanvraag laten we gewoon aflopen; het
  // laatste antwoord wint, en dat is bij twintig rijen geen probleem.
  useEffect(() => {
    if (!visible) return;
    const needle = query.trim();
    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        setResults(await searchScannerCandidates(eventId, needle));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, eventId, query]);

  /**
   * De rollende uitnodigings-QR: om de twintig seconden een verse code, want de
   * vorige leeft er dertig. De timer loopt enkel zolang de QR echt zichtbaar is.
   */
  useEffect(() => {
    if (!visible || !qrOpen) return;
    let stopped = false;

    async function refresh() {
      try {
        const invite = await fetchScannerInvite(eventId);
        if (!stopped) setInviteUrl(invite.url);
      } catch {
        if (!stopped) {
          setInviteUrl(null);
          setError('De QR kon niet worden geladen');
        }
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 20_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      // Bij het sluiten weg met de code: wie de QR opnieuw opent, hoort een
      // spinner te zien en niet even een code die al dood is.
      setInviteUrl(null);
    };
  }, [visible, qrOpen, eventId]);

  async function mutate(action: () => Promise<{ scanners: EventScanner[] }>, id: string) {
    setBusyId(id);
    setError(null);
    try {
      setScanners((await action()).scanners);
      setQuery('');
      setResults([]);
    } catch (caught) {
      setError(scannerErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  const existing = new Set((scanners ?? []).map((scanner) => scanner.userId));

  return (
    <Sheet visible={visible} title="Scanners" onClose={onClose}>
      <Text style={styles.hint}>
        {openScanning
          ? 'Elke praesidiumpost kan dit event al scannen. Voeg hier enkel mensen van buiten het praesidium toe.'
          : 'De scanlijst van dit event staat dicht: enkel wie hier staat, kan scannen.'}
      </Text>

      <View style={styles.searchRow}>
        <Search size={17} color={SCANNER.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Naam, e-mail of r-nummer"
          placeholderTextColor={SCANNER.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searching ? <ActivityIndicator size="small" color={SCANNER.textMuted} /> : null}
      </View>

      <Pressable
        style={[styles.qrToggle, qrOpen && styles.qrToggleOn]}
        onPress={() => setQrOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ selected: qrOpen }}
      >
        <QrCode size={17} color={qrOpen ? SCANNER.accentInk : SCANNER.text} />
        <Text style={[styles.qrToggleText, qrOpen && styles.qrToggleTextOn]}>
          {qrOpen ? 'QR verbergen' : 'Toon QR om te laten scannen'}
        </Text>
      </Pressable>

      {qrOpen ? (
        <View style={styles.qrBox}>
          {inviteUrl ? (
            <View style={styles.qrCode}>
              <QRCodeView value={inviteUrl} size={200} backgroundColor={COLORS.surface} color={COLORS.ink} />
            </View>
          ) : (
            <ActivityIndicator color={SCANNER.accent} />
          )}
          <Text style={styles.hint}>
            Laat deze code scannen in de VTK-app (Meer, Code scannen) of met de gewone camera.
            De code vernieuwt om de paar tellen, dus een screenshot of een doorgestuurde foto
            werkt niet.
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.sheetError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(candidate) => candidate.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          results.length > 0 ? <Text style={styles.hint}>Zoekresultaten</Text> : undefined
        }
        ListFooterComponent={
          <View>
            <Text style={styles.hint}>Toegevoegd</Text>
            {scanners === null ? (
              <ActivityIndicator color={SCANNER.accent} style={styles.listSpinner} />
            ) : scanners.length === 0 ? (
              <Text style={styles.hint}>Niemand extra toegevoegd</Text>
            ) : (
              scanners.map((scanner) => (
                <View key={scanner.grantId} style={styles.personRow}>
                  <View style={styles.personBody}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {scanner.name}
                    </Text>
                    <Text style={styles.personMeta} numberOfLines={1}>
                      {scanner.rNumber ?? scanner.email}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      void mutate(
                        () => removeEventScanner(eventId, scanner.grantId),
                        scanner.grantId,
                      )
                    }
                    disabled={busyId === scanner.grantId}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Toegang intrekken: ${scanner.name}`}
                  >
                    {busyId === scanner.grantId ? (
                      <ActivityIndicator size="small" color={SCANNER.textMuted} />
                    ) : (
                      <UserRoundX size={18} color={SCANNER.offlineInk} />
                    )}
                  </Pressable>
                </View>
              ))
            )}
          </View>
        }
        renderItem={({ item }) => {
          const already = existing.has(item.id);
          return (
            <View style={styles.personRow}>
              <View style={styles.personBody}>
                <Text style={styles.personName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.personMeta} numberOfLines={1}>
                  {item.rNumber ?? item.email}
                </Text>
              </View>
              <Pressable
                style={[styles.checkInButton, already && styles.checkInDisabled]}
                disabled={already || busyId === item.id}
                onPress={() => void mutate(() => addEventScanner(eventId, item.id), item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Toevoegen als scanner: ${item.name}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={SCANNER.accentInk} />
                ) : (
                  <UserPlus size={14} color={already ? SCANNER.textMuted : SCANNER.accentInk} />
                )}
                <Text style={[styles.checkInText, already && styles.checkInTextDisabled]}>
                  {already ? 'Staat erbij' : 'Toevoegen'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </Sheet>
  );
}

/** Aan welke ingang dit toestel staat; reist als `gateId` mee met elke scan. */
export function GateSheet({
  visible,
  gates,
  gateId,
  onPick,
  onClose,
}: {
  visible: boolean;
  gates: ScannerGate[];
  gateId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Ingang" onClose={onClose}>
      {gates.length === 0 ? <Text style={styles.hint}>Geen actieve ingang</Text> : null}
      {gates.map((gate) => (
        <Pressable
          key={gate.id}
          style={styles.gateRow}
          onPress={() => {
            onPick(gate.id);
            onClose();
          }}
          accessibilityRole="button"
        >
          <MapPin size={17} color={gate.id === gateId ? SCANNER.accent : SCANNER.textMuted} />
          <Text style={[styles.gateName, gate.id === gateId && styles.gateActive]}>{gate.name}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Het paneel staat onderaan een kolom in plaats van absoluut vastgeplakt: enkel
  // zo kan het meeschuiven wanneer het klavier opkomt.
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: SCANNER.scrim },
  sheet: {
    maxHeight: '85%',
    backgroundColor: SCANNER.header,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: 17, color: SCANNER.text },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SCANNER.field,
    borderRadius: RADIUS.sm,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  searchInput: { flex: 1, height: HIT_TARGET, fontFamily: FONTS.regular, fontSize: 15, color: SCANNER.text },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: SCANNER.textMuted,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SCANNER.line,
  },
  typePin: { width: 10, height: 10, borderRadius: RADIUS.pill },
  personBody: { flex: 1 },
  personName: { fontFamily: FONTS.semibold, fontSize: 15, color: SCANNER.text },
  personMeta: { fontFamily: FONTS.regular, fontSize: 12, color: SCANNER.textMuted },
  sheetError: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: SCANNER.offlineBg,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: SCANNER.offlineInk,
  },
  listSpinner: { paddingVertical: SPACING.lg },
  qrToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: HIT_TARGET,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SCANNER.line,
    borderRadius: RADIUS.pill,
  },
  qrToggleOn: { backgroundColor: SCANNER.accent, borderColor: SCANNER.accent },
  qrToggleText: { fontFamily: FONTS.semibold, fontSize: 14, color: SCANNER.text },
  qrToggleTextOn: { color: SCANNER.accentInk },
  qrBox: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.lg },
  qrCode: { padding: SPACING.sm, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCANNER.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  checkInDisabled: { backgroundColor: SCANNER.field },
  checkInText: { fontFamily: FONTS.semibold, fontSize: 13, color: SCANNER.accentInk },
  checkInTextDisabled: { color: SCANNER.textMuted },
  codeInput: {
    backgroundColor: SCANNER.field,
    borderRadius: RADIUS.sm,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    height: HIT_TARGET + 4,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: SCANNER.text,
  },
  primaryButton: {
    backgroundColor: SCANNER.accent,
    borderRadius: RADIUS.sm,
    margin: SPACING.lg,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: SCANNER.accentInk },
  cardWaiting: { alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xl },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: SCANNER.text },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SCANNER.line,
  },
  gateName: { fontFamily: FONTS.medium, fontSize: 15, color: SCANNER.text },
  gateActive: { fontFamily: FONTS.semibold, color: SCANNER.accent },
});
