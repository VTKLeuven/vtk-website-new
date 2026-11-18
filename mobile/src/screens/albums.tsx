import { Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import type { AppAlbum } from '../api/contract';
import { fetchMedia } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlbumFeature, AlbumTile } from '../components/AlbumCard';
import { PageHead } from '../components/PageHead';
import { SearchField } from '../components/SearchField';
import { Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { COLORS, DARK_GLASS, FONTS, SPACING, TYPE } from '../theme/tokens';

/** Een rij in de lijst: het album dat een jaar opent, of twee naast elkaar. */
type Row = { kind: 'feature'; album: AppAlbum } | { kind: 'pair'; albums: AppAlbum[] };

const ALL = 'alle';

/**
 * Alle fotoalbums.
 *
 * Sinds het archief van de oude site erin zit zijn het er meer dan tweehonderd.
 * Per jaar een groot jaartal met de gele lijn, het eerste album van dat jaar
 * breed als evenementtegel en de rest in twee kolommen. De jaren staan als
 * pillen in de kop, zoeken achter het vergrootglas ernaast: zo staat er tussen
 * de kop en de covers niets meer.
 *
 * **Waarom een `SectionList` en geen `ScrollView`.** Die laatste monteert elke
 * tegel; bij tweehonderd covers zijn dat tweehonderd `expo-image`-instanties bij
 * het openen. Een `SectionList` tekent enkel wat in beeld komt.
 *
 * Filteren gebeurt hier en niet op de server: de lijst zit al volledig in het
 * antwoord van `/media`, en met dezelfde cachesleutel als het mediascherm staat
 * ze er meteen zonder een tweede verzoek.
 */
export default function AlbumsScreen() {
  const { locale } = useApp();
  const resource = useResource('media', () => fetchMedia(locale), locale);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [year, setYear] = useState<string>(ALL);

  const albums = useMemo(() => resource.data?.albums ?? [], [resource.data]);

  /** De jaartallen die echt voorkomen, nieuwste eerst. */
  const years = useMemo(() => {
    const seen = new Set<string>();
    for (const album of albums) {
      const label = yearOf(album);
      if (label) seen.add(label);
    }
    return [...seen].sort((left, right) => Number(right) - Number(left));
  }, [albums]);

  const term = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const matching = albums.filter((album) => {
      if (year !== ALL && yearOf(album) !== year) return false;
      if (!term) return true;
      return album.title.toLowerCase().includes(term);
    });

    // De albums komen al aflopend op datum binnen, dus de groepen ontstaan in de
    // juiste volgorde en hoeven niet opnieuw gesorteerd te worden.
    const groups: { title: string; data: Row[] }[] = [];
    for (const album of matching) {
      const label = yearOf(album) ?? 'Zonder datum';
      let group = groups[groups.length - 1];
      if (!group || group.title !== label) {
        group = { title: label, data: [] };
        groups.push(group);
        // Wie zoekt, wil treffers vergelijken; dan geen grote tegel bovenaan.
        if (!term) {
          group.data.push({ kind: 'feature', album });
          continue;
        }
      }
      const row = group.data[group.data.length - 1];
      if (row?.kind === 'pair' && row.albums.length < 2) row.albums.push(album);
      else group.data.push({ kind: 'pair', albums: [album] });
    }
    return groups;
  }, [albums, term, year]);

  if (resource.loading) return <Loading label="Albums ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const found = sections.reduce(
    (sum, group) =>
      sum + group.data.reduce((rows, row) => rows + (row.kind === 'feature' ? 1 : row.albums.length), 0),
    0,
  );

  const toggleSearch = () => {
    if (searching) setQuery('');
    setSearching(!searching);
  };

  return (
    <>
      <PageHead
        title="Albums"
        backLabel="Media"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searching ? 'Zoeken sluiten' : 'Zoek een album'}
            onPress={toggleSearch}
            hitSlop={8}
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          >
            {searching ? (
              <X color={COLORS.onDark} size={18} />
            ) : (
              <Search color={COLORS.onDark} size={18} />
            )}
          </Pressable>
        }
        tabs={
          years.length > 1
            ? {
                scroll: true,
                value: year,
                onChange: setYear,
                options: [{ value: ALL, label: 'Alle' }, ...years.map((label) => ({ value: label, label }))],
              }
            : undefined
        }
      />

      {searching ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Zoek een album"
          label="Zoek een album op titel"
          autoFocus
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(row) =>
          row.kind === 'feature' ? row.album.slug : row.albums.map((album) => album.slug).join('+')
        }
        style={styles.root}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        // Krap gehouden: tweehonderd covers hoeven niet allemaal in het geheugen
        // te staan om te kunnen scrollen.
        initialNumToRender={5}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
        ListHeaderComponent={
          <>
            {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
            {term ? (
              <Text style={styles.count}>
                {found} van {albums.length} albums
              </Text>
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.rule}>
              <Text style={styles.year}>{section.title}</Text>
            </View>
          </View>
        )}
        renderItem={({ item: row }) =>
          row.kind === 'feature' ? (
            <View style={styles.featureRow}>
              <AlbumFeature album={row.album} />
            </View>
          ) : (
            <View style={styles.row}>
              {row.albums.map((album) => (
                <AlbumTile key={album.slug} album={album} withYear={false} style={styles.cell} />
              ))}
              {/* Een halve rij mag niet uitrekken tot de volle breedte. */}
              {row.albums.length < 2 ? <View style={styles.cell} /> : null}
            </View>
          )
        }
        ListEmptyComponent={
          <Empty
            title="Niets gevonden"
            hint={term || year !== ALL ? 'Probeer een ander woord of een ander jaar.' : undefined}
          />
        }
      />
    </>
  );
}

/** Het jaartal van een album, of `null` wanneer het er geen datum bij heeft. */
function yearOf(album: AppAlbum): string | null {
  if (!album.date) return null;
  const year = new Date(album.date).getUTCFullYear();
  return Number.isFinite(year) ? String(year) : null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  pressed: { opacity: 0.7 },
  // Dark glass, zoals elk bedieningselement op een navy band.
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_GLASS.background,
    borderWidth: 1,
    borderColor: DARK_GLASS.border,
  },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  count: { ...TYPE.small, color: COLORS.muted, marginTop: SPACING.md },
  sectionHeader: {
    backgroundColor: COLORS.paper,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md + 2,
  },
  rule: {
    alignSelf: 'flex-start',
    paddingBottom: 6,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  year: { fontFamily: FONTS.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: COLORS.ink },
  // Ruimte onder de tegel voor de pin die over de foto hangt.
  featureRow: { marginBottom: SPACING.xl },
  row: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl - 4 },
  cell: { flex: 1 },
});
