import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchAlbum } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Empty, ErrorState, Loading } from '../../src/components/ui';
import { formatDate } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, SPACING, TYPE } from '../../src/theme/tokens';

/** Kolommen in het raster. Drie is wat op een telefoon nog herkenbaar blijft. */
const COLUMNS = 3;

/**
 * Eén fotoalbum.
 *
 * Het raster toont thumbnails; tikken opent de schermklare versie. Het origineel
 * komt hier niet aan te pas: dat zijn bestanden van tien megabyte en meer, en op
 * mobiele data zou een album daarmee onbruikbaar zijn. Wie het origineel wil,
 * downloadt het op de site.
 */
export default function AlbumScreen() {
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const insets = useSafeAreaInsets();

  const resource = useResource(`album:${slug}`, () => fetchAlbum(locale, slug), `${locale}:${slug}`);

  if (resource.loading) return <Loading label="Album ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const album = resource.data;
  const gap = 2;
  const size = (width - gap * (COLUMNS - 1)) / COLUMNS;
  const open = openIndex === null ? null : album.photos[openIndex];

  return (
    <>
      <PageHead
        title={album.title}
        subtitle={[
          `${album.photoCount} foto${album.photoCount === 1 ? '' : "'s"}`,
          album.date ? formatDate(album.date, locale) : null,
        ]
          .filter(Boolean)
          .join('   ')}
      />

      <FlatList
        data={album.photos}
        keyExtractor={(photo) => photo.id}
        numColumns={COLUMNS}
        style={styles.root}
        contentContainerStyle={styles.grid}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={`Foto ${index + 1} van ${album.photoCount}`}
            onPress={() => setOpenIndex(index)}
          >
            <Image
              source={{ uri: item.thumbUrl }}
              style={{ width: size, height: size, marginRight: gap, marginBottom: gap }}
              contentFit="cover"
              // Een grijs vlak in plaats van niets terwijl de foto binnenkomt;
              // zonder dat springt het hele raster bij elk beeld.
              transition={150}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Empty title="Leeg album" hint="Er staan nog geen foto's in dit album." />
        }
      />

      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenIndex(null)}
      >
        <View style={styles.viewer}>
          {open ? (
            <Image source={{ uri: open.url }} style={styles.full} contentFit="contain" />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sluiten"
            onPress={() => setOpenIndex(null)}
            hitSlop={14}
            style={[styles.close, { top: insets.top + SPACING.lg }]}
          >
            <X color={COLORS.onDark} size={26} />
          </Pressable>
          {openIndex !== null ? (
            <Text style={[styles.counter, { bottom: insets.bottom + SPACING.xl }]}>
              {openIndex + 1} van {album.photos.length}
            </Text>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  grid: { paddingBottom: SPACING.xxl },
  // De viewer is bewust bijna zwart en niet navy: een foto beoordeel je niet
  // tegen een gekleurde achtergrond.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', right: SPACING.lg },
  counter: { ...TYPE.small, color: COLORS.onDarkMuted, alignSelf: 'center', position: 'absolute' },
});
