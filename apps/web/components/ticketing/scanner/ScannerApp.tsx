"use client";

import Link from "next/link";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CloudUpload,
  CircleGauge,
  Flashlight,
  History,
  IdCard,
  Keyboard,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Signal,
  SignalZero,
  TicketCheck,
  UserRound,
  UserRoundCog,
  Users,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import type {
  QueuedScan,
  ScanApiResponse,
  ScanBatchResponse,
  ScanConflict,
  ScanHistoryItem,
  ScanKind,
  ScannerBootstrap,
  ScannerManifest,
} from "./types";
import { cardHashInBrowser } from "@/lib/ticketing/cardHash";
import { ticketColorKey } from "@/lib/ticketing/ticketColors";
import { loadManifest, loadQueue, saveManifest, saveQueue, verifyOffline } from "./offline";
import { InstallButton } from "./InstallButton";
import { ScannerAccess } from "./ScannerAccess";

const CARD_READER_KEY = "vtk-ticket-scanner-card-reader";

const ACCEPTED_RESULTS = new Set(["ACCEPTED", "CHECKED_IN", "SUCCESS", "VALID"]);
const DUPLICATE_RESULTS = new Set(["DUPLICATE", "ALREADY_CHECKED_IN", "ALREADY_USED"]);

/** Een gequeuede scan omzetten naar wat het scan-endpoint verwacht. */
function toScanRequest(item: QueuedScan) {
  return {
    credential: item.credential,
    clientScanId: item.clientScanId,
    gateId: item.gateId,
    deviceId: item.deviceId,
    clientScannedAt: item.clientScannedAt,
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function credentialFromScan(raw: string) {
  const value = raw.trim();
  try {
    const url = new URL(value);
    return url.searchParams.get("credential") ?? url.searchParams.get("ticket") ?? value;
  } catch {
    return value;
  }
}

function resultKind(payload: ScanApiResponse, ok: boolean): ScanKind {
  if (!ok) return "error";
  const result = (payload.result ?? payload.status ?? "").toUpperCase();
  if (ACCEPTED_RESULTS.has(result)) return "accepted";
  if (DUPLICATE_RESULTS.has(result)) return "duplicate";
  return "rejected";
}

function fallbackMessage(kind: ScanKind) {
  if (kind === "accepted") return "Ticket aanvaard";
  if (kind === "duplicate") return "Ticket al gescand";
  if (kind === "rejected") return "Ticket niet geldig";
  return "Scan kon niet worden gecontroleerd";
}

/**
 * Wat de server terugstuurt wanneer een kaart geen ticket opleverde. "Ongeldig
 * ticket" zou hier het verkeerde zeggen: er ís geen ticket, en het verschil
 * tussen een onleesbare kaart en een kaart zonder ticket bepaalt wat de
 * deurploeg doet.
 */
function cardMissMessage(reason: string | undefined) {
  if (reason === "NO_TICKET") return "Geen ticket op deze kaart";
  if (reason === "CARD_UNREADABLE") return "Kaart niet herkend";
  if (reason === "CARD_CHECKIN_DISABLED") return "Kaartcheck-in staat uit voor dit event";
  return "Kaart gaf geen ticket";
}

/** Een kaartlezer tikt `serial;cardAppId`; een ticketcode heeft nooit een puntkomma. */
function looksLikeCard(value: string) {
  return value.includes(";");
}

/**
 * Een minimale bootstrap wanneer de server onbereikbaar is maar er nog een
 * manifest op het toestel staat. Zonder dit bleef de scanner hangen op "Scanner
 * niet beschikbaar" terwijl hij prima offline kon werken.
 */
function offlineBootstrap(manifest: ScannerManifest): ScannerBootstrap {
  return {
    event: { id: "", title: "Offline scannen" },
    gates: [],
    stats: {
      total: manifest.ticketCount,
      checkedIn: manifest.tickets.filter((ticket) => ticket.checkedIn).length,
    },
    manifest,
  };
}

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
function ScannerFeedback({ item }: { item: ScanHistoryItem }) {
  const accepted = item.kind === "accepted";
  const showType = accepted && Boolean(item.typeName);
  return (
    <div
      className={`scanner-feedback is-${item.kind}`}
      style={
        accepted && item.typeColor
          ? { background: `var(--ticket-color-${item.typeColor})` }
          : undefined
      }
      role="status"
      aria-live="assertive"
    >
      <div className="scanner-feedback-icon">
        {item.kind === "accepted" ? <Check aria-hidden="true" /> : item.kind === "duplicate" || item.kind === "reversed" ? <RotateCcw aria-hidden="true" /> : <X aria-hidden="true" />}
      </div>
      <div>
        <strong className={showType ? "scanner-feedback-type" : undefined}>
          {showType ? item.typeName : item.message}
        </strong>
        {item.attendeeName ? <span>{item.attendeeName}</span> : null}
        {showType ? (
          <small className="scanner-feedback-verdict">
            <Check size={13} aria-hidden="true" /> {item.message}
          </small>
        ) : item.typeName ? (
          <small>{item.typeName}</small>
        ) : null}
      </div>
    </div>
  );
}

export function ScannerApp({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const lastCredentialRef = useRef<{ value: string; at: number } | null>(null);
  const processRef = useRef<(value: string) => void>(() => undefined);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const [bootstrap, setBootstrap] = useState<ScannerBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [gateId, setGateId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cardReaderOn, setCardReaderOn] = useState(false);
  const [cardValue, setCardValue] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [reversingScanId, setReversingScanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ScanHistoryItem | null>(null);
  const [sessionCounts, setSessionCounts] = useState({ accepted: 0, duplicate: 0, rejected: 0 });
  const [serverStats, setServerStats] = useState<{ checkedIn?: number; total?: number }>({});
  const [manifest, setManifest] = useState<ScannerManifest | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<ScanConflict[]>([]);
  // De codes die dit toestel deze sessie al aanvaardde. Dubbels aan dezelfde deur
  // vangen we daarmee ook offline af; dubbels tussen deuren pas bij het
  // synchroniseren, want daar is netwerk voor nodig. State en geen ref, want de
  // namenlijst moet meteen zien wie er net binnen is.
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [listOpen, setListOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [accessOpen, setAccessOpen] = useState(false);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setBootstrapError(null);
    try {
      const response = await fetch(`/api/tickets/events/${eventId}/scanner/bootstrap`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as ScannerBootstrap | { error?: string } | null;
      if (!response.ok || !payload || !("event" in payload)) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Scanner kon niet worden geladen");
      }
      setBootstrap(payload);
      setServerStats(payload.stats ?? {});
      setGateId((current) => current || payload.gates[0]?.id || "");
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
      } else {
        setBootstrapError(error instanceof Error ? error.message : "Scanner kon niet worden geladen");
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    const initializeTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      const deviceStorageKey = `vtk-ticket-scanner-device-id:${eventId}`;
      const savedDeviceId = localStorage.getItem(deviceStorageKey) ?? createId();
      localStorage.setItem(deviceStorageKey, savedDeviceId);
      setDeviceId(savedDeviceId);
      // Of dit toestel een kaartlezer heeft, is een eigenschap van dat toestel en
      // niet van het event: de laptop aan de deur heeft er een, de telefoon
      // ernaast niet. Daarom per toestel bewaard en niet per event.
      setCardReaderOn(localStorage.getItem(CARD_READER_KEY) === "1");
      // Nog niet verstuurde scans van een vorige sessie: die telling hoort er
      // meteen te staan, ook voor de bootstrap klaar is.
      setQueueSize(loadQueue(eventId).length);
      void loadBootstrap();
    }, 0);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearTimeout(initializeTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [eventId, loadBootstrap]);

  /**
   * Stuurt de wachtrij in blokken naar de server. Veilig om op elk moment te
   * draaien: elke scan draagt haar `clientScanId` en de server dedupliceert
   * daarop, dus een halve synchronisatie kan gewoon opnieuw.
   */
  const flushQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    let pending = loadQueue(eventId);
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    try {
      while (pending.length > 0 && navigator.onLine) {
        const batch = pending.slice(0, 100);
        const response = await fetch(`/api/tickets/events/${eventId}/scan/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scans: batch.map(toScanRequest) }),
        });
        if (!response.ok) break;
        const payload = (await response.json()) as ScanBatchResponse;

        // Alles wat de server verwerkt heeft, mag uit de wachtrij. Enkel items die
        // een fout gaven blijven staan voor een volgende poging.
        const failed = new Set(
          payload.results.filter((r) => r.result === "ERROR").map((r) => r.clientScanId),
        );
        const handled = new Set(batch.map((item) => item.clientScanId));
        pending = pending.filter(
          (item) => !handled.has(item.clientScanId) || failed.has(item.clientScanId),
        );
        saveQueue(eventId, pending);
        setQueueSize(pending.length);
        if (payload.stats) setServerStats(payload.stats);

        // Offline aanvaard, maar de server zegt iets anders: dat is precies het
        // geval waar de deurploeg achteraf naar moet kunnen kijken.
        const byId = new Map(batch.map((item) => [item.clientScanId, item]));
        const fresh = payload.results
          .filter((r) => r.result !== "ERROR" && !ACCEPTED_RESULTS.has(r.result.toUpperCase()))
          .flatMap<ScanConflict>((r) => {
            const queued = byId.get(r.clientScanId);
            if (!queued || queued.offlineKind !== "accepted") return [];
            return [
              {
                clientScanId: r.clientScanId,
                code: queued.code,
                attendeeName: queued.attendeeName,
                result: r.result,
                scannedAt: queued.clientScannedAt,
              },
            ];
          });
        if (fresh.length > 0) setConflicts((current) => [...fresh, ...current].slice(0, 50));

        if (failed.size === batch.length) break;
      }
    } catch {
      // Netwerk viel weg tijdens het synchroniseren; de wachtrij blijft staan.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [eventId]);

  // Synchroniseren zodra er weer verbinding is, en daarna geregeld opnieuw: een
  // telefoon meldt zich soms "online" terwijl het netwerk nog niet bruikbaar is.
  // De eerste poging loopt via een timeout, want `flushQueue` zet meteen state en
  // dat mag niet synchroon in een effect.
  useEffect(() => {
    if (!online) return;
    const first = window.setTimeout(() => void flushQueue(), 0);
    const timer = window.setInterval(() => void flushQueue(), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [online, flushQueue]);

  const processCredential = useCallback(async (rawValue: string) => {
    const credential = credentialFromScan(rawValue);
    if (!credential || busyRef.current) return;

    const previous = lastCredentialRef.current;
    if (previous?.value === credential && Date.now() - previous.at < 2500) return;
    lastCredentialRef.current = { value: credential, at: Date.now() };

    if (!deviceId) return;

    // Zonder netwerk beslist het toestel zelf, op basis van het manifest, en gaat
    // de scan de wachtrij in. Voorheen werd hier gewoon geweigerd, waardoor de
    // scanner aan een deur zonder bereik onbruikbaar was.
    if (!navigator.onLine) {
      const scannedAt = new Date().toISOString();
      if (!manifest) {
        const item: ScanHistoryItem = {
          id: createId(),
          scannedAt,
          kind: "error",
          code: credential.slice(-10),
          message: "Geen netwerk en geen ticketlijst op dit toestel",
        };
        setFeedback(item);
        setHistory((items) => [item, ...items].slice(0, 50));
        return;
      }

      const verdict = verifyOffline(manifest, credential, scannedCodes);
      const clientScanId = createId();
      const entry = "entry" in verdict ? verdict.entry : undefined;
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
          verdict.kind === "accepted"
            ? "Aanvaard (offline)"
            : verdict.kind === "duplicate"
              ? "Al gescand"
              : verdict.reason === "unknown"
                ? "Onbekend ticket"
                : verdict.reason === "version"
                  ? "Verouderde ticketcode"
                  : "Code niet leesbaar",
      };

      if (verdict.kind === "accepted") {
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
      const next = [...loadQueue(eventId), queued];
      saveQueue(eventId, next);
      setQueueSize(next.length);

      setFeedback(item);
      setHistory((items) => [item, ...items].slice(0, 50));
      setSessionCounts((counts) => ({ ...counts, [verdict.kind]: counts[verdict.kind] + 1 }));
      if (navigator.vibrate) navigator.vibrate(verdict.kind === "accepted" ? 60 : [90, 50, 90]);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
      return;
    }

    busyRef.current = true;
    const clientScanId = createId();
    try {
      const response = await fetch(`/api/tickets/events/${eventId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, clientScanId, gateId: gateId || null, deviceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as ScanApiResponse;
      const kind = resultKind(payload, response.ok);
      const item: ScanHistoryItem = {
        id: clientScanId,
        scannedAt: new Date().toISOString(),
        kind,
        code: payload.ticket?.publicId ?? credential.slice(-10),
        attendeeName: payload.ticket?.attendeeName ?? payload.attendeeName,
        typeName: payload.ticket?.typeName ?? payload.ticket?.ticketTypeName ?? payload.typeName,
        typeColor: ticketColorKey(payload.ticket?.typeColor ?? payload.typeColor),
        message: payload.message ?? fallbackMessage(kind),
        scanId: kind === "accepted" ? payload.scanId : undefined,
      };
      setFeedback(item);
      setHistory((items) => [item, ...items].slice(0, 50));
      if (kind === "accepted" && payload.ticket?.publicId) {
        const code = payload.ticket.publicId;
        setScannedCodes((current) => new Set(current).add(code));
      }
      if (payload.stats) setServerStats(payload.stats);
      if (kind !== "error") {
        setSessionCounts((counts) => ({
          ...counts,
          [kind]: counts[kind === "accepted" ? "accepted" : kind === "duplicate" ? "duplicate" : "rejected"] + 1,
        }));
      }
      if (navigator.vibrate) navigator.vibrate(kind === "accepted" ? 60 : [90, 50, 90]);
    } catch {
      const item: ScanHistoryItem = {
        id: clientScanId,
        scannedAt: new Date().toISOString(),
        kind: "error",
        code: credential.slice(-10),
        message: "Netwerkfout tijdens controle",
      };
      setFeedback(item);
      setHistory((items) => [item, ...items].slice(0, 50));
    } finally {
      busyRef.current = false;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
    }
  }, [deviceId, eventId, gateId, manifest, scannedCodes]);

  /**
   * Inchecken met een studentenkaart. De lezer gedraagt zich als een toetsenbord
   * en tikt `serial;cardAppId`; die string gaat ongewijzigd naar de server, want
   * enkel daar staat de kaarttabel en het contact met KU Leuven.
   *
   * Dit werkt bewust enkel online. Een kaart is geen ticketcode: het toestel kan
   * er zelf niets mee, ook niet met het manifest in de hand.
   */
  const processCard = useCallback(
    async (raw: string) => {
      const card = raw.replace(/[\r\n]+/g, "").trim();
      if (!card || busyRef.current || !deviceId) return;

      const previous = lastCredentialRef.current;
      if (previous?.value === card && Date.now() - previous.at < 2500) return;
      lastCredentialRef.current = { value: card, at: Date.now() };

      const scannedAt = new Date().toISOString();
      const clientScanId = createId();

      // Zonder netwerk zoekt het toestel de kaart op in de tabel die met het
      // manifest meekwam. Levert dat een ticketcode op, dan gaat die door
      // dezelfde weg als een gescande QR: het manifest beslist, de scan gaat de
      // wachtrij in, en de server doet de volledige controle bij het
      // synchroniseren.
      if (!navigator.onLine) {
        const code = manifest?.cardSalt && manifest.cards
          ? manifest.cards[(await cardHashInBrowser(manifest.cardSalt, card)) ?? ""]
          : undefined;
        if (code) {
          void processCredential(code);
          return;
        }
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind: "rejected",
          code: "kaart",
          message: manifest?.cards
            ? "Kaart niet in de lijst op dit toestel; scan de QR"
            : "Kaartlezen kan niet zonder netwerk; scan de QR",
        };
        setFeedback(item);
        setHistory((items) => [item, ...items].slice(0, 50));
        setSessionCounts((counts) => ({ ...counts, rejected: counts.rejected + 1 }));
        if (navigator.vibrate) navigator.vibrate([90, 50, 90]);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
        return;
      }

      busyRef.current = true;
      try {
        const response = await fetch(`/api/tickets/events/${eventId}/scan/card`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card, clientScanId, gateId: gateId || null, deviceId }),
        });
        const payload = (await response.json().catch(() => ({}))) as ScanApiResponse;
        const kind = resultKind(payload, response.ok);
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind,
          code: payload.ticket?.publicId ?? "kaart",
          attendeeName: payload.ticket?.attendeeName ?? payload.attendeeName,
          typeName: payload.ticket?.typeName ?? payload.ticket?.ticketTypeName ?? payload.typeName,
          typeColor: ticketColorKey(payload.ticket?.typeColor ?? payload.typeColor),
          message:
            payload.message ??
            (payload.reason ? cardMissMessage(payload.reason) : fallbackMessage(kind)),
          scanId: kind === "accepted" ? payload.scanId : undefined,
        };
        setFeedback(item);
        setHistory((items) => [item, ...items].slice(0, 50));
        if (kind === "accepted" && payload.ticket?.publicId) {
          const code = payload.ticket.publicId;
          setScannedCodes((current) => new Set(current).add(code));
        }
        if (payload.stats) setServerStats(payload.stats);
        if (kind !== "error") {
          const bucket = kind === "accepted" ? "accepted" : kind === "duplicate" ? "duplicate" : "rejected";
          setSessionCounts((counts) => ({ ...counts, [bucket]: counts[bucket] + 1 }));
        }
        if (navigator.vibrate) navigator.vibrate(kind === "accepted" ? 60 : [90, 50, 90]);
      } catch {
        const item: ScanHistoryItem = {
          id: clientScanId,
          scannedAt,
          kind: "error",
          code: "kaart",
          message: "Netwerkfout tijdens het uitlezen van de kaart",
        };
        setFeedback(item);
        setHistory((items) => [item, ...items].slice(0, 50));
      } finally {
        busyRef.current = false;
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
      }
    },
    [deviceId, eventId, gateId, manifest, processCredential],
  );

  useEffect(() => {
    processRef.current = (value) => void processCredential(value);
  }, [processCredential]);

  // Het leesveld terug scherp zetten zodra de lezer aangaat: die tikt in wat
  // focus heeft, en zonder focus verdwijnt de scan in het niets.
  useEffect(() => {
    if (cardReaderOn) cardInputRef.current?.focus();
  }, [cardReaderOn]);

  useEffect(() => {
    if (!cameraEnabled || !videoRef.current) return;
    let disposed = false;
    setCameraStarting(true);
    setCameraError(null);

    void import("@zxing/browser").then(async ({ BrowserMultiFormatReader }) => {
      if (disposed || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result) => {
            if (result) processRef.current(result.getText());
          },
        );
        if (disposed) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setTorchAvailable(Boolean(controls.switchTorch));
      } catch (error) {
        if (!disposed) {
          setCameraEnabled(false);
          setCameraError(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Cameratoegang werd geweigerd"
              : "Camera kon niet worden gestart",
          );
        }
      } finally {
        if (!disposed) setCameraStarting(false);
      }
    });

    return () => {
      disposed = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setTorchAvailable(false);
      setTorchOn(false);
    };
  }, [cameraEnabled]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    try {
      await controlsRef.current.switchTorch(!torchOn);
      setTorchOn((current) => !current);
    } catch {
      setTorchAvailable(false);
    }
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualCode.trim()) return;
    void processCredential(manualCode);
    setManualCode("");
  }

  /**
   * Wat er in het leesveld beland is, naar het juiste pad sturen.
   *
   * Een puntkomma betekent studentenkaart (`serial;cardAppId`); alles anders is
   * een ticketcode, want dezelfde lezer wordt ook wel eens op een QR gericht.
   */
  function runReaderInput(raw: string) {
    const cleaned = raw.replace(/[\r\n]+/g, "").trim();
    setCardValue("");
    if (!cleaned) return;
    if (looksLikeCard(cleaned)) void processCard(cleaned);
    else void processCredential(cleaned);
  }

  function onCardInput(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    // Sommige lezers sturen een newline in plaats van een Enter-toets.
    if (value.includes("\n") || value.includes("\r")) runReaderInput(value);
    else setCardValue(value);
  }

  function toggleCardReader() {
    setCardReaderOn((current) => {
      const next = !current;
      localStorage.setItem(CARD_READER_KEY, next ? "1" : "0");
      return next;
    });
  }

  /**
   * De deelnemerslijst, gefilterd op naam of ticketcode.
   *
   * Voor wie zijn QR kwijt is of een telefoon zonder batterij heeft: je zoekt de
   * naam op en checkt die persoon rechtstreeks in. Werkt ook offline, want de
   * lijst is het manifest dat al op het toestel staat.
   *
   * Bewust afgekapt op vijftig rijen: een galabal telt er meer dan duizend, en
   * die allemaal tekenen maakt het scrollen op een telefoon stroperig. Wie iemand
   * zoekt, typt toch een paar letters.
   */
  const listResults = (() => {
    if (!manifest) return { rows: [], total: 0 };
    const query = listQuery.trim().toLowerCase();
    const matches = manifest.tickets
      .filter(
        (ticket) =>
          !query ||
          ticket.name.toLowerCase().includes(query) ||
          ticket.code.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return { rows: matches.slice(0, 50), total: matches.length };
  })();

  async function reverseScan(item: ScanHistoryItem) {
    if (!item.scanId || reversingScanId) return;
    setReversingScanId(item.scanId);
    try {
      const response = await fetch(`/api/tickets/events/${eventId}/scan/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: item.scanId, clientScanId: createId() }),
      });
      const payload = (await response.json().catch(() => ({}))) as ScanApiResponse;
      if (!response.ok || payload.result !== "REVERSED") {
        throw new Error(payload.message ?? "Check-in kon niet worden teruggedraaid");
      }
      const reversed: ScanHistoryItem = {
        ...item,
        kind: "reversed",
        message: "Check-in teruggedraaid",
        scanId: undefined,
        scannedAt: new Date().toISOString(),
      };
      setHistory((items) => items.map((current) => current.id === item.id ? reversed : current));
      setFeedback(reversed);
      if (payload.stats) setServerStats(payload.stats);
      setSessionCounts((counts) => ({ ...counts, accepted: Math.max(0, counts.accepted - 1) }));
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (error) {
      const failure: ScanHistoryItem = {
        ...item,
        kind: "error",
        message: error instanceof Error ? error.message : "Check-in kon niet worden teruggedraaid",
        scanId: undefined,
        scannedAt: new Date().toISOString(),
      };
      setFeedback(failure);
    } finally {
      setReversingScanId(null);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2200);
    }
  }

  if (loading) {
    return <main className="scanner-loading"><LoaderCircle className="is-spinning" aria-hidden="true" /><span>Scanner laden</span></main>;
  }

  if (!bootstrap || bootstrapError) {
    return (
      <main className="scanner-loading scanner-load-error">
        <XCircle aria-hidden="true" />
        <h1>Scanner niet beschikbaar</h1>
        <p>{bootstrapError}</p>
        <button type="button" onClick={() => void loadBootstrap()}><RefreshCw size={17} aria-hidden="true" /> Opnieuw proberen</button>
      </main>
    );
  }

  return (
    <main className="scanner-app">
      <header className="scanner-header">
        <div className="scanner-event-title">
          <span>VTK Scanner</span>
          <h1>{bootstrap.event.title}</h1>
        </div>
        <label className="scanner-gate-select">
          <MapPin size={17} aria-hidden="true" />
          <select value={gateId} onChange={(event) => setGateId(event.target.value)} aria-label="Ingang" disabled={bootstrap.gates.length === 0}>
            {bootstrap.gates.length === 0 ? <option value="">Geen actieve ingang</option> : null}
            {bootstrap.gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <div className={`scanner-network${online ? " is-online" : " is-offline"}`}>
          {online ? <Signal size={16} aria-hidden="true" /> : <SignalZero size={16} aria-hidden="true" />}
          {online ? "Online" : "Offline"}
        </div>
        {bootstrap.canManageScanners ? (
          <button
            type="button"
            className="scanner-close"
            onClick={() => setAccessOpen(true)}
            aria-label="Scanners beheren"
            title="Scanners beheren"
            disabled={!online}
          >
            <UserRoundCog aria-hidden="true" />
          </button>
        ) : null}
        <Link href="/tickets" className="scanner-close" aria-label="Scanner sluiten" title="Scanner sluiten"><X aria-hidden="true" /></Link>
      </header>

      {accessOpen ? (
        <ScannerAccess
          eventId={eventId}
          openScanning={bootstrap.event.openScanning ?? true}
          onClose={() => setAccessOpen(false)}
        />
      ) : null}

      {!online ? (
        <div className="scanner-offline-banner">
          <WifiOff size={18} aria-hidden="true" />
          {manifest
            ? `Offline scannen op de lijst van ${new Date(manifest.generatedAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}. Scans worden bewaard.`
            : "Geen netwerk en geen ticketlijst op dit toestel"}
        </div>
      ) : null}

      {queueSize > 0 ? (
        <div className="scanner-queue-banner">
          <CloudUpload size={18} aria-hidden="true" />
          <span>
            {queueSize} {queueSize === 1 ? "scan wacht" : "scans wachten"} op synchronisatie
          </span>
          <button type="button" onClick={() => void flushQueue()} disabled={syncing || !online}>
            {syncing ? <LoaderCircle className="is-spinning" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            {syncing ? "Bezig" : "Nu synchroniseren"}
          </button>
        </div>
      ) : null}

      {/* Offline aanvaard, achteraf toch geweigerd: meestal iemand die aan een
          tweede deur nog eens binnen probeerde. Blijft staan tot de deurploeg ze
          wegklikt. */}
      {conflicts.length > 0 ? (
        <div className="scanner-conflict-banner" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>{conflicts.length} offline aanvaarde {conflicts.length === 1 ? "scan bleek" : "scans bleken"} toch niet geldig</strong>
            <ul>
              {conflicts.slice(0, 5).map((conflict) => (
                <li key={conflict.clientScanId}>
                  {conflict.attendeeName ?? conflict.code} · {conflict.result === "ALREADY_USED" ? "was al binnen" : conflict.result.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setConflicts([])} aria-label="Meldingen wissen">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <InstallButton />

      <div className="scanner-workspace">
        <section className="scanner-camera-panel">
          <div className="scanner-video-wrap" id="scanner-camera-view">
            <video ref={videoRef} muted playsInline aria-label="Camerabeeld voor QR-scanner" />
            <div className="scanner-reticle" aria-hidden="true"><span /><span /><span /><span /><ScanLine /></div>
            {!cameraEnabled ? (
              <div className="scanner-camera-empty">
                <Camera size={34} aria-hidden="true" />
                <strong>Camera is uitgeschakeld</strong>
                <button type="button" aria-controls="scanner-camera-view" onClick={() => setCameraEnabled(true)}><Camera size={18} aria-hidden="true" /> Camera starten</button>
              </div>
            ) : null}
            {cameraStarting ? <div className="scanner-camera-starting"><LoaderCircle className="is-spinning" aria-hidden="true" /> Camera starten</div> : null}
            {feedback ? <ScannerFeedback item={feedback} /> : null}
          </div>

          {cameraError ? <div className="scanner-camera-error" role="alert"><AlertCircle size={17} aria-hidden="true" /> {cameraError}</div> : null}

          <div className="scanner-camera-tools">
            <button
              type="button"
              className={cameraEnabled ? "is-active" : ""}
              aria-controls="scanner-camera-view"
              aria-pressed={cameraEnabled}
              onClick={() => setCameraEnabled((current) => !current)}
            >
              {cameraEnabled ? <CameraOff size={19} aria-hidden="true" /> : <Camera size={19} aria-hidden="true" />}
              {cameraEnabled ? "Camera stoppen" : "Camera starten"}
            </button>
            <button
              type="button"
              disabled={!torchAvailable}
              className={torchOn ? "is-active" : ""}
              aria-pressed={torchOn}
              onClick={() => void toggleTorch()}
            >
              <Flashlight size={19} aria-hidden="true" /> Zaklamp
            </button>
            <button
              type="button"
              className={manualOpen ? "is-active" : ""}
              aria-expanded={manualOpen}
              aria-controls="scanner-manual-entry"
              onClick={() => setManualOpen((current) => !current)}
            >
              <Keyboard size={19} aria-hidden="true" /> Handmatig
            </button>
            {bootstrap.event.cardCheckIn ? (
              <button
                type="button"
                className={cardReaderOn ? "is-active" : ""}
                aria-expanded={cardReaderOn}
                aria-controls="scanner-card-reader"
                onClick={toggleCardReader}
              >
                <IdCard size={19} aria-hidden="true" /> Kaartlezer
              </button>
            ) : null}
            <button
              type="button"
              className={listOpen ? "is-active" : ""}
              aria-expanded={listOpen}
              aria-controls="scanner-name-list"
              disabled={!manifest}
              title={manifest ? undefined : "Deelnemerslijst niet beschikbaar voor dit event"}
              onClick={() => setListOpen((current) => !current)}
            >
              <Users size={19} aria-hidden="true" /> Op naam
            </button>
          </div>

          {/* Zoeken op naam. De lijst komt uit het manifest, dus dit werkt ook
              zonder netwerk; aantikken checkt die persoon in via hetzelfde pad
              als een handmatig ingetikte code. */}
          {listOpen && manifest ? (
            <section className="scanner-name-list" id="scanner-name-list" aria-label="Deelnemers zoeken">
              <div className="scanner-name-search">
                <Search size={17} aria-hidden="true" />
                <input
                  value={listQuery}
                  onChange={(event) => setListQuery(event.target.value)}
                  placeholder="Zoek een naam"
                  aria-label="Zoek een deelnemer op naam"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                {listQuery ? (
                  <button type="button" onClick={() => setListQuery("")} aria-label="Zoekopdracht wissen">
                    <X size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <p className="scanner-name-count">
                {listResults.total} van {manifest.tickets.length} deelnemers
                {listResults.total > listResults.rows.length
                  ? ` · eerste ${listResults.rows.length} getoond`
                  : ""}
              </p>

              {listResults.rows.length === 0 ? (
                <p className="scanner-name-empty">Geen deelnemer gevonden.</p>
              ) : (
                <ul>
                  {listResults.rows.map((ticket) => {
                    const binnen = ticket.checkedIn || scannedCodes.has(ticket.code);
                    return (
                      <li key={ticket.code} className={binnen ? "is-in" : ""}>
                        <button
                          type="button"
                          onClick={() => void processCredential(ticket.code)}
                          disabled={binnen}
                        >
                          <span className="scanner-name-state" aria-hidden="true">
                            {binnen ? <Check size={16} /> : <UserRound size={16} />}
                          </span>
                          <span className="scanner-name-who">
                            <strong>{ticket.name}</strong>
                            <small>
                              <span
                                className="scanner-type-dot"
                                style={{ background: `var(--ticket-color-${ticket.typeColor})` }}
                                aria-hidden="true"
                              />
                              {ticket.type}
                            </small>
                          </span>
                          <span className="scanner-name-action">
                            {binnen ? "Binnen" : "Inchecken"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {/* Het leesveld staat er zichtbaar bij, met de cursor erin. Een
              onzichtbaar veld dat stilletjes de focus opeist, is aan een deur om
              middernacht niet te debuggen: nu zie je of de lezer nog "aan staat"
              en kan je er zelf in klikken. */}
          {cardReaderOn && bootstrap.event.cardCheckIn ? (
            <section className="scanner-card-reader" id="scanner-card-reader" aria-label="Studentenkaart lezen">
              <label htmlFor="scanner-card-input">
                <IdCard size={17} aria-hidden="true" /> Studentenkaart
              </label>
              <input
                id="scanner-card-input"
                ref={cardInputRef}
                value={cardValue}
                onChange={onCardInput}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  runReaderInput(event.currentTarget.value);
                }}
                onBlur={() => {
                  // Enkel terugpakken wanneer de focus nergens heen ging; anders
                  // steelt dit veld de cursor uit het zoekveld ernaast.
                  requestAnimationFrame(() => {
                    if (document.activeElement === document.body) cardInputRef.current?.focus();
                  });
                }}
                // Onderdrukt het schermtoetsenbord op een tablet; de lezer stuurt
                // gewone toetsaanslagen en heeft dat toetsenbord niet nodig.
                inputMode="none"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Wachtend op een kaart"
                aria-describedby="scanner-card-help"
              />
              <p id="scanner-card-help">
                {online
                  ? "Houd de kaart op de lezer."
                  : manifest?.cards
                    ? "Geen netwerk: enkel kaarten die hier al eens gescand zijn, staan op dit toestel."
                    : "Geen netwerk en geen kaartlijst op dit toestel; scan de QR van het ticket."}
              </p>
            </section>
          ) : null}

          {manualOpen ? (
            <form className="scanner-manual-form" id="scanner-manual-entry" onSubmit={submitManual}>
              <label htmlFor="manual-ticket-code">Ticketcode</label>
              <div>
                <input id="manual-ticket-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Vul de code in" />
                <button type="submit" disabled={!manualCode.trim() || !online}><TicketCheck size={18} aria-hidden="true" /> Controleren</button>
              </div>
            </form>
          ) : null}
        </section>

        <aside className="scanner-session-panel">
          <div className="scanner-attendance">
            <span><CircleGauge size={17} aria-hidden="true" /> Aanwezig</span>
            <strong>{serverStats.checkedIn ?? 0}<small>{serverStats.total !== undefined ? ` / ${serverStats.total}` : ""}</small></strong>
            {serverStats.total ? <div><span style={{ width: `${Math.min(100, ((serverStats.checkedIn ?? 0) / serverStats.total) * 100)}%` }} /></div> : null}
          </div>

          <div className="scanner-counters">
            <div><Check size={18} aria-hidden="true" /><strong>{sessionCounts.accepted}</strong><span>Aanvaard</span></div>
            <div><RotateCcw size={18} aria-hidden="true" /><strong>{sessionCounts.duplicate}</strong><span>Dubbel</span></div>
            <div><X size={18} aria-hidden="true" /><strong>{sessionCounts.rejected}</strong><span>Geweigerd</span></div>
          </div>

          <section className="scanner-history" aria-labelledby="scanner-history-title">
            <div className="scanner-history-head">
              <h2 id="scanner-history-title"><History size={18} aria-hidden="true" /> Recente scans</h2>
              <span>{history.length}</span>
            </div>
            {history.length > 0 ? (
              <ol>
                {history.map((item) => (
                  <li key={item.id} className={`is-${item.kind}`}>
                    <div className="scanner-history-state">{item.kind === "accepted" ? <Check aria-hidden="true" /> : item.kind === "duplicate" || item.kind === "reversed" ? <RotateCcw aria-hidden="true" /> : <X aria-hidden="true" />}</div>
                    <div>
                      <strong>{item.kind === "reversed" ? item.message : item.attendeeName ?? item.message}</strong>
                      <span>
                        {item.typeName && item.typeColor ? (
                          <span
                            className="scanner-type-dot"
                            style={{ background: `var(--ticket-color-${item.typeColor})` }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {item.typeName ?? item.code}
                      </span>
                    </div>
                    {item.kind === "accepted" && item.scanId ? (
                      <button
                        className="scanner-history-undo"
                        type="button"
                        onClick={() => void reverseScan(item)}
                        disabled={Boolean(reversingScanId)}
                        aria-label={`Check-in van ${item.attendeeName ?? item.code} terugdraaien`}
                        title="Laatste check-in terugdraaien"
                      >
                        {reversingScanId === item.scanId ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                      </button>
                    ) : null}
                    <time>{new Date(item.scannedAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="scanner-history-empty"><UserRound size={24} aria-hidden="true" /><span>Nog geen scans aan deze ingang</span></div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
