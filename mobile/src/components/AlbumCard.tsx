import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AppAlbum } from '../api/contract';
import { formatDate } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Eén album als tegel: de cover vierkant, daaronder de titel, het aantal foto's
 * en de datum.
 *
 * Het aantal staat er bewust bij. Het is het verschil tussen een album van tien
 * foto's en een van zeventienhonderd, en dat bepaalt of je er nu aan begint.
 *
 * De datum staat er sinds het archief van de oude site erin zit: dertig titels
 * komen meer dan eens voor ("Schuimfuif" drie keer, "24 Urenloop" drie keer), dus
 * zonder jaartal zijn twee tegels niet uit elkaar te houden.
 */
export function AlbumCard({
  album,
  style,
}: {
  album: AppAlbum;
  /** De breedte; die verschilt tussen het raster en de rij op /media. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useTabRouter();
  const { locale } = useApp();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${album.photoCount} foto${album.photoCount === 1 ? '' : "'s"}`}
      onPress={() => router.push(`/album/${album.slug}`)}
      style={({ pressed }) => [styles.album, style, pressed && styles.pressed]}
    >
      {album.coverUrl ? (
        <Image
          source={{ uri: album.coverUrl }}
          style={styles.cover}
          contentFit="cover"
          transition={150}
          // Zonder dit hergebruikt de lijst een view met de vorige foto er nog
          // in terwijl de nieuwe binnenkomt; bij 221 covers zie je dat.
          recyclingKey={album.slug}
        />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]} />
      )}
      <Text style={styles.title} numberOfLines={2}>
        {album.title}
      </Text>
      <Text style={styles.hint}>
        {album.photoCount} foto{album.photoCount === 1 ? '' : "'s"}
      </Text>
      {album.date ? <Text style={styles.hint}>{formatDate(album.date, locale)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  album: { gap: 2 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  coverEmpty: { borderWidth: 1, borderColor: COLORS.line },
  title: {
    ...TYPE.body,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.ink,
    marginTop: SPACING.xs,
  },
  pressed: { opacity: 0.8 },
  hint: { ...TYPE.small, color: COLORS.muted },
});
