import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, baseUrl } from '../../src/api/client';
import type { AppTicketEventDetail, AppTicketType } from '../../src/api/contract';
import { fetchOrderStatus, fetchTicketEvent, startTicketCheckout } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { QuestionField, type AnswerValue } from '../../src/components/QuestionField';
import { Prose } from '../../src/components/Prose';
import { Stepper } from '../../src/components/Stepper';
import { Button, Card, Empty, ErrorState, Loading } from '../../src/components/ui';
import { formatEventWhen, formatEuro } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Tickets kopen.
 *
 * Het scherm bouwt de bestelling op en stuurt ze naar dezelfde checkout als de
 * webshop. **Betalen gebeurt in de browser**, want dat is Mollie, en dat willen
 * we niet nabouwen: bankapps, Bancontact en 3D Secure horen in een echte browser.
 * Na het sluiten van die browser vragen we de server wat er van de bestelling
 * geworden is; we gokken niet op basis van of iemand terugkwam.
 *
 * Wat het scherm zelf beslist, beslist het enkel om knoppen uit te schakelen. De
 * voorraad, de limieten per bestelling en de vraag of een type nog te koop staat,
 * worden bij het afrekenen opnieuw en bindend gecontroleerd.
 */
export default function TicketShopScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const resource = useResource(
    `ticket:${slug}`,
    () => fetchTicketEvent(locale, slug),
    `${locale}:${slug}`,
  );

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <Shop
      event={resource.data}
      locale={locale}
      viewerName={viewer?.name ?? ''}
      viewerEmail={viewer?.email ?? ''}
      onNeedsLogin={() => router.push('/inloggen')}
      onDone={() => {
        void resource.refresh();
        router.replace('/mijn-tickets');
      }}
    />
  );
}

function Shop({
  event,
  locale,
  viewerName,
  viewerEmail,
  onNeedsLogin,
  onDone,
}: {
  event: AppTicketEventDetail;
  locale: 'nl' | 'en';
  viewerName: string;
  viewerEmail: string;
  onNeedsLogin: () => void;
  onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState(viewerName);
  const [buyerEmail, setBuyerEmail] = useState(viewerEmail);
  const [attendees, setAttendees] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, Record<string, AnswerValue>>>({});
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Eén regel per ticket dat besteld wordt, met een stabiele sleutel
   * `<typeId>#<index>`. Dat is wat de invoervelden per ticket aan elkaar knoopt:
   * zet iemand het aantal van drie naar twee, dan verdwijnt de derde en houden de
   * eerste twee hun naam.
   */
  const seats = useMemo(() => {
    const list: { key: string; type: AppTicketType; index: number }[] = [];
    for (const type of event.ticketTypes) {
      const quantity = quantities[type.id] ?? 0;
      for (let index = 0; index < quantity; index += 1) {
        list.push({ key: `${type.id}#${index}`, type, index });
      }
    }
    return list;
  }, [event.ticketTypes, quantities]);

  const totals = useMemo(() => {
    let count = 0;
    let cents = 0;
    for (const type of event.ticketTypes) {
      const quantity = quantities[type.id] ?? 0;
      count += quantity;
      cents += quantity * type.priceCents;
    }
    return { count, cents };
  }, [event.ticketTypes, quantities]);

  if (event.requiresLogin) {
    return (
      <>
        <PageHead title={event.title} subtitle={event.ownerGroupName} />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Enkel voor leden</Text>
            <Text style={styles.body}>
              De tickets voor dit event zijn voorbehouden aan leden. Log in met je VTK-account om
              ze te zien.
            </Text>
            <Button label="Inloggen" onPress={onNeedsLogin} />
          </Card>
        </ScrollView>
      </>
    );
  }

  const missing = seats.find(({ key, type }) => {
    if (!(attendees[key] ?? '').trim()) return true;
    return type.questions.some((question) => {
      if (!question.required) return false;
      const value = answers[key]?.[question.id];
      if (question.type === 'BOOLEAN') return value !== true;
      if (question.type === 'MULTIPLE_CHOICE') return !Array.isArray(value) || value.length === 0;
      return typeof value !== 'string' || value.trim() === '';
    });
  });

  const canSubmit =
    totals.count > 0 && !missing && terms && buyerName.trim().length >= 2 && buyerEmail.includes('@');

  const submit = async () => {
    setBusy(true);
    try {
      const checkout = await startTicketCheckout({
        eventId: event.id,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        locale,
        termsAccepted: true,
        items: seats.map(({ key, type }) => ({
          ticketTypeId: type.id,
          attendeeName: (attendees[key] ?? '').trim(),
          answers: answers[key] ?? {},
        })),
      });

      await WebBrowser.openBrowserAsync(checkout.checkoutUrl);

      // De browser sluiten zegt niets over de betaling: iemand kan wegklikken
      // terwijl de betaling doorliep, of terugkomen zonder betaald te hebben.
      // De server weet het, dus vragen we het daar.
      const status = await fetchOrderStatus(checkout.orderId).catch(() => null);
      if (status?.status === 'PAID') {
        onDone();
      } else {
        Alert.alert(
          'Bestelling nog niet bevestigd',
          'We zien nog geen betaling. Duurt dat langer dan een minuut, kijk dan bij Mijn tickets of in je mail.',
          [{ text: 'Naar mijn tickets', onPress: onDone }, { text: 'Hier blijven' }],
        );
      }
    } catch (error) {
      Alert.alert('Bestellen lukte niet', checkoutErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={event.title} subtitle={event.ownerGroupName} />
      <ScrollView contentContainerStyle={styles.content} style={styles.root} keyboardDismissMode="on-drag">
        <Card>
          <Text style={styles.body}>
            {formatEventWhen(event.startsAt, event.endsAt, false, locale)}
          </Text>
          {event.location ? <Text style={styles.hint}>{event.location}</Text> : null}
        </Card>

        {event.description ? (
          <Card>
            <Prose>{event.description}</Prose>
          </Card>
        ) : null}

        {event.ticketTypes.length === 0 ? (
          <Empty
            title="Geen tickets beschikbaar"
            hint="Er staat op dit moment niets te koop voor dit event."
          />
        ) : null}

        {event.ticketTypes.map((type) => {
          const quantity = quantities[type.id] ?? 0;
          const roomInOrder = event.maxTicketsPerOrder - totals.count + quantity;
          const max = Math.max(
            0,
            Math.min(type.available, type.maxPerOrder ?? Number.POSITIVE_INFINITY, roomInOrder),
          );

          return (
            <Card key={type.id}>
              <View style={styles.typeRow}>
                <View style={styles.typeText}>
                  <Text style={styles.title}>{type.name}</Text>
                  {type.description ? <Text style={styles.hint}>{type.description}</Text> : null}
                  <Text style={styles.price}>
                    {type.priceCents === 0 ? 'Gratis' : formatEuro(type.priceCents)}
                    {type.available === 0 ? '   uitverkocht' : `   nog ${type.available}`}
                  </Text>
                </View>
                <Stepper
                  value={quantity}
                  max={max}
                  label={type.name}
                  disabled={type.available === 0}
                  onChange={(next) =>
                    setQuantities((current) => ({ ...current, [type.id]: next }))
                  }
                />
              </View>
              {type.minPerOrder && type.minPerOrder > 1 ? (
                <Text style={styles.hint}>Minstens {type.minPerOrder} per bestelling.</Text>
              ) : null}
            </Card>
          );
        })}

        {seats.length > 0 ? (
          <>
            <Text style={styles.section}>Wie komt er?</Text>
            {seats.map(({ key, type, index }) => (
              <Card key={key}>
                <Text style={styles.kicker}>
                  {type.name.toUpperCase()}   TICKET {index + 1}
                </Text>
                <Text style={styles.label}>Naam</Text>
                <TextInput
                  value={attendees[key] ?? ''}
                  onChangeText={(next) => setAttendees((current) => ({ ...current, [key]: next }))}
                  style={styles.input}
                  autoCapitalize="words"
                  accessibilityLabel={`Naam voor ticket ${index + 1}, ${type.name}`}
                />
                {type.questions.map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    value={answers[key]?.[question.id]}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [key]: { ...(current[key] ?? {}), [question.id]: value },
                      }))
                    }
                  />
                ))}
              </Card>
            ))}

            <Text style={styles.section}>Jouw gegevens</Text>
            <Card>
              <Text style={styles.label}>Naam</Text>
              <TextInput
                value={buyerName}
                onChangeText={setBuyerName}
                style={styles.input}
                autoCapitalize="words"
                accessibilityLabel="Jouw naam"
              />
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                value={buyerEmail}
                onChangeText={setBuyerEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                accessibilityLabel="Jouw e-mailadres"
              />
              <Text style={styles.hint}>
                De tickets komen op dit adres toe, en staan daarna ook bij Mijn tickets.
              </Text>
            </Card>

            <Card>
              <Button
                label={terms ? 'Voorwaarden aanvaard' : 'Ik ga akkoord met de voorwaarden'}
                variant="ghost"
                onPress={() => setTerms(!terms)}
              />
              <Button
                label="Lees de voorwaarden"
                variant="ghost"
                onPress={() =>
                  void WebBrowser.openBrowserAsync(`${baseUrl()}${event.termsUrl}`)
                }
              />
            </Card>

            <Card>
              <View style={styles.totalRow}>
                <Text style={styles.title}>
                  {totals.count} {totals.count === 1 ? 'ticket' : 'tickets'}
                </Text>
                <Text style={styles.title}>
                  {totals.cents === 0 ? 'Gratis' : formatEuro(totals.cents)}
                </Text>
              </View>
              {missing ? (
                <Text style={styles.hint}>Vul eerst alle namen en verplichte vragen in.</Text>
              ) : null}
              <Button
                label={totals.cents === 0 ? 'Bestelling afronden' : 'Betalen'}
                busy={busy}
                disabled={!canSubmit}
                onPress={() => void submit()}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

/** De melding bij een geweigerde bestelling; de codes komen van `TicketCheckoutError`. */
function checkoutErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'EVENT_NOT_ON_SALE':
      return 'De verkoop voor dit event is intussen gesloten.';
    case 'SOLD_OUT':
      return 'Er zijn niet genoeg tickets meer beschikbaar.';
    case 'LOGIN_REQUIRED':
      return 'Voor dit ticket moet je ingelogd zijn.';
    case 'TOO_MANY_RESERVATIONS':
      return 'Je hebt al een bestelling lopen. Rond die eerst af of wacht tot ze vervalt.';
    case 'FREE_TICKET_LIMIT':
      return 'Je hebt het maximum aan gratis tickets bereikt.';
    case 'INVALID_QUANTITY':
      return 'Dat aantal kan niet voor dit tickettype.';
    case 'INVALID_ANSWER':
      return 'Een van de antwoorden is niet geldig. Kijk de vragen nog eens na.';
    case 'PAYMENT_UNAVAILABLE':
      return 'De betaaldienst is even niet bereikbaar. Probeer het straks opnieuw.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  section: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.sm },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  label: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  price: { ...TYPE.small, color: COLORS.body, marginTop: 2 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  typeText: { flex: 1, gap: 2 },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
