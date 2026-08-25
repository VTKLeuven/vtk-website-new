import { Image } from 'expo-image';
import { MapPin, Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { formatDayShort, formatTime } from '../format';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Eén evenement in een lijst.
 *
 * De vorm van de categoriepagina's op de site: een vierkante foto links, de tekst
 * rechts. Geen kaartenraster, om dezelfde reden als daar; en de datum staat als
 * een eigen kolom vooraan, want een lijst waarin je de dagen moet uitlezen uit
 * een zin is geen agenda.
 *
 * Categorie, plaats en tijd staan elk op hun eigen regel of in hun eigen kolom.
 * Ze samenpersen achter middots is precies wat CLAUDE.md verbiedt, en op een
 * telefoonbreedte wordt dat sowieso onleesbaar.
 *
 * **De ster is geen inschrijving.** Ze zet dit evenement in jouw lijst en hangt
 * er de herinnering van die dag aan; er hangt geen plaats aan en niemand ziet wie
 * ze aanduidde. Dat verschil moet zichtbaar blijven, anders staat er iemand voor
 * een uitverkochte zaal met een sterretje in zijn telefoon. Vandaar dat ze een
 * losse knop naast de rij is en niet de hoofdactie ervan.
 */
export function EventRow({
  event,
  locale,
  onPress,
  onToggleInterest,
}: {
  event: AppCalendarEvent;
  locale: AppLocale;
  onPress: () => void;
  /** Weglaten en de ster verdwijnt; zo blijft de rij bruikbaar zonder login. */
  onToggleInterest?: (next: boolean) => void;
}) {
  const category = event.categories[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatDayShort(event.start, locale)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.when}>
        <Text style={styles.day}>{formatDayShort(event.start, locale)}</Text>
        {!event.allDay ? <Text style={styles.time}>{formatTime(event.start, locale)}</Text> : null}
      </View>

      {event.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]} />
      )}

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.group} numberOfLines={1}>
          {event.groupName}
        </Text>
        {event.location ? (
          <View style={styles.locationRow}>
            <MapPin color={COLORS.muted} size={13} />
            <Text style={styles.location} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}
        {category ? (
          <View
            style={[
              styles.chip,
              category.colour ? { borderColor: category.colour } : null,
            ]}
          >
            <Text style={styles.chipText}>{category.name}</Text>
          </View>
        ) : null}
      </View>

      {onToggleInterest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: event.interested }}
          accessibilityLabel={
            event.interested
              ? `${event.title} niet meer volgen`
              : `${event.title} in mijn lijst zetten`
          }
          onPress={() => onToggleInterest(!event.interested)}
          hitSlop={10}
          style={({ pressed }) => [styles.star, pressed && styles.starPressed]}
        >
          <Star
            color={event.interested ? COLORS.yellowDeep : COLORS.muted}
            fill={event.interested ? COLORS.yellow : 'transparent'}
            size={20}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    alignItems: 'center',
  },
  pressed: { backgroundColor: COLORS.paper2 },
  when: { width: 58, gap: 2 },
  day: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  time: { ...TYPE.small, color: COLORS.muted },
  photo: { width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  photoEmpty: { borderWidth: 1, borderColor: COLORS.line },
  text: { flex: 1, gap: 3 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  group: { ...TYPE.small, color: COLORS.muted },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  chipText: { ...TYPE.small, fontSize: 11, color: COLORS.body },
  star: { paddingLeft: SPACING.xs, alignSelf: 'flex-start', paddingTop: 2 },
  starPressed: { opacity: 0.6 },
});
