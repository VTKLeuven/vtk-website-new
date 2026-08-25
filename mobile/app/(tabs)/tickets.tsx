import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, CircleCheck, ScanLine } from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { baseUrl } from '../../src/api/client';
import type { AppMyTicket } from '../../src/api/contract';
import { fetchMyTickets, fetchTicketEvents } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Segmented } from '../../src/components/Segmented';
import { VtkQr } from '../../src/components/VtkQr';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatDay, formatDayShort, formatEuro } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';
import { useTabParam } from '../../src/useTabParam';

type Tab = 'kopen' | 'mijne';

/**
 * Tickets: kopen en tonen, in één tab met twee segmenten.
 *
 * Dat is een van de twee redenen waarom tickets een eigen plaats in de onderbalk
 * kregen. De andere is dat tonen tijdgevoelig is: aan de deur van een cantus wil
 * je niet door een menu moeten. Twee tikken en de code staat op het scherm.
 *
 * **De QR wordt hier getekend uit het `credential` dat de server meestuurt** en
 * niet als afbeelding opgehaald. Dat is niet enkel een rondje minder: aan de
 * ingang van een zaal is het netwerk vaak weg, en een ticket dat dan niet te
 * tonen is, is geen ticket. Wat er in de leescache staat, volstaat om binnen te
 * geraken.
 *
 * **Mijn tickets staat vooraan en is het standaardsegment.** Wie hier binnenkomt
 * heeft meestal al een ticket en wil het tonen; kopen doe je een keer, tonen doe
 * je aan elke deur. Wie niet ingelogd is, ziet wel de verkoop, want zijn eigen
 * tickets zijn dan enkel een aanmeldscherm.
 *
 * De scanknop staat er ook, maar enkel voor wie mag scannen. Zo hoeft een shifter
 * die komt bijspringen niets te installeren: hij scant de uitnodigings-QR die een
 * praesidiumlid toont en kan meteen aan de deur staan.
 */
export default function TicketsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { locale, viewer, bootstrap } = useApp();
  const [tab, setTab] = useState<Tab>(() => {
    if (params.tab === 'kopen' || params.tab === 'mijne') return params.tab;
    return viewer ? 'mijne' : 'kopen';
  });
  useTabParam<Tab>(params.tab, ['kopen', 'mijne'], setTab);

  const sales = useResource('tickets', () => fetchTicketEvents(locale), locale);
  const mine = useResource(
    'mijn-tickets',
    () => (viewer ? fetchMyTickets(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  const ticketCount = (mine.data ?? []).reduce((total, order) => total + order.tickets.length, 0);

  return (
    <>
      <PageHead
        title="Tickets"
        subtitle="Voor cantussen, galabals en andere VTK-events"
        back={false}
        right={
          bootstrap?.abilities?.scanTickets ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tickets scannen"
              onPress={() => router.push('/scannen')}
              hitSlop={10}
            >
              <ScanLine color={COLORS.yellow} size={22} />
            </Pressable>
          ) : undefined
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mijne', label: 'Mijn tickets', badge: ticketCount },
          { value: 'kopen', label: 'Kopen' },
        ]}
      />

      {tab === 'kopen' ? (
        <SalesList resource={sales} locale={locale} onOpen={(slug) => router.push(`/ticket/${slug}`)} />
      ) : (
        <MyTickets
          resource={mine}
          locale={locale}
          loggedIn={Boolean(viewer)}
          onLogin={() => router.push('/inloggen')}
          onShop={() => setTab('kopen')}
        />
      )}
    </>
  );
}

// ── Kopen ───────────────────────────────────────────────────────────────────

function SalesList({
  resource,
  locale,
  onOpen,
}: {
  resource: ReturnType<typeof useResource<Awaited<ReturnType<typeof fetchTicketEvents>>>>;
  locale: 'nl' | 'en';
  onOpen: (slug: string) => void;
}) {
  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
      }
    >
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      {resource.data.length === 0 ? (
        <Empty
          title="Momenteel geen ticketverkoop"
          hint="Nieuwe events verschijnen hier zodra de verkoop opengaat. Duid in de kalender aan wat je interesseert, dan krijg je een bericht."
        />
      ) : null}

      {resource.data.map((event) => (
        <Pressable
          key={event.id}
          accessibilityRole="button"
          accessibilityLabel={event.title}
          onPress={() => onOpen(event.slug)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowText}>
            <Text style={styles.when}>{formatDayShort(event.startsAt, locale)}</Text>
            <Text style={styles.rowTitle}>{event.title}</Text>
            <Text style={styles.meta}>{event.ownerGroupName}</Text>
            {event.location ? <Text style={styles.meta}>{event.location}</Text> : null}
            <Text style={styles.price}>
              {event.requiresLogin
                ? 'Log in om de ledentickets te zien'
                : event.fromPriceCents === null
                  ? 'Geen tickets meer beschikbaar'
                  : event.fromPriceCents === 0
                    ? 'Gratis'
                    : `Vanaf ${formatEuro(event.fromPriceCents)}`}
            </Text>
          </View>
          <ChevronRight color={COLORS.muted} size={18} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── Mijn tickets ────────────────────────────────────────────────────────────

function MyTickets({
  resource,
  locale,
  loggedIn,
  onLogin,
  onShop,
}: {
  resource: ReturnType<typeof useResource<Awaited<ReturnType<typeof fetchMyTickets>>>>;
  locale: 'nl' | 'en';
  loggedIn: boolean;
  onLogin: () => void;
  onShop: () => void;
}) {
  if (!loggedIn) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Log eerst in</Text>
          <Text style={styles.body}>Je tickets hangen aan je account.</Text>
          <Button label="Inloggen" onPress={onLogin} />
        </Card>
      </ScrollView>
    );
  }

  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
      }
    >
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      {resource.data.length === 0 ? (
        <Empty
          title="Nog geen tickets"
          hint="Wat je koopt, komt hier te staan en blijft ook zonder netwerk zichtbaar."
          action={{ label: 'Naar de verkoop', onPress: onShop }}
        />
      ) : null}

      {resource.data.map((order) => (
        <View key={order.id} style={styles.order}>
          <Text style={styles.eventTitle}>{order.event.title}</Text>
          <Text style={styles.hint}>{formatDay(order.event.startsAt, locale)}</Text>
          {order.event.location ? <Text style={styles.hint}>{order.event.location}</Text> : null}
          <Text style={styles.hint}>Bestelling {order.orderNumber}</Text>

          {order.tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function TicketCard({ ticket }: { ticket: AppMyTicket }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const size = Math.min(260, width - SPACING.lg * 4);
  const used = Boolean(ticket.checkedInAt);

  return (
    <Card>
      <Text style={styles.cardTitle}>{ticket.typeName}</Text>
      {ticket.attendeeName ? <Text style={styles.body}>{ticket.attendeeName}</Text> : null}

      {used ? (
        <View style={styles.usedRow}>
          <CircleCheck color={COLORS.muted} size={16} />
          <Text style={styles.hint}>Al gescand</Text>
        </View>
      ) : null}

      <View style={styles.qrWrap}>
        <VtkQr value={ticket.credential} size={size} />
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
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  pressed: { backgroundColor: COLORS.paper2 },
  rowText: { flex: 1, gap: 2 },
  when: { ...TYPE.kicker, color: COLORS.muted },
  rowTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.muted },
  price: { ...TYPE.small, color: COLORS.body, marginTop: 2 },

  order: { gap: SPACING.sm },
  eventTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // De QR draagt zijn eigen navy kader, dus er hoeft geen tweede wit vlak omheen.
  qrWrap: { alignSelf: 'center', marginVertical: SPACING.sm },
  code: { ...TYPE.small, color: COLORS.muted, textAlign: 'center', letterSpacing: 1 },
});
