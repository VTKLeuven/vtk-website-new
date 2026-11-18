import { Image } from 'expo-image';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { AppAlbum, AppLocale } from '../api/contract';
import { formatShortDate } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { DatePin } from './DatePin';

/** "1 foto", "386 foto's". */
export function photoCount(count: number, locale: AppLocale): string {
  const number = count.toLocaleString(locale === 'en' ? 'en-GB' : 'nl-BE');
  if (locale === 'en') return `${number} photo${count === 1 ? '' : 's'}`;
  return `${number} foto${count === 1 ? '' : "'s"}`;
}

function accessibleName(album: AppAlbum, locale: AppLocale): string {
  return `${album.title}, ${photoCount(album.photoCount, locale)}`;
}

/**
 * Een album als staande tegel: de cover in 4:5, daaronder de titel en één regel
 * met de datum en het aantal foto's.
 *
 * De datum staat er omdat dertig titels meer dan eens voorkomen ("Schuimfuif"
 * drie keer), het aantal omdat het verschil tussen tien en zeventienhonderd foto's
 * bepaalt of je er nu aan begint. Eén regel en niet twee: onder een rij covers
 * leest grijze tekst anders als een tabel.
 */
export function AlbumTile({
  album,
  withYear,
  style,
}: {
  album: AppAlbum;
  /** Het jaar bij de datum; overbodig in de lijst per jaar. */
  withYear: boolean;
  /** De breedte; die verschilt tussen de rij op Media en het raster. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useTabRouter();
  const { locale } = useApp();
  const meta = [
    album.date ? formatShortDate(album.date, locale, withYear) : null,
    photoCount(album.photoCount, locale),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleName(album, locale)}
      onPress={() => router.push(`/album/${album.slug}`)}
      style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]}
    >
      <Cover uri={album.coverUrl} recyclingKey={album.slug} style={styles.tileCover} />
      <Text style={styles.tileTitle} numberOfLines={2}>
        {album.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

/**
 * Het album dat een lijst opent, in de taal van de evenementtegel: een brede
 * foto met de gele datumpin over de onderrand, de titel met de gele lijn eronder.
 * Dezelfde tegel als in de kalender, zodat een album en het evenement waar het
 * bij hoort er als familie uitzien.
 *
 * Hij gebruikt de cover in schermmaat (`coverPreviewUrl`): de thumbnail is 250 px
 * en wordt over de hele breedte van een telefoon wazig. Een oudere server stuurt
 * die niet mee, en dan is wazig beter dan niets.
 */
export function AlbumFeature({ album }: { album: AppAlbum }) {
  const router = useTabRouter();
  const { locale } = useApp();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleName(album, locale)}
      onPress={() => router.push(`/album/${album.slug}`)}
      style={({ pressed }) => [styles.feature, pressed && styles.pressed]}
    >
      <View>
        <Cover
          uri={album.coverPreviewUrl ?? album.coverUrl}
          recyclingKey={album.slug}
          style={styles.featureCover}
        />
        {album.date ? (
          <View style={styles.pin}>
            <DatePin iso={album.date} locale={locale} shadow />
          </View>
        ) : null}
      </View>
      <View style={styles.featureBody}>
        <View style={styles.rule}>
          <Text style={styles.featureTitle} numberOfLines={2}>
            {album.title}
          </Text>
        </View>
        <Text style={styles.meta}>{photoCount(album.photoCount, locale)}</Text>
      </View>
    </Pressable>
  );
}

function Cover({
  uri,
  recyclingKey,
  style,
}: {
  uri: string | null;
  recyclingKey: string;
  style: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={uri ? { uri } : null}
      // Geen foto: het lichtblauwe vlak van de site, met een rand zodat het
      // niet wegvalt tegen het papier.
      style={[style, uri ? styles.coverBase : styles.coverEmpty]}
      contentFit="cover"
      transition={200}
      // Zonder dit hergebruikt een lijst een view met de vorige cover er nog in
      // terwijl de nieuwe binnenkomt; bij tweehonderd albums zie je dat.
      recyclingKey={recyclingKey}
    />
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  coverBase: { backgroundColor: COLORS.paper2 },
  coverEmpty: { backgroundColor: COLORS.paper2, borderWidth: 1, borderColor: COLORS.line },

  tile: { gap: 2 },
  tileCover: { width: '100%', aspectRatio: 4 / 5, borderRadius: 14 },
  tileTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: COLORS.ink,
    marginTop: SPACING.sm,
  },
  meta: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 16, color: COLORS.muted },

  feature: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  featureCover: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderTopLeftRadius: RADIUS.md - 1,
    borderTopRightRadius: RADIUS.md - 1,
  },
  // Hangt over de onderrand van de foto, zoals `.ev-card-pin` op de site.
  pin: { position: 'absolute', right: SPACING.md, bottom: -22 },
  featureBody: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md + 2,
    // Ruimte rechts voor de pin, zodat een lange titel er niet onder loopt.
    paddingRight: 54 + SPACING.lg,
    gap: 6,
  },
  rule: {
    alignSelf: 'flex-start',
    paddingBottom: 6,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  featureTitle: { ...TYPE.cardTitle, fontSize: 18, lineHeight: 22, color: COLORS.ink },
});
