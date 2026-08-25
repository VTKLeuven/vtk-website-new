import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { Button } from './ui';

/**
 * De camera, met precies één taak: een QR lezen en de inhoud doorgeven.
 *
 * **Wat er niet in zit is even belangrijk.** Geen beslissing over wat de code
 * betekent (dat doet de aanroeper), geen netwerk, geen toestandsmachine. De
 * scanner is een invoerveld dat toevallig een camera is.
 *
 * Drie dingen die anders misgaan:
 *
 * 1. **Ontdubbelen.** `onBarcodeScanned` vuurt tientallen keren per seconde op
 *    dezelfde code zolang die in beeld is. Zonder de pauze hieronder zou één
 *    ticket twintig keer gescand worden, en aan de kant van de server is dat
 *    twintig keer "al gebruikt".
 * 2. **Toestemming vragen wanneer het ergens over gaat**, dus wanneer dit scherm
 *    opengaat en niet bij de eerste start van de app. Op iOS krijg je maar één
 *    kans; wie in de eerste seconde weigert, moet daarna naar de instellingen.
 * 3. **Zeggen wat er misging.** Een zwart vlak zonder uitleg is de meest
 *    voorkomende manier waarop een scanner "stuk" lijkt terwijl enkel de
 *    toestemming ontbreekt.
 */
export function QrScanner({
  onScan,
  /** Pauzeer het lezen, bijvoorbeeld terwijl er een resultaat op het scherm staat. */
  paused = false,
  hint,
}: {
  onScan: (value: string) => void;
  paused?: boolean;
  hint?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [asked, setAsked] = useState(false);
  const lastValue = useRef<string | null>(null);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!permission || permission.granted || asked) return;
    setAsked(true);
    void requestPermission();
  }, [permission, requestPermission, asked]);

  useEffect(
    () => () => {
      if (cooldown.current) clearTimeout(cooldown.current);
    },
    [],
  );

  const handle = useCallback(
    ({ data }: { data: string }) => {
      const value = data.trim();
      if (!value || paused || value === lastValue.current) return;

      lastValue.current = value;
      if (cooldown.current) clearTimeout(cooldown.current);
      // Dezelfde code mag na twee tellen opnieuw; dat is lang genoeg om een
      // stroom van dubbels te stoppen en kort genoeg om bewust te herscannen.
      cooldown.current = setTimeout(() => {
        lastValue.current = null;
      }, 2_000);

      onScan(value);
    },
    [onScan, paused],
  );

  if (!permission) {
    return (
      <View style={styles.frame}>
        <Text style={styles.message}>Camera klaarzetten</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.frame}>
        <Text style={styles.message}>
          {permission.canAskAgain
            ? 'VTK heeft je camera nodig om een code te lezen. Er wordt niets opgenomen of bewaard.'
            : 'Je toestel laat de camera niet toe voor deze app. Dat kan je aanzetten in de instellingen van je telefoon.'}
        </Text>
        <Button
          label={permission.canAskAgain ? 'Camera toelaten' : 'Instellingen openen'}
          onDark
          onPress={() => {
            if (permission.canAskAgain) void requestPermission();
            else void Linking.openSettings();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={paused ? undefined : handle}
      />
      {/* Het vierkant is enkel een mikpunt: de camera leest het hele beeld. Zonder
          zoiets houdt iedereen zijn telefoon te ver weg. */}
      <View style={styles.reticle} pointerEvents="none" />
      {hint ? (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.navy,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    padding: SPACING.xl,
  },
  message: { ...TYPE.body, color: COLORS.onDark, textAlign: 'center' },
  reticle: {
    width: '62%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: COLORS.yellow,
    borderRadius: RADIUS.md,
    opacity: 0.9,
  },
  hintWrap: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.lg,
    backgroundColor: 'rgba(14,26,54,0.72)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  hint: { ...TYPE.small, color: COLORS.onDark, textAlign: 'center' },
});
