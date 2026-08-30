import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import { metres, type LatLng } from './geo';

/**
 * Waar de gebruiker staat, voor een route die vertrekt waar hij vertrekt.
 *
 * **De toestemming wordt pas gevraagd wanneer erom gevraagd wordt.** Een scherm
 * dat bij het openen naar je locatie hengelt, krijgt "niet toestaan" en daarna
 * nooit meer een tweede kans; de vraag hoort achter een knop waarvan de bedoeling
 * al duidelijk is.
 *
 * `expo-location` zit in de Expo SDK en dus in Expo Go. Dat is hier geen detail:
 * een module die daar niet in zit, maakt de app onbereikbaar op iPhone (zie
 * `mobile/AGENTS.md`). **Een APK van voor deze wijziging heeft de module niet**,
 * en `runtimeVersion` is voor elke SDK 54-build dezelfde, dus die krijgt deze
 * update ook aangeboden: bouw en verspreid een nieuwe APK voor je publiceert.
 */

export type PositionState =
  /** Nog niet gevraagd. */
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; at: LatLng }
  /** De gebruiker zei nee. Vraag het niet opnieuw uit jezelf. */
  | { kind: 'denied' }
  /** Toestemming was er, maar er kwam geen positie (binnen, geen zicht op de hemel). */
  | { kind: 'unavailable' }
  /** Te ver van de campus om er een wandelroute over te tekenen. */
  | { kind: 'away'; at: LatLng; metres: number };

/**
 * Verder dan dit heeft onze eigen kaart niets te zeggen: het padennet stopt aan
 * de rand van de campus, en een lijn die van buiten het beeld komt is geen route
 * maar een leugen. Wie hier buiten staat, hoort naar de kaart-app van zijn
 * toestel gestuurd te worden.
 */
const CAMPUS_RADIUS = 900;

export function usePosition(campusCentre: LatLng | null) {
  const [state, setState] = useState<PositionState>({ kind: 'idle' });

  const locate = useCallback(async () => {
    setState({ kind: 'busy' });
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setState({ kind: 'denied' });
        return;
      }

      const reading = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const at: LatLng = [reading.coords.latitude, reading.coords.longitude];

      if (campusCentre) {
        const distance = metres(at, campusCentre);
        if (distance > CAMPUS_RADIUS) {
          setState({ kind: 'away', at, metres: distance });
          return;
        }
      }
      setState({ kind: 'ok', at });
    } catch {
      // Binnen, in een kelder, of de dienst staat uit. Geen van drieën is een
      // fout die de gebruiker kan oplossen door het nog eens te proberen, dus
      // hier geen error boundary maar een zin op het scherm.
      setState({ kind: 'unavailable' });
    }
  }, [campusCentre]);

  const forget = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, locate, forget };
}
