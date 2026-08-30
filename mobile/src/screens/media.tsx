import * as WebBrowser from 'expo-web-browser';
import { BookOpen, ChevronRight, Play } from 'lucide-react-native';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchMedia } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlbumCard } from '../components/AlbumCard';
import { PageHead } from '../components/PageHead';
import { Card, Empty, ErrorState, Loading, SectionTitle, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Hoeveel albums er in de rij "Recent" passen voor je doorklikt. */
const RECENT = 8;

/** Hoe breed één tegel in die rij is. Smal genoeg dat de volgende meekijkt. */
const TILE = 150;

/**
 * Media: fotoalbums, aftermovies en de magazines.
 *
 * **Dit scherm toont niet alle albums meer.** Dat deed het wel, als raster in een
 * `ScrollView`, en dat hield op te werken toen het archief van de oude site erbij
 * kwam: tweehonderd covers die allemaal tegelijk monteren, in een muur zonder
 * ordening waarin niemand een bepaald album terugvindt. Erger nog, Aftermovies en
 * Magazines stonden eronder en waren daarmee in de praktijk onbereikbaar.
 *
 * Nu staat hier een rij met de nieuwste albums en een weg naar de rest; alle drie
 * de secties passen weer op één scherm. Zoeken en filteren gebeurt in
 * `albums.tsx`.
 */
export default function MediaScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const resource = useResource('media', () => fetchMedia(locale), locale);

  if (resource.loading) return <Loading label="Media ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { albums, aftermovies, publications } = resource.data;
  const recent = albums.slice(0, RECENT);

  return (
    <>
      <PageHead title="Media" subtitle="Foto's, aftermovies en magazines" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        <View style={styles.sectionRow}>
          <SectionTitle>Recente albums</SectionTitle>
          {albums.length > recent.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Alle ${albums.length} albums`}
              onPress={() => router.push('/albums')}
              hitSlop={10}
              style={({ pressed }) => [styles.all, pressed && styles.pressed]}
            >
              <Text style={styles.allLabel}>Alle {albums.length}</Text>
              <ChevronRight color={COLORS.muted} size={16} />
            </Pressable>
          ) : null}
        </View>

        {albums.length === 0 ? (
          <Empty
            title="Geen albums"
            hint="Er staan nu geen albums online. Ze komen uit Immich en verschijnen hier zodra ze publiek gezet zijn."
          />
        ) : (
          <FlatList
            data={recent}
            keyExtractor={(album) => album.slug}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            renderItem={({ item }) => <AlbumCard album={item} style={styles.tile} />}
          />
        )}

        {aftermovies.length > 0 ? (
          <>
            <SectionTitle>Aftermovies</SectionTitle>
            <View style={styles.stack}>
              {aftermovies.map((movie) => (
                <Pressable
                  key={movie.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Bekijk ${movie.title}`}
                  onPress={() => void WebBrowser.openBrowserAsync(movie.externalUrl)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Play color={COLORS.navy} size={20} />
                  <Text style={styles.rowLabel}>{movie.title}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {publications.length > 0 ? (
          <>
            <SectionTitle>Magazines</SectionTitle>
            <View style={styles.stack}>
              {publications.map((publication) => (
                <Pressable
                  key={publication.id}
                  accessibilityRole="button"
                  accessibilityLabel={publication.title}
                  disabled={!publication.url}
                  onPress={() => void WebBrowser.openBrowserAsync(publication.url as string)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <BookOpen color={COLORS.navy} size={20} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{publication.title}</Text>
                    <Text style={styles.hint}>
                      {publication.kind === 'bakske' ? "'t Bakske" : 'Ir-Reëel'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {albums.length === 0 && aftermovies.length === 0 && publications.length === 0 ? (
          <Card>
            <Text style={styles.hint}>Er staat momenteel niets in de mediabibliotheek.</Text>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  all: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  allLabel: { ...TYPE.small, color: COLORS.muted },
  // De rij loopt tot buiten de padding van de pagina, zodat de laatste tegel
  // niet halverwege afgesneden lijkt maar duidelijk doorloopt.
  strip: { gap: SPACING.md, paddingRight: SPACING.lg },
  tile: { width: TILE },
  pressed: { opacity: 0.8 },
  stack: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  rowText: { flex: 1 },
  rowLabel: { ...TYPE.cardTitle, color: COLORS.ink, flex: 1 },
  hint: { ...TYPE.small, color: COLORS.muted },
});
