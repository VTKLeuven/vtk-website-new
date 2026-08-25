import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, Play } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchMedia } from '../../../src/api/endpoints';
import { messageFor, useResource } from '../../../src/api/useResource';
import { PageHead } from '../../../src/components/PageHead';
import { Card, Empty, ErrorState, Loading, SectionTitle, StaleNotice } from '../../../src/components/ui';
import { formatDate } from '../../../src/format';
import { useApp } from '../../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../src/theme/tokens';

/**
 * Media: fotoalbums, aftermovies en de magazines.
 *
 * De albums staan als raster van twee, want dat is wat je van een fotoalbum wil
 * zien. Aantal foto's en datum staan eronder als gewone regels; het aantal is
 * hier wél nuttig, want het is het verschil tussen een album van tien en een van
 * duizend foto's, en dat bepaalt of je er nu aan begint.
 */
export default function MediaScreen() {
  const router = useRouter();
  const { locale } = useApp();
  const resource = useResource('media', () => fetchMedia(locale), locale);

  if (resource.loading) return <Loading label="Media ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { albums, aftermovies, publications } = resource.data;

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

        <SectionTitle>Fotoalbums</SectionTitle>
        {albums.length === 0 ? (
          <Empty
            title="Geen albums"
            hint="Er staan nu geen albums online. Ze komen uit Immich en verschijnen hier zodra ze publiek gezet zijn."
          />
        ) : (
          <View style={styles.grid}>
            {albums.map((album) => (
              <Pressable
                key={album.slug}
                accessibilityRole="button"
                accessibilityLabel={album.title}
                onPress={() => router.push(`/album/${album.slug}`)}
                style={({ pressed }) => [styles.album, pressed && styles.pressed]}
              >
                {album.coverUrl ? (
                  <Image source={{ uri: album.coverUrl }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverEmpty]} />
                )}
                <Text style={styles.albumTitle} numberOfLines={2}>
                  {album.title}
                </Text>
                <Text style={styles.hint}>
                  {album.photoCount} foto{album.photoCount === 1 ? '' : "'s"}
                </Text>
                {album.date ? (
                  <Text style={styles.hint}>{formatDate(album.date, locale)}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  album: { width: '47%', gap: 2 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  coverEmpty: { borderWidth: 1, borderColor: COLORS.line },
  albumTitle: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink, marginTop: SPACING.xs },
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
