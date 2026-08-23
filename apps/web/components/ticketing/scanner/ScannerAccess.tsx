"use client";

import { LoaderCircle, QrCode, Search, UserPlus, UserRoundX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventScanner, EventScannersResponse, ScannerCandidate } from "./types";

/**
 * Scanners toevoegen en weghalen, vanuit de scanner zelf.
 *
 * Bestaat omdat het moment waarop je dit nodig hebt aan de deur ligt en niet
 * achter een laptop: er komt iemand bijspringen, en die moet nu binnen kunnen
 * scannen. Zoeken gaat op naam, e-mail of r-nummer, want het gaat net om mensen
 * buiten het praesidium; wie in een post zit, kan er al bij via de standaardregel.
 *
 * Werkt bewust enkel online. Iemand toegang geven is geen deurbeslissing die je
 * offline in een wachtrij wil laten wachten: dan weet niemand of ze doorging.
 */

const ERROR_MESSAGES: Record<string, string> = {
  USER_NOT_FOUND: "Die persoon bestaat niet of is niet actief",
  GRANT_NOT_FOUND: "Die scanner stond er al niet meer bij",
  GRANT_ROLE_CONFLICT:
    "Die persoon heeft al een andere rol op dit event; pas die aan bij Toegang in het beheer",
  FORBIDDEN: "Je mag geen scanners beheren voor dit event",
  UNAUTHENTICATED: "Je sessie is verlopen",
};

function message(code: string | undefined) {
  return (code && ERROR_MESSAGES[code]) || "Er ging iets mis";
}

export function ScannerAccess({
  eventId,
  openScanning,
  onClose,
}: {
  eventId: string;
  openScanning: boolean;
  onClose: () => void;
}) {
  const [scanners, setScanners] = useState<EventScanner[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScannerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/events/${eventId}/scanners`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (EventScannersResponse & { error?: string })
        | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "FAILED");
      setScanners(payload.scanners);
    } catch (caught) {
      setError(message(caught instanceof Error ? caught.message : undefined));
      setScanners([]);
    }
  }, [eventId]);

  // Via een timeout, want `load` zet state en dat mag niet synchroon in een
  // effect; zelfde reden als bij het synchroniseren in ScannerApp.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Zoeken terwijl je tikt, met een vorige aanvraag die afgebroken wordt: aan een
  // deur tik je snel en zijn de antwoorden anders uit volgorde.
  useEffect(() => {
    const needle = query.trim();
    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(
          `/api/tickets/events/${eventId}/users/search?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        setResults(response.ok ? ((await response.json()) as ScannerCandidate[]) : []);
      } catch {
        // Afgebroken of netwerkfout; het volgende teken probeert opnieuw.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [eventId, query]);

  /**
   * De rollende uitnodigings-QR.
   *
   * Elke twintig seconden een verse code, want de vorige leeft er dertig. Dat is
   * wat een screenshot waardeloos maakt: tegen dat iemand die doorstuurt, is de
   * code al dood. De timer loopt enkel zolang het paneel de QR toont.
   */
  useEffect(() => {
    if (!qrOpen) return;
    let stopped = false;

    async function refresh() {
      try {
        const response = await fetch(`/api/tickets/events/${eventId}/scanners/invite`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("FAILED");
        const { url } = (await response.json()) as { url: string };
        const QRCode = (await import("qrcode")).default;
        const image = await QRCode.toDataURL(url, {
          width: 520,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#0A0F1F", light: "#FFFFFF" },
        });
        if (!stopped) setQrImage(image);
      } catch {
        if (!stopped) {
          setQrImage(null);
          setError("De QR kon niet worden geladen");
        }
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 20_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [qrOpen, eventId]);

  async function mutate(body: { userId: string } | { grantId: string }, id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/events/${eventId}/scanners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | (EventScannersResponse & { error?: string })
        | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "FAILED");
      setScanners(payload.scanners);
      setQuery("");
      setResults([]);
    } catch (caught) {
      setError(message(caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusyId(null);
    }
  }

  const existing = new Set((scanners ?? []).map((scanner) => scanner.userId));

  return (
    <div className="scanner-sheet" role="dialog" aria-label="Scanners beheren">
      <header>
        <h2>Scanners</h2>
        <button type="button" onClick={onClose} aria-label="Sluiten">
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <p className="scanner-sheet-note">
        {openScanning
          ? "Elke praesidiumpost kan dit event al scannen. Voeg hier enkel mensen van buiten het praesidium toe."
          : "De scanlijst van dit event staat dicht: enkel wie hier staat, kan scannen."}
      </p>

      <label className="scanner-sheet-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op naam, e-mail of r-nummer"
          aria-label="Zoek iemand om toe te voegen"
          autoComplete="off"
        />
        {searching ? <LoaderCircle className="is-spinning" size={16} aria-hidden="true" /> : null}
      </label>

      <button
        type="button"
        className="scanner-sheet-toggle"
        aria-pressed={qrOpen}
        onClick={() => {
          // De vorige code hier weggooien en niet in het effect: die is verlopen,
          // en ze een tel laten staan bij het heropenen zou iemand een dode QR
          // laten scannen.
          setQrImage(null);
          setQrOpen((current) => !current);
        }}
      >
        <QrCode size={17} aria-hidden="true" />
        {qrOpen ? "QR verbergen" : "Toon QR om te laten scannen"}
      </button>

      {qrOpen ? (
        <div className="scanner-sheet-qr">
          {qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt="QR-code om jezelf als scanner toe te voegen" />
          ) : (
            <LoaderCircle className="is-spinning" size={22} aria-hidden="true" />
          )}
          <p>
            Laat deze code scannen met de camera. De code vernieuwt om de paar tellen, dus een
            screenshot of een doorgestuurde foto werkt niet.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="scanner-sheet-error" role="alert">
          {error}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="scanner-sheet-results">
          {results.map((candidate) => (
            <li key={candidate.id}>
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.rNumber ?? candidate.email}</span>
              </div>
              <button
                type="button"
                disabled={busyId === candidate.id || existing.has(candidate.id)}
                onClick={() => void mutate({ userId: candidate.id }, candidate.id)}
              >
                {busyId === candidate.id ? (
                  <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
                ) : (
                  <UserPlus size={15} aria-hidden="true" />
                )}
                {existing.has(candidate.id) ? "Staat erbij" : "Toevoegen"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <h3>Toegevoegd</h3>
      {scanners === null ? (
        <p className="scanner-sheet-empty">
          <LoaderCircle className="is-spinning" size={16} aria-hidden="true" /> Laden
        </p>
      ) : scanners.length === 0 ? (
        <p className="scanner-sheet-empty">Niemand extra toegevoegd</p>
      ) : (
        <ul className="scanner-sheet-list">
          {scanners.map((scanner) => (
            <li key={scanner.grantId}>
              <div>
                <strong>{scanner.name}</strong>
                <span>{scanner.rNumber ?? scanner.email}</span>
              </div>
              <button
                type="button"
                disabled={busyId === scanner.grantId}
                onClick={() => void mutate({ grantId: scanner.grantId }, scanner.grantId)}
                aria-label={`Toegang intrekken: ${scanner.name}`}
                title={`Toegang intrekken: ${scanner.name}`}
              >
                {busyId === scanner.grantId ? (
                  <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
                ) : (
                  <UserRoundX size={16} aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
