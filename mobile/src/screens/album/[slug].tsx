import { useLocalSearchParams } from 'expo-router';
import { Check, Download, Share2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { fetchAlbum } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { photoCount } from '../../components/AlbumCard';
import { PageHead } from '../../components/PageHead';
import { PhotoMosaic } from '../../components/PhotoMosaic';
import { PhotoViewer } from '../../components/PhotoViewer';
import { Empty, ErrorState, Loading } from '../../components/ui';
import { formatLongDate } from '../../format';
import { savePhotoToLibrary, sharePhoto, type SaveOutcome } from '../../savePhoto';
import { useApp } from '../../state/app';
import { COLORS, SPACING } from '../../theme/tokens';

/**
 * Eén fotoalbum.
 *
 * Het raster is een mozaïek (`components/PhotoMosaic.tsx`); tikken opent de
 * viewer, waarin je veegt en knijpt (zie `components/PhotoViewer.tsx`). Het
 * origineel wordt enkel opgehaald wanneer iemand het bewaart of deelt: dat zijn
 * bestanden van tien megabyte en meer, en een album dat die allemaal inlaadt,
 * laadt niet.
 *
 * **Een album met delen krijgt tabs in de kop**, zoals op de site
 * (`AlbumTabViewer`): vanaf twee delen, elk met zijn aantal foto's. De viewer
 * bladert dan binnen het deel dat openstaat. Een server die geen `subAlbums`
 * stuurt, of één deel, toont gewoon alle foto's.
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
  const [part, setPart] = useState<string | null>(null);

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
  const parts = album.subAlbums && album.subAlbums.length > 1 ? album.subAlbums : null;
  const activePart = parts ? (parts.find((sub) => sub.id === part) ?? parts[0]) : null;
  const photos = activePart ? activePart.photos : album.photos;
  const open = openIndex === null ? null : photos[openIndex];

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

  return (
    <>
      <PageHead
        title={album.title}
        subtitle={[
          photoCount(album.photoCount, locale),
          album.date ? formatLongDate(album.date, locale) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        tabs={
          parts && activePart
            ? {
                scroll: true,
                value: activePart.id,
                onChange: (next) => {
                  setPart(next);
                  setOpenIndex(null);
                },
                options: parts.map((sub) => ({ value: sub.id, label: sub.title, count: sub.photoCount })),
              }
            : undefined
        }
      />

      <PhotoMosaic
        // Een ander deel begint bovenaan, niet halverwege het vorige.
        key={activePart?.id ?? 'alles'}
        photos={photos}
        width={width}
        onOpen={changeIndex}
        empty={<Empty title="Leeg album" hint="Er staan nog geen foto's in dit album." />}
      />

      <PhotoViewer
        photos={photos}
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
