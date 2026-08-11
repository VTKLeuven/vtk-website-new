'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Een half ingevuld formulier bewaren in `localStorage`, zodat het een gesloten
 * tabblad overleeft.
 *
 * Waarom localStorage en geen concept in de database: een echt concept vraagt een
 * status `DRAFT` op de reservatie, en dan moet élke query die vandaag "alle
 * reservaties" zegt die status uitsluiten (voorraad, kalender, beheerlijsten,
 * mijn reservaties). Eén vergeten query en een concept telt mee voor de voorraad.
 * Dit dekt het geval waar het om gaat (de tab viel dicht, de laptop ging toe) en
 * kost niets. Zie docs/design-decisions.md.
 *
 * Bewust niet automatisch terugzetten: een formulier dat zichzelf invult met iets
 * van vorige week is verwarrender dan een leeg formulier. De aanroeper toont een
 * balk en herstelt pas op een klik.
 */
const PREFIX = 'vtk-logistiek-draft';
/** Ouder dan dit is geen "aanvraag in opbouw" meer, maar iets dat blijven hangen is. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 500;

type Stored<T> = { savedAt: number; value: T };

export type FormDraft<T> = {
  /** De gevonden concepttekst, of null. Wordt null zodra je herstelt of weggooit. */
  found: T | null;
  savedAt: Date | null;
  restore: () => T | null;
  discard: () => void;
  /** Na een geslaagde indiening: het concept mag weg. */
  clear: () => void;
};

export function useFormDraft<T>(
  /** Uniek per formulier én per gebruiker; een gedeelde computer is de regel, niet de uitzondering. */
  key: string | null,
  value: T,
  /** Uit bij het bewerken van een bestaande aanvraag: die heeft de server als bron. */
  enabled: boolean,
  /**
   * Is er iets de moeite om te bewaren? Een leeg formulier bewaren zou de balk
   * bij het volgende bezoek laten aanbieden om niets terug te zetten, ook net na
   * "weggooien". Leeg wist het concept dus in plaats van het te schrijven.
   */
  isEmpty?: (value: T) => boolean
): FormDraft<T> {
  const storageKey = key ? `${PREFIX}:${key}` : null;
  const [found, setFound] = useState<T | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Pas beginnen met bewaren nadat we gelezen hebben, anders overschrijft de
  // eerste render (nog leeg) het concept dat we net wilden aanbieden.
  const readyRef = useRef(false);

  useEffect(() => {
    if (!storageKey || !enabled) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<T>;
        if (Date.now() - parsed.savedAt < MAX_AGE_MS) {
          setFound(parsed.value);
          setSavedAt(new Date(parsed.savedAt));
        } else {
          window.localStorage.removeItem(storageKey);
        }
      }
    } catch {
      // Kapotte of geblokkeerde storage: dan werkt het formulier gewoon zonder.
    }
    readyRef.current = true;
  }, [storageKey, enabled]);

  useEffect(() => {
    if (!storageKey || !enabled || !readyRef.current) return;
    const timer = window.setTimeout(() => {
      try {
        if (isEmpty?.(value)) {
          window.localStorage.removeItem(storageKey);
          return;
        }
        const payload: Stored<T> = { savedAt: Date.now(), value };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Quota vol of storage geweigerd; niet de moeite om de gebruiker mee te storen.
      }
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `isEmpty` bewust niet in de deps: een inline functie zou elke render een
    // nieuwe identiteit hebben en de timer eindeloos herstarten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled, value]);

  const clear = useCallback(() => {
    setFound(null);
    setSavedAt(null);
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* zie boven */
    }
  }, [storageKey]);

  const restore = useCallback(() => {
    const value = found;
    setFound(null);
    setSavedAt(null);
    return value;
  }, [found]);

  return { found, savedAt, restore, discard: clear, clear };
}
