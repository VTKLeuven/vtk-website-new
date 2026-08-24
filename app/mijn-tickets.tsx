import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { baseUrl } from '../src/api/client';
import type { AppMyTicket } from '../src/api/contract';
import { fetchMyTickets } from '../src/api/endpoints';
import { messageFor, useResource } from '../src/api/useResource';
import { PageHead } from '../src/components/PageHead';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../src/components/ui';
import { formatDay } from '../src/format';
import { useApp } from '../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../src/theme/tokens';

/**
 * Mijn tickets.
 *
 * De QR wordt hier getekend uit het `credential` dat de server meestuurt, en niet
 * als afbeelding opgehaald. Dat is niet alleen een rondje minder: aan de ingang
 * van een zaal is het netwerk vaak weg, en een ticket dat dan niet te tonen is,
 * is geen ticket. Wat er in de leescache staat, volstaat om binnen te geraken.
 *
 * De code staat groot en op wit, want een scanner heeft aan een klein vierkantje
 * achter een telefoonhoesje te weinig. De schermhelderheid opdrijven zou nog
 * helpen, maar dat vraagt een native module en dus een nieuwe build; het is de
 * moeite om te overwegen als het aan een deur tegenvalt.
 */
export default function MijnTicketsScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('mijn-tickets', () => fetchMyTickets(locale), locale);

  if (!viewer) {
    return (
      <>
        <PageHead title="Mijn tickets" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Je tickets hangen aan je account.</Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const orders = resource.data;

  return (
    <>
      <PageHead title="Mijn tickets" subtitle="Toon de code aan de ingang" />
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {orders.length === 0 ? (
          <Empty
            title="Nog geen tickets"
            hint="Wat je koopt, komt hier te staan en blijft ook zonder netwerk zichtbaar."
            action={{ label: 'Naar de ticketverkoop', onPress: () => router.push('/tickets') }}
          />
        ) : null}

        {orders.map((order) => (
          <View key={order.id} style={styles.order}>
            <Text style={styles.eventTitle}>{order.event.title}</Text>
            <Text style={styles.hint}>
              {formatDay(order.event.startsAt, locale)}
              {order.event.location ? `   ${order.event.location}` : ''}
            </Text>
            <Text style={styles.hint}>Bestelling {order.orderNumber}</Text>

            {order.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function TicketCard({ ticket }: { ticket: AppMyTicket }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  // De code vult bijna de kaartbreedte: een scanner heeft aan een klein vierkantje
  // op een telefoonscherm te weinig, zeker met een hoesje ervoor.
  const size = Math.min(260, width - SPACING.lg * 2 - SPACING.lg * 2);
  const used = Boolean(ticket.checkedInAt);

  return (
    <Card>
      <Text style={styles.ticketType}>{ticket.typeName}</Text>
      {ticket.attendeeName ? <Text style={styles.body}>{ticket.attendeeName}</Text> : null}

      {used ? (
        <View style={styles.usedRow}>
          <CircleCheck color={COLORS.muted} size={16} />
          <Text style={styles.hint}>Al gescand</Text>
        </View>
      ) : null}

      <View style={styles.qrWrap}>
        <QRCode value={ticket.credential} size={size} backgroundColor="#FFFFFF" color={COLORS.ink} />
      </View>
      <Text style={styles.code}>{ticket.publicId}</Text>

      <Button
        label={open ? 'Minder' : 'PDF en wallet'}
        variant="ghost"
        onPress={() => setOpen(!open)}
      />

      {open ? (
        <>
          <Button
            label="Ticket als PDF"
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(ticket.pdfUrl)}
          />
          {ticket.walletAppleUrl ? (
            <Button
              label="Aan Apple Wallet toevoegen"
              variant="ghost"
              onPress={() => void WebBrowser.openBrowserAsync(ticket.walletAppleUrl as string)}
            />
          ) : null}
          {ticket.walletGoogleUrl ? (
            <Button
              label="Aan Google Wallet toevoegen"
              variant="ghost"
              onPress={() => void WebBrowser.openBrowserAsync(ticket.walletGoogleUrl as string)}
            />
          ) : null}
          <Text style={styles.hint}>
            Deze knoppen openen {baseUrl().replace(/^https?:\/\//, '')} in je browser.
          </Text>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  order: { gap: SPACING.sm },
  eventTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  ticketType: { ...TYPE.cardTitle, color: COLORS.ink },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  code: { ...TYPE.small, color: COLORS.muted, textAlign: 'center', letterSpacing: 1 },
});
