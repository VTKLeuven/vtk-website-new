import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';

import { CircleAlert } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppLocale, AppTheokot, AppTheokotItem, AppTheokotSession } from '../api/contract';
import {
  cancelTheokotOrder,
  fetchTheokot,
  placeTheokotOrder,
  releaseTheokotOrder,
  takeOverTheokotSandwich,
  updateTheokotOrder,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { DatePin } from '../components/DatePin';
import { PageHead } from '../components/PageHead';
import { PassCode } from '../components/PassCode';
import { Stepper } from '../components/Stepper';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { formatDate, formatDay, formatEuro, formatTime, formatTimeRange } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';

type Tab = 'bestellen' | 'afhalen';

/** Onder dit aantal zegt de voorraad iets; daarboven staat ze er niet, zoals op /theokot. */
const LOW_STOCK = 5;

/**
 * Broodjes: bestellen en afhalen, in de vorm van de bestelpagina van /theokot.
 *
 * Eén verkoopdag tegelijk, gekozen met de datumpinnen bovenaan; het broodje van
 * de week uitgelicht met zijn foto; het aanbod als lijst met een stapper; en het
 * totaal met de knop vast onderaan het scherm, zoals de site dat op een gsm doet.
 *
 * Alle regels staan op de server (`lib/theokot-orders.ts` in vtk-website-new): de
 * ban, het bestelvenster, hoeveel er per bestelling mag en wat er nog is. Dit
 * scherm rekent er wel mee, maar enkel om knoppen uit te schakelen; het beslist
 * niets. Is het hier soepeler dan op de server, dan is dat een bug in dit scherm.
 *
 * **Afhalen is een eigen tabblad.** Aan de balie sta je met een rij achter je;
 * dan wil je twee tikken en een code op het scherm, niet scrollen door het aanbod
 * van morgen.
 */
export default function BroodjesScreen() {
  const router = useTabRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { locale, viewer, gate, refresh: refreshApp } = useApp();
  const resource = useResource('theokot', () => fetchTheokot(locale), locale);
  const [tab, setTab] = useState<Tab>(params.tab === 'afhalen' ? 'afhalen' : 'bestellen');
  useTabParam<Tab>(params.tab, ['bestellen', 'afhalen'], setTab);

  const head = (badge?: number) => (
    <PageHead
      title="Broodjes"
      subtitle="Bij het Theokot"
      tabs={
        viewer && !gate
          ? {
              value: tab,
              onChange: setTab,
              options: [
                { value: 'bestellen', label: 'Bestellen' },
                { value: 'afhalen', label: 'Afhalen', badge },
              ],
            }
          : undefined
      }
    />
  );

  if (!viewer) {
    return (
      <>
        {head()}
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
        {head()}
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

  // Enkel wat er af te halen valt hoort in het tweede tabblad.
  const open = resource.data.sessions.filter((session) => session.order !== null);

  return (
    <View style={styles.root}>
      {head(open.length)}

      {tab === 'afhalen' ? (
        <Pickup sessions={open} locale={locale} onOrder={() => setTab('bestellen')} />
      ) : (
        <Ordering
          data={resource.data}
          stale={resource.stale}
          refreshing={resource.refreshing}
          onRefresh={() => void resource.refresh()}
          locale={locale}
          onChanged={() => {
            void resource.refresh();
            void refreshApp();
          }}
        />
      )}
    </View>
  );
}

/**
 * Bestellen: de verkoopdagen als datumpinnen, en van de gekozen dag het aanbod.
 * Standaard de eerste dag waarop je nog kan bestellen of al iets hebt staan.
 */
function Ordering({
  data,
  stale,
  refreshing,
  onRefresh,
  locale,
  onChanged,
}: {
  data: AppTheokot;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  locale: AppLocale;
  onChanged: () => void;
}) {
  const { sessions, ban, message, maxItemsPerOrder, maxWeeklySpecialPerOrder } = data;
  const [picked, setPicked] = useState<string | null>(null);
  const fallback =
    sessions.find((session) => session.canOrder || session.order || session.canTakeOver) ?? sessions[0];
  const session = sessions.find((item) => item.id === picked) ?? fallback;

  const header = (
    <>
      {stale ? <StaleNotice onRetry={onRefresh} /> : null}

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
        <Card featured>
          <Text style={styles.kicker}>Van het Theokot</Text>
          <Text style={styles.body}>{message}</Text>
        </Card>
      ) : null}

      {sessions.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
          {sessions.map((item) => {
            const active = item.id === session?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatDay(item.date, locale)}
                onPress={() => setPicked(item.id)}
              >
                <DatePin iso={item.date} locale={locale} tone={active ? 'yellow' : 'plain'} month={false} />
                {item.order ? <View style={styles.dayDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </>
  );

  if (!session) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {header}
        <Empty
          title="Geen verkoopdagen open"
          hint="Er staat nu niets klaar om te bestellen. Het Theokot zet de dagen meestal een paar dagen op voorhand open."
        />
      </ScrollView>
    );
  }

  return (
    <SessionView
      key={session.id}
      session={session}
      header={header}
      refreshing={refreshing}
      onRefresh={onRefresh}
      locale={locale}
      banned={Boolean(ban)}
      maxItems={maxItemsPerOrder}
      maxWeeklySpecial={maxWeeklySpecialPerOrder}
      onChanged={onChanged}
    />
  );
}

/**
 * Afhalen: je bestelling en de code die de balie scant.
 *
 * De code vervangt het intikken van je r-nummer. Aan de andere kant staat
 * dezelfde afhaalbalie als op de site; die herkent een pas aan zijn vorm en zoekt
 * er dezelfde bestelling mee op (`lib/theokot-pickup.ts`).
 */
function Pickup({
  sessions,
  locale,
  onOrder,
}: {
  sessions: AppTheokotSession[];
  locale: AppLocale;
  onOrder: () => void;
}) {
  if (sessions.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <Empty
          title="Niets af te halen"
          hint="Zodra je iets besteld hebt, staat hier de code die de balie scant."
          action={{ label: 'Naar het aanbod', onPress: onOrder }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <PassCode caption="Laat dit scannen aan de afhaalbalie van het Theokot." />

      {sessions.map((session) => {
        const order = session.order;
        if (!order) return null;
        return (
          <View key={session.id} style={styles.pickup}>
            <View style={styles.pickupHead}>
              <DatePin iso={session.date} locale={locale} size="sm" month={false} />
              <View style={styles.flex}>
                <Text style={styles.title}>{formatDay(session.date, locale)}</Text>
                <Text style={styles.hint}>
                  Afhalen {formatTimeRange(session.pickupStart, session.pickupEnd, locale)}
                </Text>
              </View>
            </View>
            <OrderLines order={order} label="Te betalen" />
            <Text style={styles.hint}>
              Je betaalt bij het afhalen. Heb je genoeg bonnetjes staan, dan kan de balie die
              gebruiken.
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function OrderLines({
  order,
  label,
}: {
  order: NonNullable<AppTheokotSession['order']>;
  label: string;
}) {
  return (
    <View style={styles.lines}>
      {order.lines.map((line, index) => (
        <View key={`${line.name}-${index}`} style={styles.orderLine}>
          <Text style={styles.orderQty}>{line.quantity}x</Text>
          <Text style={styles.orderName}>{line.name}</Text>
          <Text style={styles.orderPrice}>{formatEuro(line.quantity * line.unitPriceCents)}</Text>
        </View>
      ))}
      <View style={styles.orderTotal}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.title}>{formatEuro(order.totalCents)}</Text>
      </View>
    </View>
  );
}

/**
 * Eén verkoopdag: je reservatie, het aanbod en de balk onderaan. Een eigen
 * component met een `key` per dag, zodat wat je op de ene dag aantikte niet
 * meeschuift naar de volgende.
 */
function SessionView({
  session,
  header,
  refreshing,
  onRefresh,
  locale,
  banned,
  maxItems,
  maxWeeklySpecial,
  onChanged,
}: {
  session: AppTheokotSession;
  header: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  locale: AppLocale;
  banned: boolean;
  maxItems: number;
  maxWeeklySpecial: number;
  onChanged: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  // Een bestaande reservatie aanpassen: dezelfde stappers, met je eigen broodjes
  // al ingevuld en als vrije voorraad meegeteld (`updateOrder` op de server).
  const [editing, setEditing] = useState(false);
  const order = session.order;
  const own = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of order?.lines ?? []) {
      if (line.sessionItemId) map[line.sessionItemId] = (map[line.sessionItemId] ?? 0) + line.quantity;
    }
    return map;
  }, [order]);

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

  const pickupEnd = formatTime(session.pickupEnd, locale);
  const ordering = session.window === 'OPEN' && (!order || editing);

  const submit = async () => {
    setBusy(true);
    const lines = session.items
      .map((item) => ({ sessionItemId: item.id, quantity: quantities[item.id] ?? 0 }))
      .filter((line) => line.quantity > 0);
    try {
      if (editing && order) {
        await updateTheokotOrder({ orderId: order.orderId, lines });
        setEditing(false);
      } else {
        await placeTheokotOrder({ sessionId: session.id, lines });
      }
      setQuantities({});
      onChanged();
    } catch (error) {
      Alert.alert(editing ? 'Aanpassen lukte niet' : 'Bestellen lukte niet', orderErrorText(error));
      // Ook bij een fout opnieuw ophalen: "uitverkocht" en "al besteld" betekenen
      // allebei dat dit scherm achterloopt op de werkelijkheid.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setQuantities(own);
    setEditing(true);
  };

  /**
   * Na de deadline worden de broodjes al gemaakt: annuleren wordt vrijgeven. Een
   * ander kan ze dan overnemen; wat bij het einde van de afhaal nog vrij staat,
   * telt als no-show. Dezelfde uitleg als in de bevestiging op /theokot.
   */
  const release = () => {
    if (!order) return;
    Alert.alert(
      'Vrijgeven voor overname',
      `De deadline is verstreken en je broodjes worden al gemaakt. Wat je nu annuleert, wordt vrijgegeven voor overname. Neemt iemand anders het over, dan vervalt het zonder gevolgen. Blijft het om ${pickupEnd} over, dan telt dit als een no-show.`,
      [
        { text: 'Behouden', style: 'cancel' },
        {
          text: 'Vrijgeven',
          style: 'destructive',
          onPress: () => void act(() => releaseTheokotOrder({ orderId: order.orderId }), 'Vrijgeven lukte niet'),
        },
      ],
    );
  };

  const takeOver = (item: AppTheokotItem) => {
    Alert.alert(
      'Broodje overnemen?',
      `Je neemt 1x ${item.name} over voor ${formatEuro(item.priceCents)}. Je haalt het af en betaalt aan de balie, tot ${pickupEnd}. Haal je het niet op, dan telt dat als een no-show.`,
      [
        { text: 'Toch niet', style: 'cancel' },
        {
          text: 'Overnemen',
          onPress: () => void act(() => takeOverTheokotSandwich(item.id), 'Overnemen lukte niet'),
        },
      ],
    );
  };

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
          onPress: () => void act(() => cancelTheokotOrder(order.orderId), 'Annuleren lukte niet'),
        },
      ],
    );
  };

  const act = async (run: () => Promise<unknown>, failed: string) => {
    setBusy(true);
    try {
      await run();
    } catch (error) {
      Alert.alert(failed, orderErrorText(error));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const offered = session.canTakeOver ? session.items.filter((item) => (item.released ?? 0) > 0) : [];
  const ownCount = order?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const ownWeekly = (order?.lines ?? []).reduce(
    (sum, line) =>
      sum + (session.items.find((item) => item.id === line.sessionItemId)?.isWeeklySpecial ? line.quantity : 0),
    0,
  );
  const special = session.items.find((item) => item.isWeeklySpecial);
  const regular = session.items.filter((item) => item !== special);

  /** De bovengrens per item: wat er nog is, wat er nog in de bestelling past, en de aparte limiet van het broodje van de week. */
  const limitFor = (item: AppTheokotItem) => {
    const quantity = quantities[item.id] ?? 0;
    const available = item.remaining + (editing ? (own[item.id] ?? 0) : 0);
    const roomInOrder = maxItems - totals.items + quantity;
    const roomForSpecial = item.isWeeklySpecial
      ? maxWeeklySpecial - totals.specials + quantity
      : Number.POSITIVE_INFINITY;
    return { quantity, available, max: Math.max(0, Math.min(available, roomInOrder, roomForSpecial)) };
  };

  const stock = (available: number) =>
    available === 0 ? 'uitverkocht' : available <= LOW_STOCK ? `nog ${available}` : null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {header}

        <Text style={styles.when}>
          {session.window === 'UPCOMING' ? (
            <>Bestellen opent <Text style={styles.strong}>{formatDay(session.orderOpenAt, locale)}</Text>, </>
          ) : session.window === 'OPEN' ? (
            <>Bestellen tot <Text style={styles.strong}>{formatDay(session.orderCloseAt, locale)} {formatTime(session.orderCloseAt, locale)}</Text>, </>
          ) : (
            <>Bestellen is gesloten, </>
          )}
          afhalen <Text style={styles.strong}>{formatTimeRange(session.pickupStart, session.pickupEnd, locale)}</Text>.
        </Text>

        {order && !editing ? (
          <View style={styles.yours}>
            <Text style={styles.kicker}>Jouw bestelling</Text>
            <OrderLines order={order} label="Totaal" />
            {order.releasedCount ? (
              <Text style={styles.hint}>
                {order.releasedCount === 1
                  ? '1 broodje van deze bestelling staat vrij voor overname en is niet meer van jou.'
                  : `${order.releasedCount} broodjes van deze bestelling staan vrij voor overname en zijn niet meer van jou.`}{' '}
                Wat om {pickupEnd} niet overgenomen is, telt als no-show.
              </Text>
            ) : null}
            {order.canCancel ? (
              <View style={styles.buttons}>
                {order.canEdit ? (
                  <View style={styles.flex}>
                    <Button label="Aanpassen" variant="ghost" busy={busy} onPress={startEditing} />
                  </View>
                ) : null}
                <View style={styles.flex}>
                  <Button label="Annuleren" variant="ghost" busy={busy} onPress={cancel} />
                </View>
              </View>
            ) : order.canRelease && order.lines.length > 0 ? (
              <>
                <Text style={styles.hint}>
                  De deadline is voorbij en je broodjes worden al gemaakt. Kan je toch niet komen,
                  geef ze dan vrij: een ander kan ze overnemen.
                </Text>
                <Button label="Annuleren en vrijgeven" variant="ghost" busy={busy} onPress={release} />
              </>
            ) : (
              <Text style={styles.hint}>
                Kom je bestelling zeker afhalen: drie keer niet afhalen levert een tijdelijke
                schorsing op.
              </Text>
            )}
          </View>
        ) : null}

        {ordering ? (
          <>
            {special ? (
              <View style={styles.special}>
                {special.imageUrl ? (
                  <Image source={{ uri: special.imageUrl }} style={styles.specialPhoto} contentFit="cover" />
                ) : null}
                <View style={styles.specialBody}>
                  <Text style={styles.kicker}>Broodje van de week</Text>
                  <View style={styles.rule}>
                    <Text style={styles.specialName}>{special.name}</Text>
                  </View>
                  {special.ingredients ? <Text style={styles.hint}>{special.ingredients}</Text> : null}
                  <View style={styles.specialLine}>
                    <Text style={styles.price}>
                      {formatEuro(special.priceCents)}
                      {stock(limitFor(special).available) ? (
                        <Text style={styles.low}>   {stock(limitFor(special).available)}</Text>
                      ) : null}
                    </Text>
                    <Stepper
                      value={limitFor(special).quantity}
                      max={limitFor(special).max}
                      label={special.name}
                      disabled={banned || limitFor(special).available === 0}
                      onChange={(next) => setQuantity(special.id, next)}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            <SectionHeading>Het aanbod</SectionHeading>
            <View style={styles.register}>
              {regular.map((item) => {
                const { quantity, available, max } = limitFor(item);
                return (
                  <View key={item.id} style={styles.item}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={styles.thumb} />
                    )}
                    <View style={styles.flex}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.ingredients ? (
                        <Text style={styles.hint} numberOfLines={2}>
                          {item.ingredients}
                        </Text>
                      ) : null}
                      <Text style={styles.itemMeta}>
                        {formatEuro(item.priceCents)}
                        {stock(available) ? <Text style={styles.low}>   {stock(available)}</Text> : null}
                      </Text>
                    </View>
                    <Stepper
                      value={quantity}
                      max={max}
                      label={item.name}
                      disabled={banned || available === 0}
                      onChange={(next) => setQuantity(item.id, next)}
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {offered.length > 0 && !banned ? (
          <View style={styles.takeover}>
            <SectionHeading>Vrijgekomen broodjes</SectionHeading>
            <Text style={styles.hint}>
              Na de deadline geannuleerd en al gemaakt. Neem je een broodje over, dan haal je het
              af en betaal je aan de balie, tot {pickupEnd}.
            </Text>
            <View style={styles.register}>
              {offered.map((item) => {
                const full =
                  ownCount + 1 > maxItems || (item.isWeeklySpecial && ownWeekly + 1 > maxWeeklySpecial);
                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.flex}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        {formatEuro(item.priceCents)}   {item.released} vrij
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy || full}
                      onPress={() => takeOver(item)}
                      style={({ pressed }) => [styles.smallButton, (busy || full) && styles.disabled, pressed && styles.pressed]}
                    >
                      <Text style={styles.smallButtonLabel}>Overnemen</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {!ordering && !order && offered.length === 0 ? (
          <Text style={styles.hint}>
            {session.window === 'UPCOMING'
              ? 'Het aanbod verschijnt hier zodra het bestellen opengaat.'
              : 'Bestellen is gesloten voor deze dag.'}
          </Text>
        ) : null}
      </ScrollView>

      {ordering ? (
        <View style={styles.bar}>
          <View style={styles.flex}>
            <Text style={styles.barTotal}>
              {totals.items === 0
                ? 'Kies je broodjes'
                : `${totals.items} ${totals.items === 1 ? 'broodje' : 'broodjes'}, ${formatEuro(totals.cents)}`}
            </Text>
            <Text style={styles.hint}>
              {editing ? (
                <Text style={styles.link} onPress={() => { setEditing(false); setQuantities({}); }}>
                  Niet aanpassen
                </Text>
              ) : (
                `Tot ${maxItems} per dag`
              )}
            </Text>
          </View>
          <View style={styles.barButton}>
            <Button
              label={editing ? 'Bewaren' : 'Bestellen'}
              busy={busy}
              disabled={banned || totals.items === 0}
              onPress={() => void submit()}
            />
          </View>
        </View>
      ) : null}
    </View>
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
    case 'TAKEOVER_CLOSED':
      return 'De afhaal is voorbij: vrijgeven of overnemen kan niet meer.';
    case 'RELEASE_NOT_POSSIBLE':
      return 'Deze bestelling kan niet vrijgegeven worden. Een bestelling in de doos van een grocomeet ligt niet aan de balie.';
    case 'NOTHING_RELEASED':
      return 'Er is niets vrijgegeven om over te nemen.';
    case 'TAKEOVER_UNAVAILABLE':
      return 'Dit broodje is intussen al overgenomen.';
    case 'INVALID_ORDER':
      return 'Er is intussen iets veranderd aan het aanbod. Het scherm is bijgewerkt; probeer opnieuw.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  strong: { fontFamily: FONTS.semibold, color: COLORS.ink },
  kicker: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  link: { color: COLORS.navy, textDecorationLine: 'underline' },

  days: { gap: SPACING.sm, paddingRight: SPACING.lg },
  // Een stipje onder de dag waarop je al iets besteld hebt.
  dayDot: {
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.navy,
    marginTop: 4,
  },
  when: { ...TYPE.small, fontSize: 14, lineHeight: 20, color: COLORS.body },

  yours: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  buttons: { flexDirection: 'row', gap: SPACING.sm },
  lines: { gap: SPACING.xs },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  orderQty: { ...TYPE.body, color: COLORS.muted, minWidth: 24, fontVariant: ['tabular-nums'] },
  orderName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  orderPrice: { ...TYPE.body, color: COLORS.body, fontVariant: ['tabular-nums'] },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
  },

  // Het broodje van de week: een uitgelichte kaart met de gele rail, zoals op de site.
  special: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
    overflow: 'hidden',
  },
  specialPhoto: { width: '100%', aspectRatio: 2.6, backgroundColor: COLORS.paper2 },
  specialBody: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 4 },
  rule: { alignSelf: 'flex-start', paddingBottom: 5, borderBottomWidth: 3, borderBottomColor: COLORS.yellow },
  specialName: { fontFamily: FONTS.semibold, fontSize: 18, lineHeight: 23, color: COLORS.ink },
  specialLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  low: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.muted },

  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  thumb: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  itemName: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  itemMeta: { ...TYPE.small, color: COLORS.body, fontVariant: ['tabular-nums'] },

  takeover: { gap: SPACING.sm, marginTop: SPACING.sm },
  smallButton: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.paper },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },

  pickup: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  pickupHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },

  // Het totaal en de knop, vast onderaan zoals op /theokot op een gsm.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  barTotal: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  barButton: { minWidth: 132 },
});
