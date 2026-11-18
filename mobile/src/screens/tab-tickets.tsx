import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { CircleCheck, ScanLine } from 'lucide-react-native';
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

import { baseUrl } from '../api/client';
import type { AppMyTicket } from '../api/contract';
import { fetchMyTickets, fetchTicketEvents } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { DatePin } from '../components/DatePin';
import { VtkQr } from '../components/VtkQr';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { formatDay, formatEuro } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';

type Tab = 'kopen' | 'mijne';

/**
 * Tickets: kopen en tonen, in één tab met twee tabbladen in de kop.
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
  const router = useTabRouter();
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
        tabs={{
          value: tab,
          onChange: setTab,
          options: [
            { value: 'kopen', label: 'Kopen' },
            { value: 'mijne', label: 'Mijn tickets', badge: ticketCount },
          ],
        }}
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
          style={({ pressed }) => [styles.ticket, pressed && styles.pressed]}
        >
          <View style={styles.shot}>
            {event.imageUrl ? (
              <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
            ) : null}
            <View style={styles.pin}>
              <DatePin iso={event.startsAt} locale={locale} shadow />
            </View>
          </View>
          <View style={styles.ticketBody}>
            <Text style={styles.org} numberOfLines={1}>
              {event.ownerGroupName}
              {event.location ? `, ${event.location}` : ''}
            </Text>
            <View style={styles.titleWrap}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {event.title}
              </Text>
            </View>
            <View style={styles.buy}>
              <View style={styles.priceCol}>
                {event.requiresLogin ? (
                  <Text style={styles.priceHint}>Log in om de ledentickets te zien</Text>
                ) : event.fromPriceCents === null ? (
                  <Text style={styles.priceHint}>Geen tickets meer beschikbaar</Text>
                ) : (
                  <>
                    <Text style={styles.priceHint}>{event.fromPriceCents === 0 ? 'Prijs' : 'Vanaf'}</Text>
                    <Text style={styles.price}>
                      {event.fromPriceCents === 0 ? 'Gratis' : formatEuro(event.fromPriceCents)}
                    </Text>
                  </>
                )}
              </View>
              <View style={styles.cta}>
                <Text style={styles.ctaLabel}>Tickets</Text>
              </View>
            </View>
          </View>
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
          <SectionHeading>{order.event.title}</SectionHeading>
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
  list: { padding: SPACING.xl - 4, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },

  // De kaart van /tickets: banner met de gele datumpin, de titel met de gele lijn,
  // de prijs en de knop onderaan. Lager dan 16:9, zodat er meer onder elkaar past.
  ticket: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.92 },
  shot: { aspectRatio: 2.4, backgroundColor: COLORS.paper2 },
  photo: { ...StyleSheet.absoluteFill },
  pin: { position: 'absolute', right: SPACING.lg, bottom: -24 },
  ticketBody: { paddingHorizontal: SPACING.lg, paddingTop: 8, paddingBottom: SPACING.md, gap: 4 },
  org: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.muted, paddingRight: 70 },
  titleWrap: {
    alignSelf: 'flex-start',
    paddingBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  rowTitle: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, color: COLORS.ink },
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  priceCol: { flex: 1 },
  priceHint: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  price: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  cta: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  ctaLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.paper },

  order: { gap: SPACING.sm },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // De QR draagt zijn eigen navy kader, dus er hoeft geen tweede wit vlak omheen.
  qrWrap: { alignSelf: 'center', marginVertical: SPACING.sm },
  code: { ...TYPE.small, color: COLORS.muted, textAlign: 'center', letterSpacing: 1 },
});
