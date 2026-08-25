import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CircleAlert, Info } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import type { AppLocale, AppTheokotSession } from '../../src/api/contract';
import { cancelTheokotOrder, fetchTheokot, placeTheokotOrder } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Stepper } from '../../src/components/Stepper';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatDate, formatDay, formatEuro, formatTimeRange } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Broodjes bestellen bij het Theokot.
 *
 * Alle regels staan op de server (`lib/theokot-orders.ts` in vtk-website-new): de
 * ban, het bestelvenster, hoeveel er per bestelling mag en wat er nog is. Dit
 * scherm rekent er wel mee, maar enkel om knoppen uit te schakelen; het beslist
 * niets. Is het hier soepeler dan op de server, dan is dat een bug in dit scherm
 * en geen reden om de server te versoepelen.
 */
export default function BestellenScreen() {
  const router = useRouter();
  const { locale, viewer, gate, refresh: refreshApp } = useApp();
  const resource = useResource('theokot', () => fetchTheokot(locale), locale);

  if (!viewer) {
    return (
      <>
        <PageHead title="Bestellen" subtitle="Broodjes bij het Theokot" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Een bestelling hangt aan jouw naam, dus die kan enkel met een account. Hetzelfde
              account als op vtk.be.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (gate) {
    return (
      <>
        <PageHead title="Bestellen" subtitle="Broodjes bij het Theokot" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card featured>
            <Text style={styles.title}>
              {gate === 'onboarding' ? 'Werk eerst je profiel af' : 'Bevestig eerst je studie'}
            </Text>
            <Text style={styles.body}>
              Zolang dit openstaat kan je niet bestellen. Het duurt een minuut.
            </Text>
            <Button
              label="Nu doen"
              onPress={() => router.push({ pathname: '/poort', params: { gate } })}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Aanbod ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { sessions, ban, message, maxItemsPerOrder, maxWeeklySpecialPerOrder } = resource.data;

  return (
    <>
      <PageHead title="Bestellen" subtitle="Broodjes bij het Theokot" />
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

        {ban ? (
          <Card featured>
            <View style={styles.rowIcon}>
              <CircleAlert color={COLORS.ink} size={18} />
              <Text style={styles.title}>Tijdelijk geschorst</Text>
            </View>
            <Text style={styles.body}>
              Je kan tot {formatDate(ban.until, locale)} niet bestellen, omdat er bestellingen niet
              opgehaald zijn. Daarna gaat het vanzelf weer.
            </Text>
          </Card>
        ) : null}

        {message ? (
          <Card>
            <View style={styles.rowIcon}>
              <Info color={COLORS.muted} size={16} />
              <Text style={styles.kicker}>VAN HET THEOKOT</Text>
            </View>
            <Text style={styles.body}>{message}</Text>
          </Card>
        ) : null}

        {sessions.length === 0 ? (
          <Empty
            title="Geen verkoopdagen open"
            hint="Er staat nu niets klaar om te bestellen. Het Theokot zet de dagen meestal een paar dagen op voorhand open."
          />
        ) : null}

        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            locale={locale}
            banned={Boolean(ban)}
            maxItems={maxItemsPerOrder}
            maxWeeklySpecial={maxWeeklySpecialPerOrder}
            onChanged={() => {
              void resource.refresh();
              void refreshApp();
            }}
          />
        ))}
      </ScrollView>
    </>
  );
}

function SessionCard({
  session,
  locale,
  banned,
  maxItems,
  maxWeeklySpecial,
  onChanged,
}: {
  session: AppTheokotSession;
  locale: AppLocale;
  banned: boolean;
  maxItems: number;
  maxWeeklySpecial: number;
  onChanged: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    let items = 0;
    let specials = 0;
    let cents = 0;
    for (const item of session.items) {
      const quantity = quantities[item.id] ?? 0;
      items += quantity;
      if (item.isWeeklySpecial) specials += quantity;
      cents += quantity * item.priceCents;
    }
    return { items, specials, cents };
  }, [quantities, session.items]);

  const setQuantity = useCallback((itemId: string, next: number) => {
    setQuantities((current) => ({ ...current, [itemId]: next }));
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await placeTheokotOrder({
        sessionId: session.id,
        lines: session.items
          .map((item) => ({ sessionItemId: item.id, quantity: quantities[item.id] ?? 0 }))
          .filter((line) => line.quantity > 0),
      });
      setQuantities({});
      onChanged();
    } catch (error) {
      Alert.alert('Bestellen lukte niet', orderErrorText(error));
      // Ook bij een fout opnieuw ophalen: "uitverkocht" en "al besteld" betekenen
      // allebei dat dit scherm achterloopt op de werkelijkheid.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const order = session.order;

  const cancel = () => {
    if (!order) return;
    Alert.alert(
      'Bestelling annuleren',
      `Je annuleert je bestelling van ${formatDay(session.date, locale)}. De broodjes komen weer vrij voor iemand anders.`,
      [
        { text: 'Behouden', style: 'cancel' },
        {
          text: 'Annuleren',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await cancelTheokotOrder(order.orderId);
              onChanged();
            } catch (error) {
              Alert.alert('Annuleren lukte niet', orderErrorText(error));
              onChanged();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.session}>
      <View style={styles.sessionHead}>
        <Text style={styles.sessionDay}>{formatDay(session.date, locale)}</Text>
        <Text style={styles.hint}>
          Afhalen {formatTimeRange(session.pickupStart, session.pickupEnd, locale)}
        </Text>
        {session.weeklySpecialName ? (
          <Text style={styles.hint}>Broodje van de week: {session.weeklySpecialName}</Text>
        ) : null}
      </View>

      {order ? (
        <View style={styles.order}>
          <Text style={styles.kicker}>JOUW BESTELLING</Text>
          {order.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.orderLine}>
              <Text style={styles.orderQty}>{line.quantity}</Text>
              <Text style={styles.orderName}>{line.name}</Text>
              <Text style={styles.orderPrice}>
                {formatEuro(line.quantity * line.unitPriceCents)}
              </Text>
            </View>
          ))}
          <View style={styles.orderTotal}>
            <Text style={styles.title}>Totaal</Text>
            <Text style={styles.title}>{formatEuro(order.totalCents)}</Text>
          </View>
          <Text style={styles.hint}>Je betaalt bij het afhalen.</Text>
          {order.canCancel ? (
            <Button label="Bestelling annuleren" variant="ghost" busy={busy} onPress={cancel} />
          ) : (
            <Text style={styles.hint}>
              De annulatiedeadline is voorbij. Kom je bestelling zeker afhalen: drie keer niet
              afhalen levert een tijdelijke schorsing op.
            </Text>
          )}
        </View>
      ) : session.window === 'UPCOMING' ? (
        <Text style={styles.hint}>Bestellen opent {formatDay(session.orderOpenAt, locale)}.</Text>
      ) : session.window === 'CLOSED' ? (
        <Text style={styles.hint}>Bestellen is gesloten voor deze dag.</Text>
      ) : (
        <>
          <View style={styles.items}>
            {session.items.map((item) => {
              const quantity = quantities[item.id] ?? 0;
              // De bovengrens per item is de strengste van drie: wat er nog is,
              // wat er nog in de bestelling past, en bij een broodje van de week
              // ook die aparte limiet.
              const roomInOrder = maxItems - totals.items + quantity;
              const roomForSpecial = item.isWeeklySpecial
                ? maxWeeklySpecial - totals.specials + quantity
                : Number.POSITIVE_INFINITY;
              const max = Math.max(0, Math.min(item.remaining, roomInOrder, roomForSpecial));

              return (
                <View key={item.id} style={styles.item}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.photo} contentFit="cover" />
                  ) : null}
                  <View style={styles.itemText}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.ingredients ? (
                      <Text style={styles.hint} numberOfLines={3}>
                        {item.ingredients}
                      </Text>
                    ) : null}
                    <Text style={styles.itemMeta}>
                      {formatEuro(item.priceCents)}
                      {item.remaining === 0 ? '   uitverkocht' : `   nog ${item.remaining}`}
                    </Text>
                  </View>
                  <Stepper
                    value={quantity}
                    max={max}
                    label={item.name}
                    disabled={banned || item.remaining === 0}
                    onChange={(next) => setQuantity(item.id, next)}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.summary}>
            <Text style={styles.body}>
              {totals.items === 0
                ? `Kies tot ${maxItems} broodjes`
                : `${totals.items} van ${maxItems}   ${formatEuro(totals.cents)}`}
            </Text>
            <Button
              label="Bestellen"
              busy={busy}
              disabled={banned || totals.items === 0}
              onPress={() => void submit()}
            />
          </View>
        </>
      )}
    </Card>
  );
}

/**
 * De melding bij een geweigerde bestelling.
 *
 * De server stuurt een code en geen zin, precies zodat die hier in het Nederlands
 * van de app staat. Wat we niet doen is de reden verzwijgen: "er ging iets mis"
 * laat iemand opnieuw proberen terwijl hij geschorst is.
 */
function orderErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'BANNED':
      return 'Je bent tijdelijk geschorst omdat er bestellingen niet opgehaald zijn.';
    case 'ORDER_CLOSED':
      return 'Bestellen is intussen gesloten voor deze dag.';
    case 'ALREADY_ORDERED':
      return 'Je hebt al een bestelling voor deze dag. Eén per dag.';
    case 'SESSION_NOT_FOUND':
      return 'Deze verkoopdag bestaat niet meer.';
    case 'ORDER_NOT_FOUND':
      return 'Die bestelling is er niet meer.';
    case 'NOT_CANCELABLE':
      return 'Deze bestelling kan niet meer geannuleerd worden.';
    case 'CANCEL_DEADLINE_PASSED':
      return 'De annulatiedeadline is voorbij.';
    case 'INVALID_ORDER':
      return 'Er is intussen iets veranderd aan het aanbod. Het scherm is bijgewerkt; probeer opnieuw.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  session: { gap: SPACING.lg },
  sessionHead: { gap: SPACING.xs },
  sessionDay: { ...TYPE.sectionTitle, color: COLORS.ink },

  items: { gap: SPACING.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  photo: { width: 52, height: 52, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  itemText: { flex: 1, gap: 2 },
  itemName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  itemMeta: { ...TYPE.small, color: COLORS.muted },

  summary: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },

  order: {
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  orderQty: { ...TYPE.body, color: COLORS.muted, minWidth: 20 },
  orderName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  orderPrice: { ...TYPE.body, color: COLORS.body },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: SPACING.sm,
  },
});
