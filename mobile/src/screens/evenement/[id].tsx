import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, CalendarDays, CalendarPlus, MapPin, Star, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { baseUrl } from '../../api/client';
import { fetchCalendarEvent, setEventInterest } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { Prose } from '../../components/Prose';
import { Button, Card, ErrorState, Loading } from '../../components/ui';
import { addEventToDeviceCalendar, addResultMessage } from '../../deviceCalendar';
import { formatEventWhen } from '../../format';
import { markdownToPlainText } from '../../markdown';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

/**
 * Eén evenement.
 *
 * De foto onder een navy scrim is de enige donkere kaartvulling die de huisstijl
 * toelaat, en ze doet hier het werk van de paginakop: er staat al een beeld, dus
 * er hoeft geen tweede donkere band boven.
 *
 * Tickets openen het native verkoopscherm. Inschrijven gaat nog naar de site: een
 * formulier met eigen validatie is fase 4 werk, en een knop naar de echte pagina
 * is tot dan eerlijker dan geen knop.
 *
 * Twee knoppen die enkel een app kan hebben, en dus precies de reden dat dit
 * scherm bestaat naast de website:
 *
 * - **De ster** zet dit in je eigen lijst en levert de herinnering een dag
 *   vooraf. Het is geen inschrijving; de tekst eronder zegt dat ook, want een
 *   sterretje dat aanvoelt als een plaats reserveren is een misverstand met
 *   gevolgen.
 * - **In agenda** schrijft de afspraak in de agenda van je telefoon, met plaats
 *   en een herinnering. Dat is iets anders dan de ICS-feed op de site: die
 *   abonneert je op álles, dit is dit ene ding.
 */
export default function EventScreen() {
  const router = useTabRouter();
  const insets = useSafeAreaInsets();
  const { locale, viewer } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [addingToCalendar, setAddingToCalendar] = useState(false);

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

  const toggleInterest = () => {
    void setEventInterest(event.id, !event.interested)
      .catch(() => undefined)
      .then(() => resource.refresh());
  };

  const addToCalendar = async () => {
    setAddingToCalendar(true);
    try {
      const result = await addEventToDeviceCalendar({
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        location: event.location,
        notes: event.description ? markdownToPlainText(event.description).slice(0, 600) : null,
      });
      if (result.ok) {
        Alert.alert('In je agenda gezet', `De afspraak staat in ${result.calendarTitle}.`);
      } else {
        Alert.alert('Niet gelukt', addResultMessage(result));
      }
    } finally {
      setAddingToCalendar(false);
    }
  };

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

        <View style={styles.actions}>
          {viewer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: event.interested }}
              accessibilityLabel={
                event.interested ? 'Uit mijn lijst halen' : 'In mijn lijst zetten'
              }
              onPress={toggleInterest}
              style={({ pressed }) => [
                styles.action,
                event.interested && styles.actionActive,
                pressed && styles.actionPressed,
              ]}
            >
              <Star
                color={event.interested ? COLORS.ink : COLORS.navy}
                fill={event.interested ? COLORS.ink : 'transparent'}
                size={18}
              />
              <Text style={styles.actionLabel}>
                {event.interested ? 'In mijn lijst' : 'Ik ga misschien'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="In de agenda van mijn telefoon zetten"
            disabled={addingToCalendar}
            onPress={() => void addToCalendar()}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <CalendarPlus color={COLORS.navy} size={18} />
            <Text style={styles.actionLabel}>In agenda</Text>
          </Pressable>
        </View>

        {viewer && event.interested ? (
          <Text style={styles.note}>
            Je krijgt een dag vooraf een bericht. Dit is geen inschrijving en geen ticket.
          </Text>
        ) : null}

        {event.interestedCount > 0 ? (
          <View style={styles.interestRow}>
            <Users color={COLORS.muted} size={15} />
            <Text style={styles.note}>
              {event.interestedCount === 1
                ? 'Eén lid duidde dit aan'
                : `${event.interestedCount} leden duidden dit aan`}
            </Text>
          </View>
        ) : null}

        {event.description ? (
          <Card>
            <Prose>{event.description}</Prose>
          </Card>
        ) : null}

        {event.ticketSlug ? (
          <Button label="Tickets" onPress={() => router.push(`/ticket/${event.ticketSlug}`)} />
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

  actions: { flexDirection: 'row', gap: SPACING.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 46,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  actionActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  actionPressed: { opacity: 0.75 },
  actionLabel: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  interestRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  note: { ...TYPE.small, color: COLORS.muted },
});
