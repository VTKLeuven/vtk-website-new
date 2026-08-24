import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { baseUrl } from '../../src/api/client';
import { fetchCalendarEvent } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { Button, Card, ErrorState, Loading } from '../../src/components/ui';
import { formatEventWhen } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Eén evenement.
 *
 * De foto onder een navy scrim is de enige donkere kaartvulling die de huisstijl
 * toelaat, en ze doet hier het werk van de paginakop: er staat al een beeld, dus
 * er hoeft geen tweede donkere band boven.
 *
 * Tickets en inschrijven verwijzen naar de site. Dat is fase 2 werk; tot dan is
 * een knop die naar de echte pagina gaat eerlijker dan geen knop.
 */
export default function EventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();

  const resource = useResource(
    `evenement:${id}`,
    () => fetchCalendarEvent(locale, id),
    `${locale}:${id}`,
  );

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const event = resource.data;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {event.imageUrl ? (
          <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" />
        ) : null}
        <View style={styles.scrim} />
        <View style={[styles.heroText, { paddingTop: insets.top + SPACING.xxl }]}>
          <Text style={styles.group}>{event.groupName.toUpperCase()}</Text>
          <Text style={styles.title}>{event.title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Terug"
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.back, { top: insets.top + SPACING.sm }]}
        >
          <ArrowLeft color={COLORS.onDark} size={22} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Card>
          <View style={styles.fact}>
            <CalendarDays color={COLORS.muted} size={18} />
            <Text style={styles.factText}>
              {formatEventWhen(event.start, event.end, event.allDay, locale)}
            </Text>
          </View>
          {event.location ? (
            <View style={styles.fact}>
              <MapPin color={COLORS.muted} size={18} />
              <Text style={styles.factText}>{event.location}</Text>
            </View>
          ) : null}
        </Card>

        {event.description ? (
          <Card>
            {/* Markdown wordt in fase 3 gerenderd, samen met de CMS-pagina's. Tot
                dan is dit de tekst zoals ze is; dat leest beter dan sterretjes,
                maar het is niet af. */}
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        ) : null}

        {event.ticketSlug ? (
          <Button
            label="Tickets"
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${baseUrl()}/tickets/${event.ticketSlug}`)
            }
          />
        ) : null}
        {event.formSlug ? (
          <Button
            label="Inschrijven"
            variant={event.ticketSlug ? 'ghost' : 'primary'}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${baseUrl()}/formulieren/${event.formSlug}`)
            }
          />
        ) : null}
        {event.url ? (
          <Button
            label="Meer info"
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(event.url as string)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: SPACING.xxl },
  hero: { backgroundColor: COLORS.navy, minHeight: 220, justifyContent: 'flex-end' },
  photo: { ...StyleSheet.absoluteFillObject },
  // De scrim is zwaarst linksonder, waar de tekst staat; zonder dat verdwijnt een
  // titel in een lichte foto.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14, 26, 54, 0.55)' },
  heroText: { padding: SPACING.lg, gap: SPACING.xs },
  group: { ...TYPE.kicker, color: COLORS.yellow },
  title: { ...TYPE.pageTitle, color: COLORS.onDark },
  back: { position: 'absolute', left: SPACING.lg },
  body: { padding: SPACING.lg, gap: SPACING.md },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  factText: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  description: { ...TYPE.body, color: COLORS.body },
});
