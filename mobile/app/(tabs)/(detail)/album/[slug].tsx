import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Check, Download, Share2, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchAlbum } from '../../../../src/api/endpoints';
import { messageFor, useResource } from '../../../../src/api/useResource';
import { PageHead } from '../../../../src/components/PageHead';
import { Empty, ErrorState, Loading } from '../../../../src/components/ui';
import { formatDate } from '../../../../src/format';
import { savePhotoToLibrary, sharePhoto, type SaveOutcome } from '../../../../src/savePhoto';
import { useApp } from '../../../../src/state/app';
import { COLORS, SPACING, TYPE } from '../../../../src/theme/tokens';

/** Kolommen in het raster. Drie is wat op een telefoon nog herkenbaar blijft. */
const COLUMNS = 3;

/**
 * Eén fotoalbum.
 *
 * Het raster toont thumbnails; tikken opent de schermklare versie. Het origineel
 * wordt enkel opgehaald wanneer iemand het bewaart of deelt: dat zijn bestanden
 * van tien megabyte en meer, en een album dat die allemaal inlaadt, laadt niet.
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
  const insets = useSafeAreaInsets();

  const resource = useResource(`album:${slug}`, () => fetchAlbum(locale, slug), `${locale}:${slug}`);

  if (resource.loading) return <Loading label="Album ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const album = resource.data;

  /**
   * Bewaren of delen van de foto die openstaat.
   *
   * De uitkomsten krijgen elk hun eigen melding. "Geweigerd" is bewust geen
   * fout: iemand die geen toegang tot zijn fotobibliotheek wil geven, heeft een
   * keuze gemaakt, en dan wijzen we op de deelknop in plaats van te zeuren.
   */
  const handle = async (kind: 'bewaren' | 'delen') => {
    if (open === null || busy) return;
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
          <View style={[styles.viewerBar, { top: insets.top + SPACING.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sluiten"
              onPress={() => setOpenIndex(null)}
              hitSlop={14}
              style={styles.viewerButton}
            >
              <X color={COLORS.onDark} size={24} />
            </Pressable>

            <View style={styles.viewerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deel deze foto"
                accessibilityState={{ busy: busy === 'delen' }}
                disabled={busy !== null}
                onPress={() => void handle('delen')}
                hitSlop={14}
                style={styles.viewerButton}
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
                style={[styles.viewerButton, justSaved && styles.viewerButtonDone]}
              >
                {busy === 'bewaren' ? (
                  <ActivityIndicator color={COLORS.onDark} size="small" />
                ) : justSaved ? (
                  // Het vinkje zit in de knop zelf en niet enkel in een melding:
                  // zo zie je aan de knop dat deze foto al binnen is.
                  <Check color={COLORS.ink} size={22} />
                ) : (
                  <Download color={COLORS.onDark} size={22} />
                )}
              </Pressable>
            </View>
          </View>
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
  viewerBar: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerActions: { flexDirection: 'row', gap: SPACING.sm },
  viewerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Een lichte vulling, zodat de icoontjes ook op een lichte foto leesbaar zijn.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewerButtonDone: { backgroundColor: COLORS.yellow },
  counter: { ...TYPE.small, color: COLORS.onDarkMuted, alignSelf: 'center', position: 'absolute' },
});
