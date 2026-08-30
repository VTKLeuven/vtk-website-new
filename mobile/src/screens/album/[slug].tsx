import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Check, Download, Share2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { fetchAlbum } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { PageHead } from '../../components/PageHead';
import { PhotoViewer } from '../../components/PhotoViewer';
import { Empty, ErrorState, Loading } from '../../components/ui';
import { formatDate } from '../../format';
import { savePhotoToLibrary, sharePhoto, type SaveOutcome } from '../../savePhoto';
import { useApp } from '../../state/app';
import { COLORS, SPACING } from '../../theme/tokens';

/** Kolommen in het raster. Drie is wat op een telefoon nog herkenbaar blijft. */
const COLUMNS = 3;

/**
 * Eén fotoalbum.
 *
 * Het raster toont thumbnails; tikken opent de viewer, waarin je veegt en knijpt
 * (zie `components/PhotoViewer.tsx`). Het origineel wordt enkel opgehaald wanneer
 * iemand het bewaart of deelt: dat zijn bestanden van tien megabyte en meer, en
 * een album dat die allemaal inlaadt, laadt niet.
 */
export default function AlbumScreen() {
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState<'bewaren' | 'delen' | null>(null);
  // Kort vinkje na het bewaren. Een melding wegklikken voor elke foto die je
  // bewaart, is meer werk dan het bewaren zelf.
  const [justSaved, setJustSaved] = useState(false);

  const resource = useResource(`album:${slug}`, () => fetchAlbum(locale, slug), `${locale}:${slug}`);

  // Blader je door, dan hoort het vinkje bij de vorige foto en niet bij deze.
  const changeIndex = useCallback((next: number) => {
    setOpenIndex(next);
    setJustSaved(false);
  }, []);

  if (resource.loading) return <Loading label="Album ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const album = resource.data;
  const open = openIndex === null ? null : album.photos[openIndex];

  /**
   * Bewaren of delen van de foto die openstaat.
   *
   * De uitkomsten krijgen elk hun eigen melding. "Geweigerd" is bewust geen
   * fout: iemand die geen toegang tot zijn fotobibliotheek wil geven, heeft een
   * keuze gemaakt, en dan wijzen we op de deelknop in plaats van te zeuren.
   */
  const handle = async (kind: 'bewaren' | 'delen') => {
    if (!open || !open.downloadUrl || busy) return;
    setBusy(kind);
    try {
      const outcome: SaveOutcome =
        kind === 'bewaren'
          ? await savePhotoToLibrary(open.downloadUrl, open.filename)
          : await sharePhoto(open.downloadUrl, open.filename);

      if (outcome.status === 'bewaard') {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      } else if (outcome.status === 'geweigerd') {
        Alert.alert(
          'Geen toegang tot je fotos',
          'De app mag niets aan je fotobibliotheek toevoegen. Je kan dat aanzetten in de instellingen van je telefoon, of de foto delen en van daaruit bewaren.',
        );
      } else if (outcome.status === 'mislukt') {
        Alert.alert('Dat lukte niet', outcome.reason);
      }
    } finally {
      setBusy(null);
    }
  };

  const gap = 2;
  const size = (width - gap * (COLUMNS - 1)) / COLUMNS;

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
            onPress={() => changeIndex(index)}
          >
            <Image
              source={{ uri: item.thumbUrl }}
              style={{ width: size, height: size, marginRight: gap, marginBottom: gap }}
              contentFit="cover"
              // Een grijs vlak in plaats van niets terwijl de foto binnenkomt;
              // zonder dat springt het hele raster bij elk beeld.
              transition={150}
              recyclingKey={item.id}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Empty title="Leeg album" hint="Er staan nog geen foto's in dit album." />
        }
      />

      <PhotoViewer
        photos={album.photos}
        index={openIndex}
        onIndexChange={changeIndex}
        onClose={() => setOpenIndex(null)}
        actions={
          /* Een server van vóór deze functie stuurt geen `downloadUrl` mee. Dan
             tonen we de knoppen niet, in plaats van ze te laten falen met een
             melding waar niemand iets aan heeft. De app kan met een oudere site
             praten; dat is het hele punt van de versie in het API-pad. */
          open?.downloadUrl ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deel deze foto"
                accessibilityState={{ busy: busy === 'delen' }}
                disabled={busy !== null}
                onPress={() => void handle('delen')}
                hitSlop={14}
                style={styles.button}
              >
                {busy === 'delen' ? (
                  <ActivityIndicator color={COLORS.onDark} size="small" />
                ) : (
                  <Share2 color={COLORS.onDark} size={22} />
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={justSaved ? 'Bewaard' : 'Bewaar deze foto'}
                accessibilityState={{ busy: busy === 'bewaren' }}
                disabled={busy !== null}
                onPress={() => void handle('bewaren')}
                hitSlop={14}
                style={[styles.button, justSaved && styles.buttonDone]}
              >
                {busy === 'bewaren' ? (
                  <ActivityIndicator color={COLORS.onDark} size="small" />
                ) : justSaved ? (
                  // Het vinkje zit in de knop zelf en niet enkel in een melding:
                  // zo zie je aan de knop dat deze foto binnen is.
                  <Check color={COLORS.ink} size={22} />
                ) : (
                  <Download color={COLORS.onDark} size={22} />
                )}
              </Pressable>
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  grid: { paddingBottom: SPACING.xxl },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  buttonDone: { backgroundColor: COLORS.yellow },
});
