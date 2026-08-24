import { useRouter } from 'expo-router';
import { ChevronRight, TicketCheck } from 'lucide-react-native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { fetchTicketEvents } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Empty, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatDayShort, formatEuro } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * De events waarvoor er tickets te koop zijn.
 *
 * Geen eigen tab: tickets zijn belangrijk maar niet dagelijks, en zes tabs is er
 * een te veel. Dit scherm is bereikbaar vanaf Home, vanaf een evenement in de
 * kalender en vanaf Info; dat is drie keer één tik.
 */
export default function TicketsScreen() {
  const router = useRouter();
  const { locale } = useApp();
  const resource = useResource('tickets', () => fetchTicketEvents(locale), locale);

  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <>
      <PageHead
        title="Tickets"
        subtitle="Voor cantussen, galabals en andere VTK-events"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mijn tickets"
            onPress={() => router.push('/mijn-tickets')}
            hitSlop={10}
          >
            <TicketCheck color={COLORS.yellow} size={22} />
          </Pressable>
        }
      />

      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <FlatList
        data={resource.data}
        keyExtractor={(event) => event.id}
        style={styles.root}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => router.push(`/tickets/${item.slug}`)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.text}>
              <Text style={styles.when}>{formatDayShort(item.startsAt, locale)}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.ownerGroupName}
                {item.location ? `   ${item.location}` : ''}
              </Text>
              <Text style={styles.price}>
                {item.requiresLogin
                  ? 'Log in om de ledentickets te zien'
                  : item.fromPriceCents === null
                    ? 'Geen tickets meer beschikbaar'
                    : item.fromPriceCents === 0
                      ? 'Gratis'
                      : `Vanaf ${formatEuro(item.fromPriceCents)}`}
              </Text>
            </View>
            <ChevronRight color={COLORS.muted} size={18} />
          </Pressable>
        )}
        ListEmptyComponent={
          <Empty
            title="Momenteel geen ticketverkoop"
            hint="Nieuwe events verschijnen hier zodra de verkoop opengaat."
            action={{ label: 'Bekijk de kalender', onPress: () => router.push('/kalender') }}
          />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
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
  text: { flex: 1, gap: 2 },
  when: { ...TYPE.kicker, color: COLORS.muted },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.muted },
  price: { ...TYPE.small, color: COLORS.body, marginTop: 2 },
});
