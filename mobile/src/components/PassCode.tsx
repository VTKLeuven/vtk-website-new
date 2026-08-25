import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { fetchVouchers } from '../api/endpoints';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { Button } from './ui';
import { VtkQr } from './VtkQr';

/**
 * Jouw pas: één code voor alles wat je aan een balie toont.
 *
 * Dezelfde QR voor je broodje aan het Theokot en voor een betaling met bonnetjes
 * aan de toog. Eén code en niet twee, omdat het aan de andere kant ook één
 * beweging is: scannen, zien wie je bent, en dan pas kiezen wat er gebeurt.
 *
 * **Hij leeft twee minuten en ververst zichzelf.** Dat is met opzet kort: een QR
 * die uren geldig blijft, staat na één keer tonen in een groepschat. De prijs is
 * dat je hem niet offline kan tonen, en dat is aanvaardbaar, want aan een balie
 * staat altijd iemand met netwerk. Anders dan een ticket: dat is bewust wél
 * offline te tonen, want aan de ingang van een zaal is het netwerk vaak weg.
 *
 * De code staat groot en op wit. Een scanner heeft aan een klein vierkantje
 * achter een telefoonhoesje te weinig.
 */
export function PassCode({ caption }: { caption?: string }) {
  const { width } = useWindowDimensions();
  const [pass, setPass] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const vouchers = await fetchVouchers();
      setPass(vouchers.pass);
      setExpiresAt(Date.parse(vouchers.passExpiresAt));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'De code kon niet opgehaald worden.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Vernieuwen tien seconden voor het einde. Zou hij pas op het moment zelf
   * vervangen worden, dan is er een tel waarin de code op het scherm al dood is
   * terwijl iemand hem net scant.
   */
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(5_000, expiresAt - Date.now() - 10_000);
    timer.current = setTimeout(() => void load(), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [expiresAt, load]);

  const size = Math.min(240, width - SPACING.lg * 4);

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { width: size + SPACING.lg * 2 }]}>
        {pass ? (
          <VtkQr value={pass} size={size} />
        ) : (
          <View style={[styles.placeholder, { width: size, height: size }]}>
            {busy ? (
              <ActivityIndicator color={COLORS.navy} />
            ) : (
              <Text style={styles.error}>{error ?? 'Geen code'}</Text>
            )}
          </View>
        )}
      </View>

      <Text style={styles.caption}>
        {caption ?? 'Laat dit scannen aan de balie of aan de toog.'}
      </Text>
      <Text style={styles.hint}>
        De code vernieuwt zichzelf om de twee minuten, dus een screenshot doet niets.
      </Text>

      {error ? <Button label="Opnieuw proberen" variant="ghost" onPress={() => void load()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: SPACING.sm },
  frame: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  caption: { ...TYPE.body, color: COLORS.body, textAlign: 'center' },
  hint: { ...TYPE.small, color: COLORS.muted, textAlign: 'center' },
  error: { ...TYPE.small, color: COLORS.muted, textAlign: 'center' },
});
