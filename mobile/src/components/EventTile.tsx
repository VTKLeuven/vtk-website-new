import { Image } from 'expo-image';
import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { formatTime } from '../format';
import { displayStart, momentsSummary } from '../moments';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { DatePin } from './DatePin';

/**
 * Eén evenement als de tegel van de site (`apps/web/app/design/vtk-eventcard.css`),
 * gedeeld door de kalender en de band op Home:
 *
 * - de affiche bovenaan, met de gele datumpin die over de onderrand hangt;
 * - het thema als stip met een woord, nooit als pil over de foto (een affiche
 *   draagt daar vaak haar eigen titel); de doelgroep wel als gevulde pil;
 * - de titel met de gele lijn eronder, zo breed als de titel;
 * - één voetregel met het uur, de plaats, de teller en de ster.
 *
 * `compact` is voor een lijst: een lagere affiche, zodat er meer onder elkaar
 * past. Op de site is de affiche 16:9 in een raster van drie; op een telefoon
 * vult één tegel de breedte en zou 16:9 er een halve schermhoogte van maken.
 *
 * **De ster is geen inschrijving.** Ze zet het evenement in je eigen lijst met
 * een herinnering de dag ervoor; daarom is ze een kleine knop in de voetregel en
 * niet de hoofdactie van de tegel.
 */
export function EventTile({
  event,
  locale,
  onPress,
  onToggleInterest,
  at,
  width,
  compact = false,
}: {
  event: AppCalendarEvent;
  locale: AppLocale;
  onPress: () => void;
  /** Weglaten en de ster verdwijnt; zo blijft de tegel bruikbaar zonder login. */
  onToggleInterest?: (next: boolean) => void;
  /** Het moment waarop deze tegel staat; standaard het eerstvolgende. */
  at?: string;
  /** Een vaste breedte, voor een carrousel. Zonder: de volle breedte. */
  width?: number;
  compact?: boolean;
}) {
  const start = at ?? displayStart(event);
  const category = event.categories.find((item) => !item.audience) ?? event.categories[0];
  const audience = event.categories.find((item) => item.audience);
  const series = momentsSummary(event, locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, width ? { width } : null, pressed && styles.pressed]}
    >
      <View style={[styles.shot, { aspectRatio: compact ? 2.3 : 16 / 9 }]}>
        {event.imageUrl ? (
          <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
        ) : null}
        <View style={styles.pin}>
          <DatePin iso={start} locale={locale} shadow />
        </View>
      </View>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.tags}>
          {category && category !== audience ? (
            <View style={styles.cat}>
              <View style={[styles.dot, { backgroundColor: category.colour ?? COLORS.navy }]} />
              <Text style={styles.catText} numberOfLines={1}>
                {category.name}
              </Text>
            </View>
          ) : null}
          {audience ? (
            <View style={[styles.aud, { backgroundColor: audience.colour ?? COLORS.navy }]}>
              <Text style={styles.audText}>{audience.name}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
        </View>
        {series ? <Text style={styles.series}>{series}</Text> : null}

        <View style={styles.foot}>
          {!event.allDay ? <Text style={styles.footText}>{formatTime(start, locale)}</Text> : null}
          <Text style={[styles.footText, styles.place]} numberOfLines={1}>
            {event.location ?? event.groupName}
          </Text>
          {event.interestedCount ? (
            <Text style={styles.footText}>
              {locale === 'en' ? `${event.interestedCount} going` : `${event.interestedCount} komen`}
            </Text>
          ) : null}
          {onToggleInterest ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: event.interested }}
              accessibilityLabel={
                event.interested ? `${event.title} niet meer volgen` : `${event.title} in mijn lijst zetten`
              }
              onPress={() => onToggleInterest(!event.interested)}
              hitSlop={12}
            >
              <Star
                color={event.interested ? COLORS.yellowDeep : COLORS.muted}
                fill={event.interested ? COLORS.yellow : 'transparent'}
                size={19}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  pressed: { borderColor: COLORS.line2, opacity: 0.92 },
  shot: { backgroundColor: COLORS.paper2 },
  photo: { ...StyleSheet.absoluteFill },
  // Hangt aan de foto en steekt er onderuit, zoals op de site.
  pin: { position: 'absolute', right: SPACING.lg, bottom: -24, zIndex: 1 },
  body: { paddingHorizontal: SPACING.lg, paddingTop: 10, paddingBottom: 12, gap: 4 },
  bodyCompact: { paddingTop: 8, paddingBottom: 10 },
  // De ruimte rechts is voor de pin, die tot in deze regel hangt.
  tags: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 20, paddingRight: 70 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  catText: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.muted },
  aud: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  audText: { fontFamily: FONTS.semibold, fontSize: 10.5, color: '#FFFFFF' },
  titleWrap: {
    alignSelf: 'flex-start',
    paddingBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  title: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, color: COLORS.ink },
  series: { ...TYPE.small, color: COLORS.body },
  foot: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: 4 },
  footText: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  place: { flex: 1 },
});
