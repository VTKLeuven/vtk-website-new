import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppAlbum } from '../api/contract';
import { fetchMedia } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlbumCard } from '../components/AlbumCard';
import { PageHead } from '../components/PageHead';
import { SearchField } from '../components/SearchField';
import { Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Kolommen in het raster. Twee, want een cover moet herkenbaar blijven. */
const COLUMNS = 2;

/**
 * Alle fotoalbums.
 *
 * Sinds het archief van de oude site erin zit zijn het er meer dan tweehonderd,
 * en dat is te veel om zomaar te tonen. Vandaar drie dingen tegelijk: een
 * zoekveld op titel, een jaarfilter, en koppen per jaar terwijl je scrollt.
 *
 * **Waarom een `SectionList` en geen `ScrollView`.** Het media-scherm was er een,
 * en die monteert elke tegel die erin staat. Bij tweehonderd covers is dat
 * tweehonderd `expo-image`-instanties bij het openen. Een `SectionList` tekent
 * enkel wat in beeld komt.
 *
 * Filteren gebeurt hier en niet op de server: de lijst zit al volledig in het
 * antwoord van `/media`, en met dezelfde cachesleutel als het media-scherm staat
 * ze er meteen zonder een tweede verzoek.
 */
export default function AlbumsScreen() {
  const { locale } = useApp();
  const resource = useResource('media', () => fetchMedia(locale), locale);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState<string | null>(null);

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

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matching = albums.filter((album) => {
      if (year !== null && yearOf(album) !== year) return false;
      if (!term) return true;
      return album.title.toLowerCase().includes(term);
    });

    // De albums komen al aflopend op datum binnen, dus de groepen ontstaan in de
    // juiste volgorde en hoeven niet opnieuw gesorteerd te worden.
    const groups: { title: string; data: AppAlbum[][] }[] = [];
    for (const album of matching) {
      const label = yearOf(album) ?? 'Zonder datum';
      let group = groups[groups.length - 1];
      if (!group || group.title !== label) {
        group = { title: label, data: [] };
        groups.push(group);
      }
      const row = group.data[group.data.length - 1];
      if (row && row.length < COLUMNS) row.push(album);
      else group.data.push([album]);
    }
    return groups;
  }, [albums, query, year]);

  if (resource.loading) return <Loading label="Albums ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const total = sections.reduce((sum, group) => sum + group.data.flat().length, 0);
  const filtered = query.trim().length > 0 || year !== null;

  return (
    <>
      <PageHead
        title="Alle albums"
        subtitle={`${albums.length} album${albums.length === 1 ? '' : 's'}`}
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Zoek een album"
        label="Zoek een album op titel"
      />

      {years.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="Alle" active={year === null} onPress={() => setYear(null)} />
          {years.map((label) => (
            <Chip
              key={label}
              label={label}
              active={year === label}
              onPress={() => setYear(year === label ? null : label)}
            />
          ))}
        </ScrollView>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((album) => album.slug).join('+')}
        style={styles.root}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        // Krap gehouden: tweehonderd covers hoeven niet allemaal in het geheugen
        // te staan om te kunnen scrollen.
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
        ListHeaderComponent={
          <>
            {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
            {filtered ? (
              <Text style={styles.count}>
                {total} van {albums.length} albums
              </Text>
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((album) => (
              <AlbumCard key={album.slug} album={album} style={styles.card} />
            ))}
            {/* Een halve rij mag niet uitrekken tot de volle breedte. */}
            {row.length < COLUMNS ? <View style={styles.card} /> : null}
          </View>
        )}
        ListEmptyComponent={
          <Empty
            title="Niets gevonden"
            hint={
              filtered
                ? 'Geen album met die titel in dat jaar. Probeer een ander woord of zet het jaar op Alle.'
                : 'Er staan nu geen albums online.'
            }
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

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label === 'Alle' ? 'Alle jaren' : `Enkel ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  chips: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  // Geel is het accent van de site en markeert hier wat aanstaat.
  chipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellowDeep },
  chipLabel: { ...TYPE.small, color: COLORS.body },
  chipLabelActive: { color: COLORS.ink },
  pressed: { opacity: 0.8 },
  list: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  count: { ...TYPE.small, color: COLORS.muted, marginBottom: SPACING.sm },
  sectionHeader: { backgroundColor: COLORS.paper, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  sectionTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  row: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  card: { flex: 1 },
});
