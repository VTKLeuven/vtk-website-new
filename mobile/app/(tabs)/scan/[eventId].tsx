import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../../src/api/client';
import type { AppTicketScanResult } from '../../../src/api/contract';
import { fetchScanEvents, scanTicket } from '../../../src/api/endpoints';
import { useResource } from '../../../src/api/useResource';
import { PageHead } from '../../../src/components/PageHead';
import { QrScanner } from '../../../src/components/QrScanner';
import { Button, Card } from '../../../src/components/ui';
import { getPref, setPref } from '../../../src/storage';
import { scanKindOf } from '../../../src/scanKind';
import { useApp } from '../../../src/state/app';
import { COLORS, SPACING, TYPE } from '../../../src/theme/tokens';

/**
 * Tickets scannen aan de deur van één evenement.
 *
 * **De beoordeling gebeurt op de server** (`lib/ticketing/scanner.ts`). Geldig,
 * al gescand, verkeerd evenement, terugbetaald: dat zijn zes verschillende
 * uitkomsten met elk hun eigen gevolg aan een deur, en die hier nabouwen zou
 * betekenen dat de app soepeler kan zijn dan de balie. Dit scherm leest een QR,
 * stuurt hem door en toont wat er terugkomt.
 *
 * **Dit is niet vtk-scanner-app.** Die staat aan een deur in een kelder, heeft een
 * offline manifest, een schrijfwachtrij en een donker scherm. Dit is de versie
 * voor wie komt bijspringen: één avond, met het netwerk dat er is. Werkt het
 * netwerk niet, dan zegt dit scherm dat, en dat is eerlijker dan een scan die
 * "gelukt" lijkt en nergens aankomt.
 *
 * Elke scan draagt een `clientScanId`. Sturen we dezelfde twee keer (het netwerk
 * hikt, de app probeert opnieuw), dan geeft de server hetzelfde antwoord in
 * plaats van een tweede scan te registreren.
 */

/**
 * Een id per toestel, bewaard tussen sessies.
 *
 * De server maakt er een `TicketScanDevice` van, en dat is wat het scanlogboek
 * later toelaat om te zeggen welke telefoon wat gescand heeft. Zou hij bij elke
 * start veranderen, dan stond er na één avond een rij toestellen in de databank
 * die allemaal dezelfde persoon waren.
 */
const DEVICE_KEY = 'scan-device-id';

function deviceId(): string {
  const existing = getPref(DEVICE_KEY);
  if (existing) return existing;
  const created = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  setPref(DEVICE_KEY, created);
  return created;
}

type Outcome = { result: AppTicketScanResult } | { error: string } | { busy: true };

const LABELS: Record<AppTicketScanResult['result'], { title: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ACCEPTED: { title: 'Binnen', tone: 'ok' },
  ALREADY_USED: { title: 'Al gescand', tone: 'warn' },
  WRONG_EVENT: { title: 'Ander evenement', tone: 'bad' },
  INVALID: { title: 'Ongeldig', tone: 'bad' },
  VOID: { title: 'Ingetrokken', tone: 'bad' },
  REFUNDED: { title: 'Terugbetaald', tone: 'bad' },
};

export default function ScanEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { locale } = useApp();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [scanned, setScanned] = useState(0);

  const events = useResource('scan-events', () => fetchScanEvents(locale), locale);
  const event = useMemo(
    () => events.data?.find((candidate) => candidate.id === eventId) ?? null,
    [events.data, eventId],
  );

  const handle = useCallback(
    (value: string) => {
      if (scanKindOf(value) !== 'ticket') {
        setOutcome({
          error: 'Dit is geen ticket. Ga terug naar Scannen voor een uitnodiging of een pas.',
        });
        return;
      }

      setOutcome({ busy: true });
      void scanTicket(eventId, {
        credential: value,
        clientScanId: `${deviceId()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        deviceId: deviceId(),
        clientScannedAt: new Date().toISOString(),
      })
        .then((result) => {
          setOutcome({ result });
          setScanned((count) => count + 1);
        })
        .catch((error) => {
          setOutcome({
            error:
              error instanceof ApiError
                ? error.isForbidden
                  ? 'Je hebt geen scanrechten meer voor dit evenement.'
                  : error.message
                : 'Geen verbinding. Deze scan is niet geregistreerd; probeer opnieuw.',
          });
        });
    },
    [eventId],
  );

  return (
    <>
      <PageHead
        title={event?.title ?? 'Scannen'}
        subtitle={
          event
            ? `${event.checkedIn + scanned} van ${event.total} binnen`
            : 'Houd een ticket voor de camera'
        }
      />

      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <QrScanner
          onScan={handle}
          paused={outcome !== null}
          hint="Houd de QR van het ticket in het vierkant"
        />

        {outcome ? <ScanOutcome outcome={outcome} onClose={() => setOutcome(null)} /> : null}

        {!outcome ? (
          <Text style={styles.hint}>
            Elke scan gaat meteen naar de server; er wordt niets lokaal bijgehouden. Valt het
            netwerk weg, dan zegt dit scherm het en telt de scan niet mee.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function ScanOutcome({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  if ('busy' in outcome) {
    return (
      <Card style={styles.result}>
        <Text style={styles.title}>Bezig</Text>
      </Card>
    );
  }

  if ('error' in outcome) {
    return (
      <Card style={[styles.result, styles.bad]}>
        <View style={styles.head}>
          <TriangleAlert color={COLORS.ink} size={20} />
          <Text style={styles.title}>Niet gescand</Text>
        </View>
        <Text style={styles.body}>{outcome.error}</Text>
        <Button label="Verder scannen" onPress={onClose} />
      </Card>
    );
  }

  const { result, ticket, stats } = outcome.result;
  const label = LABELS[result];
  const Icon = label.tone === 'ok' ? CircleCheck : label.tone === 'warn' ? TriangleAlert : CircleX;

  return (
    <Card
      style={[
        styles.result,
        label.tone === 'ok' && styles.ok,
        label.tone === 'warn' && styles.warn,
        label.tone === 'bad' && styles.bad,
      ]}
    >
      <View style={styles.head}>
        <Icon color={COLORS.ink} size={20} />
        <Text style={styles.resultTitle}>{label.title}</Text>
      </View>

      {ticket ? (
        <>
          <Text style={styles.body}>{ticket.attendeeName}</Text>
          <Text style={styles.hint}>{ticket.typeName}</Text>
          <Text style={styles.hint}>{ticket.publicId}</Text>
        </>
      ) : (
        <Text style={styles.hint}>Geen ticket gevonden voor deze code.</Text>
      )}

      <Text style={styles.hint}>
        {stats.checkedIn} van {stats.total} binnen
      </Text>

      <Button label="Volgende" onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  result: { gap: SPACING.sm },
  // De uitkomst leest van een meter afstand: een brede rail links in de kleur van
  // wat er gebeurde. Geen volvlak, want dat is op de site voorbehouden aan banden.
  ok: { borderLeftWidth: 6, borderLeftColor: COLORS.yellow },
  warn: { borderLeftWidth: 6, borderLeftColor: COLORS.yellowDeep },
  bad: { borderLeftWidth: 6, borderLeftColor: COLORS.muted },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  resultTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});
