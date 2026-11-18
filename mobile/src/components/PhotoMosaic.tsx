import { Image } from 'expo-image';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { AppPhoto } from '../api/contract';
import { COLORS } from '../theme/tokens';

/** De naad tussen twee foto's, zoals een contactblad. */
const GAP = 2;

type ChunkKind = 'bigLeft' | 'row' | 'bigRight';

/**
 * Het ritme: een grote foto links, twee gewone rijen, een grote rechts, twee
 * gewone rijen. Eén op negen foto's is groot. Vaker en het raster wordt een
 * collage waarin je niets terugvindt; nooit en het blijft een spreadsheet.
 */
const PATTERN: ChunkKind[] = ['bigLeft', 'row', 'row', 'bigRight', 'row', 'row'];

type Chunk = { kind: ChunkKind; start: number; photos: AppPhoto[] };

/**
 * Het raster van een album: drie kolommen met om de drie rijen een foto van
 * twee op twee, afwisselend links en rechts.
 *
 * Elke groep is drie foto's, zodat de volgorde van links naar rechts en van
 * boven naar onder gewoon de volgorde van het album blijft: de viewer bladert
 * in dezelfde volgorde als je ze ziet staan.
 *
 * **Een grote tegel laadt de schermklare versie (`url`), de rest de thumbnail.**
 * Die thumbnail is 250 px en wordt over twee kolommen wazig. Dat kost één
 * grotere foto op negen, en niet het origineel, dat pas bij bewaren komt.
 */
export function PhotoMosaic({
  photos,
  width,
  onOpen,
  empty,
}: {
  photos: AppPhoto[];
  /** De breedte van het scherm; het raster loopt van rand tot rand. */
  width: number;
  onOpen: (index: number) => void;
  empty?: React.ReactElement;
}) {
  const cell = (width - GAP * 2) / 3;
  const big = cell * 2 + GAP;

  const chunks = useMemo(() => {
    const result: Chunk[] = [];
    for (let start = 0, step = 0; start < photos.length; start += 3, step += 1) {
      const slice = photos.slice(start, start + 3);
      const kind = PATTERN[step % PATTERN.length];
      // Een grote tegel heeft drie foto's nodig; de staart wordt een gewone rij.
      result.push({ kind: slice.length === 3 ? kind : 'row', start, photos: slice });
    }
    return result;
  }, [photos]);

  const tile = (photo: AppPhoto, index: number, size: number, large = false) => (
    <Pressable
      key={photo.id}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Foto ${index + 1} van ${photos.length}`}
      onPress={() => onOpen(index)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Image
        source={{ uri: large ? photo.url : photo.thumbUrl }}
        style={{ width: size, height: size, backgroundColor: COLORS.paper2 }}
        contentFit="cover"
        // Een lichtblauw vlak terwijl de foto binnenkomt; zonder dat springt
        // het hele raster bij elk beeld.
        transition={150}
        recyclingKey={photo.id}
      />
    </Pressable>
  );

  return (
    <FlatList
      data={chunks}
      keyExtractor={(chunk) => chunk.photos[0].id}
      style={styles.root}
      contentContainerStyle={styles.content}
      initialNumToRender={4}
      maxToRenderPerBatch={6}
      windowSize={7}
      removeClippedSubviews
      ListEmptyComponent={empty}
      renderItem={({ item: chunk }) => {
        const [a, b, c] = chunk.photos;
        if (chunk.kind === 'bigLeft') {
          return (
            <View style={styles.row}>
              {tile(a, chunk.start, big, true)}
              <View style={styles.column}>
                {tile(b, chunk.start + 1, cell)}
                {tile(c, chunk.start + 2, cell)}
              </View>
            </View>
          );
        }
        if (chunk.kind === 'bigRight') {
          return (
            <View style={styles.row}>
              <View style={styles.column}>
                {tile(a, chunk.start, cell)}
                {tile(b, chunk.start + 1, cell)}
              </View>
              {tile(c, chunk.start + 2, big, true)}
            </View>
          );
        }
        return (
          <View style={styles.row}>
            {chunk.photos.map((photo, offset) => tile(photo, chunk.start + offset, cell))}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: 32 },
  row: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  column: { gap: GAP },
  pressed: { opacity: 0.8 },
});
