import { useRouter } from 'expo-router';
import { Beer, Coins, ScanLine, TicketCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../../src/api/client';
import type { AppPassHolder } from '../../../src/api/contract';
import {
  fakCheckin,
  fetchScanEvents,
  lookupPass,
  redeemScannerInvite,
  redeemVouchers,
} from '../../../src/api/endpoints';
import { messageFor, useResource } from '../../../src/api/useResource';
import { PageHead } from '../../../src/components/PageHead';
import { QrScanner } from '../../../src/components/QrScanner';
import { Stepper } from '../../../src/components/Stepper';
import { Button, Card, ErrorState, Loading } from '../../../src/components/ui';
import { formatDayShort, formatEuro } from '../../../src/format';
import { scanKindOf, UNKNOWN_SCAN_MESSAGE } from '../../../src/scanKind';
import { useApp } from '../../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../src/theme/tokens';

type ScanResult =
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'invite'; title: string; eventId: string; already: boolean }
  | { kind: 'fakbar'; text: string; detail: string }
  | { kind: 'pass'; pass: string; holder: AppPassHolder };

/**
 * Eén scanner voor alles wat je bij VTK voorgehouden krijgt.
 *
 * Vier soorten codes, en de code zegt zelf welke (zie `src/scanKind.ts`):
 *
 * - **een uitnodiging** van een praesidiumlid: je krijgt scanrechten voor dat ene
 *   evenement en staat een tel later aan de deur. Dit is de reden dat een shifter
 *   niets hoeft te installeren en niemand hem met de hand moet toevoegen.
 * - **de code aan de fakbar**: check-in zonder studentenkaart.
 * - **de pas van een student**: bonnetjes aanvaarden als betaling.
 * - **een ticket**: dat kan enkel binnen een evenement, want een ticket is altijd
 *   voor iets. Kies eerst het evenement hieronder.
 *
 * De uitkomst blijft staan tot je ze wegtikt, en de camera pauzeert zolang. Aan
 * een deur wil je zien wat er gebeurde voor de volgende persoon voorstapt; een
 * melding die na een seconde wegvalt, wordt door de helft gemist.
 */
export default function ScannenScreen() {
  const router = useRouter();
  const { locale, viewer, bootstrap } = useApp();
  const [result, setResult] = useState<ScanResult | null>(null);

  const events = useResource(
    'scan-events',
    () => (viewer ? fetchScanEvents(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  const mayAcceptVouchers = bootstrap?.abilities?.acceptVouchers ?? false;

  const handle = useCallback(
    (value: string) => {
      const kind = scanKindOf(value);

      if (kind === 'ticket') {
        setResult({
          kind: 'error',
          message:
            'Dit is een ticket. Kies eerst hieronder het evenement waarvoor je scant, dan telt de scan ook mee.',
        });
        return;
      }
      if (kind === 'unknown') {
        setResult({ kind: 'error', message: UNKNOWN_SCAN_MESSAGE });
        return;
      }

      setResult({ kind: 'busy' });

      if (kind === 'invite') {
        void redeemScannerInvite(value)
          .then((invite) => {
            setResult({
              kind: 'invite',
              title: invite.title,
              eventId: invite.eventId,
              already: invite.alreadyHadAccess,
            });
            void events.refresh();
          })
          .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
        return;
      }

      if (kind === 'fakbar') {
        void fakCheckin(value)
          .then((checkin) =>
            setResult({
              kind: 'fakbar',
              text: checkin.counted ? 'Ingecheckt' : 'Al ingecheckt',
              detail: checkin.freeBeer
                ? `${checkin.total} punten. Je hebt een gratis pint verdiend.`
                : `${checkin.total} punten. Nog ${checkin.toNextBeer} tot een gratis pint.`,
            }),
          )
          .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
        return;
      }

      if (!mayAcceptVouchers) {
        setResult({
          kind: 'error',
          message: 'Dit is de pas van een student. Je hebt geen rechten om er bonnetjes van af te boeken.',
        });
        return;
      }

      void lookupPass(value)
        .then((holder) => setResult({ kind: 'pass', pass: value, holder }))
        .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
    },
    [events, mayAcceptVouchers],
  );

  if (!viewer) {
    return (
      <>
        <PageHead title="Scannen" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Wat je scant hangt aan jouw account: je scanrechten, je check-in aan de bar, en wie
              er afboekt.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <PageHead title="Scannen" subtitle="Ticket, uitnodiging, fakbar of een pas" />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <QrScanner
          onScan={handle}
          paused={result !== null}
          hint="Houd de code in het vierkant"
        />

        {result ? (
          <Result
            result={result}
            onClose={() => setResult(null)}
            onOpenEvent={(id) => {
              setResult(null);
              router.push(`/scan/${id}`);
            }}
            onRedeemed={() => setResult(null)}
          />
        ) : null}

        <Text style={styles.sectionTitle}>Tickets scannen</Text>
        {events.loading ? (
          <Loading label="Evenementen ophalen" />
        ) : !events.data ? (
          <ErrorState message={messageFor(events.error)} onRetry={() => void events.refresh()} />
        ) : events.data.length === 0 ? (
          <Card>
            <Text style={styles.body}>
              Je hebt voor geen enkel evenement scanrechten. Vraag aan wie het evenement
              organiseert om je de uitnodigings-QR te tonen; die staat in het beheer onder
              Toegang. Scan hem hierboven en je kan meteen aan de deur.
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {events.data.map((event) => (
              <Card key={event.id} style={styles.eventCard}>
                <View style={styles.eventText}>
                  <Text style={styles.kicker}>{formatDayShort(event.startsAt, locale)}</Text>
                  <Text style={styles.title}>{event.title}</Text>
                  {event.location ? <Text style={styles.hint}>{event.location}</Text> : null}
                  <Text style={styles.hint}>
                    {event.checkedIn} van {event.total} binnen
                  </Text>
                </View>
                <Button label="Scannen" onPress={() => router.push(`/scan/${event.id}`)} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/** Wat er na een scan op het scherm blijft staan tot iemand het wegtikt. */
function Result({
  result,
  onClose,
  onOpenEvent,
  onRedeemed,
}: {
  result: ScanResult;
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
  onRedeemed: () => void;
}) {
  if (result.kind === 'busy') return <Loading label="Bezig" />;

  if (result.kind === 'error') {
    return (
      <Card style={styles.resultCard}>
        <View style={styles.resultHead}>
          <ScanLine color={COLORS.muted} size={18} />
          <Text style={styles.title}>Dat lukte niet</Text>
        </View>
        <Text style={styles.body}>{result.message}</Text>
        <Button label="Opnieuw scannen" variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (result.kind === 'invite') {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <TicketCheck color={COLORS.ink} size={18} />
          <Text style={styles.title}>
            {result.already ? 'Je kon dit al scannen' : 'Je kan dit evenement nu scannen'}
          </Text>
        </View>
        <Text style={styles.body}>{result.title}</Text>
        <Button label="Beginnen met scannen" onPress={() => onOpenEvent(result.eventId)} />
        <Button label="Sluiten" variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (result.kind === 'fakbar') {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <Beer color={COLORS.ink} size={18} />
          <Text style={styles.title}>{result.text}</Text>
        </View>
        <Text style={styles.body}>{result.detail}</Text>
        <Button label="Sluiten" variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  return <PassResult pass={result.pass} holder={result.holder} onClose={onClose} onDone={onRedeemed} />;
}

/**
 * Betalen met bonnetjes: eerst zien wie het is, dan pas een bedrag.
 *
 * Twee stappen met opzet. Wie achter een toog scant, hoort de naam en het saldo
 * te zien voor er iets afgaat; één beweging zou betekenen dat je afboekt bij
 * iemand die je nog niet herkend hebt. Het kost een halve seconde en het scheelt
 * de discussie achteraf.
 */
function PassResult({
  pass,
  holder,
  onClose,
  onDone,
}: {
  pass: string;
  holder: AppPassHolder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(Math.min(1, holder.vouchers));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const redeem = async () => {
    setBusy(true);
    try {
      const result = await redeemVouchers({ pass, amount, place: 'Toog' });
      setMessage(`${result.amount} afgeboekt bij ${result.name}. Nog ${result.remaining} over.`);
    } catch (error) {
      setMessage(scanError(error));
    } finally {
      setBusy(false);
    }
  };

  if (message) {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <Coins color={COLORS.ink} size={18} />
          <Text style={styles.title}>Klaar</Text>
        </View>
        <Text style={styles.body}>{message}</Text>
        <Button label="Volgende" onPress={onDone} />
      </Card>
    );
  }

  return (
    <Card style={styles.resultCard}>
      <View style={styles.resultHead}>
        <Coins color={COLORS.navy} size={18} />
        <Text style={styles.title}>{holder.name}</Text>
      </View>
      {holder.rNumber ? <Text style={styles.hint}>{holder.rNumber}</Text> : null}

      <View style={styles.balance}>
        <Text style={styles.body}>Openstaande bonnetjes</Text>
        <Text style={styles.balanceValue}>{holder.vouchers}</Text>
      </View>

      {holder.theokotOrder ? (
        <View style={styles.orderBox}>
          <Text style={styles.kicker}>BROODJE VAN VANDAAG</Text>
          {holder.theokotOrder.lines.map((line, index) => (
            <Text key={`${line.name}-${index}`} style={styles.body}>
              {line.quantity}x {line.name}
            </Text>
          ))}
          <Text style={styles.hint}>
            Te betalen: {formatEuro(holder.theokotOrder.totalCents)}
            {holder.theokotOrder.canRedeemVouchers
              ? `, of ${holder.theokotOrder.voucherCost} bonnetjes`
              : ''}
          </Text>
        </View>
      ) : null}

      {holder.vouchers === 0 ? (
        <Text style={styles.body}>Er staan geen bonnetjes open, dus er valt niets af te boeken.</Text>
      ) : (
        <>
          <View style={styles.amountRow}>
            <Text style={styles.body}>Af te boeken</Text>
            <Stepper
              value={amount}
              max={holder.vouchers}
              label="bonnetjes"
              onChange={setAmount}
            />
          </View>
          <Button
            label={`${amount} afboeken`}
            busy={busy}
            disabled={amount < 1}
            onPress={() => void redeem()}
          />
        </>
      )}

      <Button label="Annuleren" variant="ghost" onPress={onClose} />
    </Card>
  );
}

/**
 * De zin bij een geweigerde scan. De server stuurt een code en geen tekst, precies
 * zodat die hier in het Nederlands van de app staat; enkel bij een onbekende code
 * valt hij terug op de melding van de server.
 */
function scanError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding. Aan een deur zonder netwerk werkt scannen niet; probeer het opnieuw.';
  }
  switch (error.code) {
    case 'PASS_EXPIRED':
      return 'Deze code is verlopen. Laat ze opnieuw tonen; ze vernieuwt zichzelf om de twee minuten.';
    case 'PASS_INVALID':
      return 'Deze code hoort niet bij VTK.';
    case 'INVITE_EXPIRED':
      return 'Deze uitnodiging is verlopen. Vraag ze opnieuw te tonen; ze ververst om de twintig seconden.';
    case 'NOT_ENOUGH':
      return 'Er staan niet genoeg bonnetjes open.';
    case 'CONFLICT':
      return 'Het saldo veranderde net. Scan opnieuw.';
    case 'SELF':
      return 'Je kan niet bij jezelf afboeken.';
    case 'BAR_CLOSED':
      return "'t ElixIr staat nu niet als open geregistreerd, dus deze check-in telt niet.";
    case 'NO_RNUMBER':
      return 'Je account heeft geen r-nummer, dus je stand kan nergens aan hangen.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  list: { gap: SPACING.md },
  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },

  resultCard: { gap: SPACING.md },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  eventCard: { gap: SPACING.md },
  eventText: { gap: 2 },

  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  balanceValue: { ...TYPE.sectionTitle, color: COLORS.ink },
  orderBox: {
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: 2,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
