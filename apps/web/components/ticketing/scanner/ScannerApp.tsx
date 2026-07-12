"use client";

import Link from "next/link";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CircleGauge,
  Flashlight,
  History,
  Keyboard,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Signal,
  SignalZero,
  TicketCheck,
  UserRound,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import type {
  ScanApiResponse,
  ScanHistoryItem,
  ScanKind,
  ScannerBootstrap,
} from "./types";

const ACCEPTED_RESULTS = new Set(["ACCEPTED", "CHECKED_IN", "SUCCESS", "VALID"]);
const DUPLICATE_RESULTS = new Set(["DUPLICATE", "ALREADY_CHECKED_IN", "ALREADY_USED"]);

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

function ScannerFeedback({ item }: { item: ScanHistoryItem }) {
  return (
    <div className={`scanner-feedback is-${item.kind}`} role="status" aria-live="assertive">
      <div className="scanner-feedback-icon">
        {item.kind === "accepted" ? <Check aria-hidden="true" /> : item.kind === "duplicate" || item.kind === "reversed" ? <RotateCcw aria-hidden="true" /> : <X aria-hidden="true" />}
      </div>
      <div>
        <strong>{item.message}</strong>
        {item.attendeeName ? <span>{item.attendeeName}</span> : null}
        {item.typeName ? <small>{item.typeName}</small> : null}
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
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [reversingScanId, setReversingScanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ScanHistoryItem | null>(null);
  const [sessionCounts, setSessionCounts] = useState({ accepted: 0, duplicate: 0, rejected: 0 });
  const [serverStats, setServerStats] = useState<{ checkedIn?: number; total?: number }>({});

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
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "Scanner kon niet worden geladen");
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

  const processCredential = useCallback(async (rawValue: string) => {
    const credential = credentialFromScan(rawValue);
    if (!credential || busyRef.current) return;

    const previous = lastCredentialRef.current;
    if (previous?.value === credential && Date.now() - previous.at < 2500) return;
    lastCredentialRef.current = { value: credential, at: Date.now() };

    if (!navigator.onLine) {
      const item: ScanHistoryItem = {
        id: createId(),
        scannedAt: new Date().toISOString(),
        kind: "error",
        code: credential.slice(-10),
        message: "Geen netwerkverbinding",
      };
      setFeedback(item);
      setHistory((items) => [item, ...items].slice(0, 50));
      return;
    }
    if (!deviceId) return;

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
        message: payload.message ?? fallbackMessage(kind),
        scanId: kind === "accepted" ? payload.scanId : undefined,
      };
      setFeedback(item);
      setHistory((items) => [item, ...items].slice(0, 50));
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
  }, [deviceId, eventId, gateId]);

  useEffect(() => {
    processRef.current = (value) => void processCredential(value);
  }, [processCredential]);

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
        <Link href="/tickets" className="scanner-close" aria-label="Scanner sluiten" title="Scanner sluiten"><X aria-hidden="true" /></Link>
      </header>

      {!online ? <div className="scanner-offline-banner"><WifiOff size={18} aria-hidden="true" /> Scannen gepauzeerd tot de verbinding hersteld is</div> : null}

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
          </div>

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
                      <span>{item.typeName ?? item.code}</span>
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
