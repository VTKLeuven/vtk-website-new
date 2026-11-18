import { useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchScanEvents } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Button, Empty, ErrorState, Loading } from '../components/ui';
import { formatDayShort, formatTime } from '../format';
import { useTabRouter } from '../navigation';
import { queueSizes } from '../scanner/storage';
import { useApp } from '../state/app';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * Aan de deur: de evenementen die jij mag scannen.
 *
 * Hier landen het scanicoon in de kop van Tickets en de regel onder Meer, en
 * beide bestaan enkel voor wie iets te scannen heeft (`abilities.scanTickets`).
 * Een gewone student ziet dit scherm dus niet, tot een organisator hem de
 * uitnodigings-QR toont; daarna staat dat event hier, tot twaalf uur na afloop.
 * Welke events dat zijn, beslist de server (`listScannableTicketEvents`), met
 * dezelfde regels als `/scan` op de site.
 *
 * Een tik opent de scanner zelf (`/scan/<id>`), die als volledig scherm over de
 * tabbalk ligt. Bij het terugkeren komen de stand en de wachtrij opnieuw binnen:
 * die zijn net veranderd.
 */
export default function DeurScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const [waiting, setWaiting] = useState<Map<string, number>>(() => queueSizes());

  const events = useResource(
    'scan-events',
    () => (viewer ? fetchScanEvents(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  // Terug uit de scanner: de stand en de wachtrij zijn net veranderd. De eerste
  // keer niet, want dan haalt `useResource` zelf al op.
  const { refresh } = events;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setWaiting(queueSizes());
      void refresh();
    }, [refresh]),
  );

  if (!viewer) {
    return (
      <>
        <PageHead title="Aan de deur" />
        <View style={styles.root}>
          <Empty
            title="Log eerst in"
            hint="Scanrechten hangen aan je account."
            action={{ label: 'Inloggen', onPress: () => router.push('/inloggen') }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <PageHead title="Aan de deur" subtitle="Kies het evenement waar je scant" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={events.refreshing} onRefresh={() => void events.refresh()} />
        }
      >
        {events.loading ? (
          <Loading label="Evenementen ophalen" />
        ) : !events.data ? (
          <ErrorState message={messageFor(events.error)} onRetry={() => void events.refresh()} />
        ) : events.data.length === 0 ? (
          <View style={styles.empty}>
            <Empty
              title="Niets om te scannen"
              hint="Kom je helpen aan de deur? Vraag wie het evenement organiseert om de uitnodigings-QR te tonen in de scanner, en scan die hier."
            />
            <Button label="Uitnodiging scannen" onPress={() => router.push('/scannen')} />
          </View>
        ) : (
          <View style={styles.list}>
            {events.data.map((event) => {
              const pending = waiting.get(event.id) ?? 0;
              return (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Scannen: ${event.title}`}
                  onPress={() => router.push(`/scan/${event.id}`)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.text}>
                    <Text style={styles.kicker}>
                      {formatDayShort(event.startsAt, locale).toUpperCase()},{' '}
                      {formatTime(event.startsAt, locale)}
                    </Text>
                    <Text style={styles.title}>{event.title}</Text>
                    {event.location ? <Text style={styles.detail}>{event.location}</Text> : null}
                    <Text style={styles.detail}>
                      {event.checkedIn} van {event.total} binnen
                    </Text>
                    {pending > 0 ? (
                      <Text style={styles.pending}>
                        {pending} {pending === 1 ? 'scan wacht' : 'scans wachten'} op dit toestel
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight color={COLORS.muted} size={18} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/**
 * Een register zoals de takenlijst op Home: haarlijnen ertussen, geen witte
 * kaart per event.
 */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: SPACING.xxl },
  empty: { padding: SPACING.lg, gap: SPACING.md },
  list: { borderTopWidth: 1, borderTopColor: COLORS.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.xl - 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  pressed: { backgroundColor: COLORS.paper2 },
  text: { flex: 1, gap: 2 },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  detail: { ...TYPE.small, color: COLORS.muted },
  pending: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.navy },
});
