import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NetworkError } from '../api/client';
import {
  fetchBootstrap,
  postCardScan,
  postReverse,
  postScan,
  postScanBatch,
  SCAN_BATCH_LIMIT,
} from '../api/scanner';
import { cardHash, looksLikeCard } from './cardHash';
import { credentialFromScan, ticketColorKey, verifyOffline } from './offline';
import { createId, deviceIdFor } from './ids';
import {
  dequeueScans,
  enqueueScan,
  loadManifest,
  loadQueue,
  queueSize as readQueueSize,
  saveManifest,
} from './storage';
import type {
  QueuedScan,
  ScanApiResponse,
  ScanConflict,
  ScanHistoryItem,
  ScanKind,
  ScannerBootstrap,
  ScannerManifest,
} from './types';

/**
 * De volledige werking van het scanscherm.
 *
 * Poort van `apps/web/components/ticketing/scanner/ScannerApp.tsx`, via de
 * vroegere vtk-scanner-app. Alles wat daar over dedup, offline en het
 * scanlogboek geldt, geldt hier onveranderd; enkel de schil is native. Het scherm
 * eronder (`src/screens/scan/[eventId].tsx`) tekent en beslist niets.
 */

const ACCEPTED_RESULTS = new Set(['ACCEPTED', 'CHECKED_IN', 'SUCCESS', 'VALID']);
const DUPLICATE_RESULTS = new Set(['DUPLICATE', 'ALREADY_CHECKED_IN', 'ALREADY_USED']);

/** Hoe lang de uitkomst over het camerabeeld blijft staan. */
const FEEDBACK_MS = 1800;
const FEEDBACK_REVERSED_MS = 2200;
/** Dezelfde code binnen dit venster is dezelfde persoon die stil blijft staan. */
const DEBOUNCE_MS = 2500;
const SYNC_INTERVAL_MS = 20_000;
const HISTORY_LIMIT = 50;

function resultKind(payload: ScanApiResponse): ScanKind {
  const result = (payload.result ?? payload.status ?? '').toUpperCase();
  if (ACCEPTED_RESULTS.has(result)) return 'accepted';
  if (DUPLICATE_RESULTS.has(result)) return 'duplicate';
  return 'rejected';
}

function fallbackMessage(kind: ScanKind): string {
  if (kind === 'accepted') return 'Ticket aanvaard';
  if (kind === 'duplicate') return 'Ticket al gescand';
  if (kind === 'rejected') return 'Ticket niet geldig';
  return 'Scan kon niet worden gecontroleerd';
}

/**
 * Wat de server terugstuurt wanneer een kaart geen ticket opleverde. "Ongeldig
 * ticket" zou hier het verkeerde zeggen: er ís geen ticket, en het verschil
 * tussen een onleesbare kaart en een kaart zonder ticket bepaalt wat de
 * deurploeg doet.
 */
function cardMissMessage(reason: string | undefined): string {
  if (reason === 'NO_TICKET') return 'Geen ticket op deze kaart';
  if (reason === 'CARD_UNREADABLE') return 'Kaart niet herkend';
  if (reason === 'CARD_CHECKIN_DISABLED') return 'Kaartcheck-in staat uit voor dit event';
  return 'Kaart gaf geen ticket';
}

/**
 * Een minimale bootstrap wanneer de server onbereikbaar is maar er nog een
 * manifest op het toestel staat: dan kan de scanner prima verder werken.
 */
function offlineBootstrap(manifest: ScannerManifest): ScannerBootstrap {
  return {
    event: { id: '', title: 'Offline scannen' },
    gates: [],
    stats: {
      total: manifest.ticketCount,
      checkedIn: manifest.tickets.filter((ticket) => ticket.checkedIn).length,
    },
    manifest,
  };
}

async function buzz(kind: ScanKind) {
  try {
    await Haptics.notificationAsync(
      kind === 'accepted'
        ? Haptics.NotificationFeedbackType.Success
        : kind === 'reversed'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    );
  } catch {
    // Een toestel zonder trilmotor; niets aan te doen.
  }
}

export type ScannerState = ReturnType<typeof useScanner>;

export function useScanner(eventId: string) {
  const busyRef = useRef(false);
  const lastCredentialRef = useRef<{ value: string; at: number } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const onlineRef = useRef(true);

  const [bootstrap, setBootstrap] = useState<ScannerBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gateId, setGateId] = useState('');
  const [deviceId] = useState(() => deviceIdFor(eventId));
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [reversingScanId, setReversingScanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ScanHistoryItem | null>(null);
  const [sessionCounts, setSessionCounts] = useState({ accepted: 0, duplicate: 0, rejected: 0 });
  const [serverStats, setServerStats] = useState<{ checkedIn?: number; total?: number }>({});
  const [manifest, setManifest] = useState<ScannerManifest | null>(null);
  const [queueSize, setQueueSize] = useState(() => readQueueSize(eventId));
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<ScanConflict[]>([]);
  // De codes die dit toestel deze sessie al aanvaardde. Dubbels aan dezelfde deur
  // vangen we daarmee ook offline af; dubbels tussen deuren pas bij het
  // synchroniseren, want daar is netwerk voor nodig.
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  const network = Network.useNetworkState();
  // `isInternetReachable` is undefined tot de eerste meting; dan is "verbonden"
  // het beste antwoord dat we hebben.
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  // De callbacks hieronder lezen de ref en niet `online`: een scan die net
  // vertrok, hoort niet opnieuw aangemaakt te worden omdat het netwerk wankelt.
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const showFeedback = useCallback((item: ScanHistoryItem, ms = FEEDBACK_MS) => {
    setFeedback(item);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), ms);
  }, []);

  const record = useCallback((item: ScanHistoryItem) => {
    setHistory((items) => [item, ...items].slice(0, HISTORY_LIMIT));
  }, []);

  const countKind = useCallback((kind: ScanKind) => {
    if (kind === 'error' || kind === 'reversed') return;
    setSessionCounts((counts) => ({ ...counts, [kind]: counts[kind] + 1 }));
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setBootstrapError(null);
    try {
      const payload = await fetchBootstrap(eventId);
      setBootstrap(payload);
      setServerStats(payload.stats ?? {});
      setGateId((current) => current || payload.gates[0]?.id || '');
      if (payload.manifest?.complete) {
        setManifest(payload.manifest);
        saveManifest(eventId, payload.manifest);
      }
    } catch (error) {
      // Zonder netwerk is een eerder bewaard manifest genoeg om te blijven
      // scannen; enkel wie nog nooit online was, kan hier niets.
      const cached = loadManifest(eventId);
      if (cached) {
        setManifest(cached);
        setBootstrap((current) => current ?? offlineBootstrap(cached));
      } else if (error instanceof ApiError && error.isForbidden) {
        setBootstrapError('Je hebt geen scanrechten voor dit evenement');
      } else if (error instanceof ApiError && error.status === 404) {
        setBootstrapError('Dit evenement bestaat niet meer');
      } else {
        setBootstrapError('Scanner kon niet worden geladen');
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Na de eerste render, zoals het scannerspaneel zijn lijst ophaalt: zo zet het
  // effect zelf geen state, en een scherm dat meteen weer dichtgaat, haalt niets op.
  useEffect(() => {
    const timer = setTimeout(() => void loadBootstrap(), 0);
    return () => clearTimeout(timer);
  }, [loadBootstrap]);

  // ── Synchroniseren ────────────────────────────────────────────────────────

  /**
   * Stuurt de wachtrij in blokken naar de server. Veilig om op elk moment te
   * draaien: elke scan draagt haar `clientScanId` en de server dedupliceert
   * daarop, dus een halve synchronisatie kan gewoon opnieuw.
   */
  const flushQueue = useCallback(async () => {
    if (syncingRef.current || !onlineRef.current) return;
    let pending = loadQueue(eventId);
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    try {
      while (pending.length > 0 && onlineRef.current) {
        const batch = pending.slice(0, SCAN_BATCH_LIMIT);
        const payload = await postScanBatch(eventId, batch);

        // Alles wat de server verwerkt heeft, mag uit de wachtrij. Enkel items
        // die een fout gaven blijven staan voor een volgende poging.
        const failed = new Set(
          payload.results.filter((row) => row.result === 'ERROR').map((row) => row.clientScanId),
        );
        const done = batch
          .map((item) => item.clientScanId)
          .filter((id) => !failed.has(id));
        dequeueScans(done);
        pending = pending.filter((item) => !done.includes(item.clientScanId));
        setQueueSize(pending.length);
        if (payload.stats) setServerStats(payload.stats);

        // Offline aanvaard, maar de server zegt iets anders: dat is precies het
        // geval waar de deurploeg achteraf naar moet kunnen kijken.
        const byId = new Map(batch.map((item) => [item.clientScanId, item]));
        const fresh = payload.results
          .filter((row) => row.result !== 'ERROR' && !ACCEPTED_RESULTS.has(row.result.toUpperCase()))
          .flatMap<ScanConflict>((row) => {
            const queued = byId.get(row.clientScanId);
            if (!queued || queued.offlineKind !== 'accepted') return [];
            return [
              {
                clientScanId: row.clientScanId,
                code: queued.code,
                attendeeName: queued.attendeeName,
                result: row.result,
                scannedAt: queued.clientScannedAt,
              },
            ];
          });
        if (fresh.length > 0) setConflicts((current) => [...fresh, ...current].slice(0, 50));

        if (failed.size === batch.length) break;
      }
    } catch {
      // Netwerk viel weg of de server gaf een fout; de wachtrij blijft staan.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [eventId]);

  // Synchroniseren zodra er weer verbinding is, en daarna geregeld opnieuw: een
  // telefoon meldt zich soms "online" terwijl het netwerk nog niet bruikbaar is.
  useEffect(() => {
    if (!online) return;
    const first = setTimeout(() => void flushQueue(), 0);
    const timer = setInterval(() => void flushQueue(), SYNC_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [online, flushQueue]);

  // ── Scannen ───────────────────────────────────────────────────────────────

  const processCredential = useCallback(
    async (rawValue: string) => {
      const credential = credentialFromScan(rawValue);
      if (!credential || busyRef.current) return;

      const previous = lastCredentialRef.current;
      if (previous?.value === credential && Date.now() - previous.at < DEBOUNCE_MS) return;
      lastCredentialRef.current = { value: credential, at: Date.now() };

      // Zonder netwerk beslist het toestel zelf, op basis van het manifest, en
      // gaat de scan de wachtrij in.
      if (!onlineRef.current) {
        const scannedAt = new Date().toISOString();
        if (!manifest) {
          const item: ScanHistoryItem = {
            id: createId(),
            scannedAt,
            kind: 'error',
            code: credential.slice(-10),
            message: 'Geen netwerk en geen ticketlijst op dit toestel',
          };
          showFeedback(item);
          record(item);
          return;
        }

        const verdict = verifyOffline(manifest, credential, scannedCodes);
        const clientScanId = createId();
        const entry = 'entry' in verdict ? verdict.entry : undefined;
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind: verdict.kind,
          code: entry?.code ?? credential.slice(-10),
          attendeeName: entry?.name,
          typeName: entry?.type,
          typeColor: entry?.typeColor,
          pending: true,
          message:
            verdict.kind === 'accepted'
              ? 'Aanvaard (offline)'
              : verdict.kind === 'duplicate'
                ? 'Al gescand'
                : verdict.reason === 'unknown'
                  ? 'Onbekend ticket'
                  : verdict.reason === 'version'
                    ? 'Verouderde ticketcode'
                    : 'Code niet leesbaar',
        };

        if (verdict.kind === 'accepted') {
          const code = verdict.entry.code;
          setScannedCodes((current) => new Set(current).add(code));
        }

        // Ook een offline geweigerde scan gaat mee: de server doet de volledige
        // controle en het scanlogboek hoort compleet te zijn.
        const queued: QueuedScan = {
          clientScanId,
          credential,
          gateId: gateId || null,
          deviceId,
          clientScannedAt: scannedAt,
          offlineKind: verdict.kind,
          code: item.code,
          attendeeName: item.attendeeName,
          typeName: item.typeName,
          typeColor: item.typeColor,
        };
        enqueueScan(eventId, queued);
        setQueueSize(readQueueSize(eventId));

        showFeedback(item);
        record(item);
        countKind(verdict.kind);
        void buzz(verdict.kind);
        return;
      }

      busyRef.current = true;
      const clientScanId = createId();
      try {
        const payload = await postScan(eventId, {
          credential,
          clientScanId,
          gateId: gateId || null,
          deviceId,
        });
        const kind = resultKind(payload);
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt: new Date().toISOString(),
          kind,
          code: payload.ticket?.publicId ?? credential.slice(-10),
          attendeeName: payload.ticket?.attendeeName ?? payload.attendeeName,
          typeName: payload.ticket?.typeName ?? payload.ticket?.ticketTypeName ?? payload.typeName,
          typeColor: ticketColorKey(payload.ticket?.typeColor ?? payload.typeColor),
          message: payload.message ?? fallbackMessage(kind),
          scanId: kind === 'accepted' ? payload.scanId : undefined,
        };
        showFeedback(item);
        record(item);
        if (kind === 'accepted' && payload.ticket?.publicId) {
          const code = payload.ticket.publicId;
          setScannedCodes((current) => new Set(current).add(code));
        }
        if (payload.stats) setServerStats(payload.stats);
        countKind(kind);
        void buzz(kind);
      } catch (error) {
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt: new Date().toISOString(),
          kind: 'error',
          code: credential.slice(-10),
          message:
            error instanceof NetworkError
              ? 'Netwerkfout tijdens controle'
              : error instanceof ApiError && error.isForbidden
                ? 'Je hebt geen scanrechten voor dit evenement'
                : 'Scan kon niet worden gecontroleerd',
        };
        showFeedback(item);
        record(item);
        void buzz('error');
      } finally {
        busyRef.current = false;
      }
    },
    [countKind, deviceId, eventId, gateId, manifest, record, scannedCodes, showFeedback],
  );

  /**
   * Inchecken met een studentenkaart. De lezer gedraagt zich als een toetsenbord
   * en tikt `serial;cardAppId`; die string gaat ongewijzigd naar de server, want
   * enkel daar staat de kaarttabel en het contact met KU Leuven.
   */
  const processCard = useCallback(
    async (raw: string) => {
      const card = raw.replace(/[\r\n]+/g, '').trim();
      if (!card || busyRef.current) return;

      const previous = lastCredentialRef.current;
      if (previous?.value === card && Date.now() - previous.at < DEBOUNCE_MS) return;
      lastCredentialRef.current = { value: card, at: Date.now() };

      const scannedAt = new Date().toISOString();
      const clientScanId = createId();

      // Zonder netwerk zoekt het toestel de kaart op in de gehashte tabel die met
      // het manifest meekwam. Levert dat een ticketcode op, dan gaat die door
      // exact dezelfde weg als een gescande QR.
      if (!onlineRef.current) {
        const code =
          manifest?.cardSalt && manifest.cards
            ? manifest.cards[await cardHash(manifest.cardSalt, card)]
            : undefined;
        if (code) {
          // De debounce hierboven staat nu op de kaart; anders weigert de code
          // die er meteen uit volgt zichzelf.
          lastCredentialRef.current = null;
          void processCredential(code);
          return;
        }
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind: 'rejected',
          code: 'kaart',
          message: manifest?.cards
            ? 'Kaart niet in de lijst op dit toestel; scan de QR'
            : 'Kaartlezen kan niet zonder netwerk; scan de QR',
        };
        showFeedback(item);
        record(item);
        countKind('rejected');
        void buzz('rejected');
        return;
      }

      busyRef.current = true;
      try {
        const payload = await postCardScan(eventId, {
          card,
          clientScanId,
          gateId: gateId || null,
          deviceId,
        });
        const kind = resultKind(payload);
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind,
          code: payload.ticket?.publicId ?? 'kaart',
          attendeeName: payload.ticket?.attendeeName ?? payload.attendeeName,
          typeName: payload.ticket?.typeName ?? payload.ticket?.ticketTypeName ?? payload.typeName,
          typeColor: ticketColorKey(payload.ticket?.typeColor ?? payload.typeColor),
          message:
            payload.message ??
            (payload.reason ? cardMissMessage(payload.reason) : fallbackMessage(kind)),
          scanId: kind === 'accepted' ? payload.scanId : undefined,
        };
        showFeedback(item);
        record(item);
        if (kind === 'accepted' && payload.ticket?.publicId) {
          const code = payload.ticket.publicId;
          setScannedCodes((current) => new Set(current).add(code));
        }
        if (payload.stats) setServerStats(payload.stats);
        countKind(kind);
        void buzz(kind);
      } catch {
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind: 'error',
          code: 'kaart',
          message: 'Netwerkfout tijdens het uitlezen van de kaart',
        };
        showFeedback(item);
        record(item);
        void buzz('error');
      } finally {
        busyRef.current = false;
      }
    },
    [countKind, deviceId, eventId, gateId, manifest, processCredential, record, showFeedback],
  );

  /**
   * Wat er in het leesveld belandde naar het juiste pad sturen: een puntkomma
   * betekent studentenkaart, alles anders is een ticketcode. Dezelfde lezer wordt
   * namelijk ook wel eens op een QR gericht.
   */
  const processReaderInput = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[\r\n]+/g, '').trim();
      if (!cleaned) return;
      if (looksLikeCard(cleaned)) void processCard(cleaned);
      else void processCredential(cleaned);
    },
    [processCard, processCredential],
  );

  // ── Terugdraaien ──────────────────────────────────────────────────────────

  const reverseScan = useCallback(
    async (item: ScanHistoryItem) => {
      if (!item.scanId || reversingScanId) return;
      setReversingScanId(item.scanId);
      try {
        const payload = await postReverse(eventId, {
          scanId: item.scanId,
          clientScanId: createId(),
        });
        if (payload.result !== 'REVERSED') {
          throw new Error(payload.message ?? 'Check-in kon niet worden teruggedraaid');
        }
        const reversed: ScanHistoryItem = {
          ...item,
          kind: 'reversed',
          message: 'Check-in teruggedraaid',
          scanId: undefined,
          scannedAt: new Date().toISOString(),
        };
        setHistory((items) => items.map((current) => (current.id === item.id ? reversed : current)));
        showFeedback(reversed, FEEDBACK_REVERSED_MS);
        if (payload.stats) setServerStats(payload.stats);
        setSessionCounts((counts) => ({ ...counts, accepted: Math.max(0, counts.accepted - 1) }));
        // De persoon staat weer buiten, dus die code mag opnieuw binnen.
        setScannedCodes((current) => {
          const next = new Set(current);
          next.delete(item.code);
          return next;
        });
        void buzz('reversed');
      } catch (error) {
        showFeedback(
          {
            ...item,
            kind: 'error',
            message:
              error instanceof Error && error.message !== 'Netwerkfout'
                ? error.message
                : 'Check-in kon niet worden teruggedraaid',
            scanId: undefined,
            scannedAt: new Date().toISOString(),
          },
          FEEDBACK_REVERSED_MS,
        );
      } finally {
        setReversingScanId(null);
      }
    },
    [eventId, reversingScanId, showFeedback],
  );

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  return {
    bootstrap,
    bootstrapError,
    loading,
    online,
    gateId,
    setGateId,
    manifest,
    history,
    feedback,
    sessionCounts,
    serverStats,
    queueSize,
    syncing,
    conflicts,
    clearConflicts: () => setConflicts([]),
    scannedCodes,
    reversingScanId,
    loadBootstrap,
    flushQueue,
    processCredential,
    processCard,
    processReaderInput,
    reverseScan,
  };
}
