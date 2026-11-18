import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, Play } from 'lucide-react-native';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { AppAftermovie, AppPublication } from '../api/contract';
import { fetchMedia } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlbumFeature, AlbumTile } from '../components/AlbumCard';
import { PageHead } from '../components/PageHead';
import { PatternBand } from '../components/PatternBand';
import { Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Hoeveel albums er na het grote in de rij staan voor je doorklikt naar alle. */
const RECENT = 8;

/** De breedte van een staande albumtegel; smal genoeg dat de volgende meekijkt. */
const TILE = 132;

const KIND_LABEL: Record<AppPublication['kind'], string> = {
  bakske: "'t Bakske",
  'ir-reeel': 'Ir.Reëel',
};

/** In deze volgorde op de plank, zoals op /media. */
const KINDS: AppPublication['kind'][] = ['bakske', 'ir-reeel'];

/**
 * Media: fotoalbums, aftermovies en de magazines, in de drie banden van /media.
 *
 * - **Foto's** op papier: het nieuwste album groot, als evenementtegel met de gele
 *   datumpin, daarna een rij staande covers en een weg naar alle albums. Dit
 *   scherm toont bewust niet het hele archief: tweehonderd covers in een
 *   `ScrollView` monteren allemaal tegelijk, en dan raken de aftermovies en de
 *   magazines eronder in de praktijk onbereikbaar. Zoeken en filteren gebeurt
 *   in `albums.tsx`.
 * - **Aftermovies** op een navy band met het technische patroon, zoals op de
 *   site: posters in 16:9 met een gele afspeelknop.
 * - **Magazines** op lichtblauw, als een plank: het laatste nummer van elk blad
 *   met zijn kaft, de oudere nummers als kleine kaften in een rij. Een lijst met
 *   elk nummer onder elkaar groeit elke week en zegt niets over wat erin staat.
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
  const [newest, ...rest] = albums;
  const recent = rest.slice(0, RECENT);
  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageHead title="Media" />
      <ScrollView
        style={styles.root}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? (
          <View style={styles.stale}>
            <StaleNotice onRetry={() => void resource.refresh()} />
          </View>
        ) : null}

        <View style={styles.photos}>
          <SectionHeading
            right={
              albums.length > recent.length + 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Alle ${albums.length} albums`}
                  onPress={() => router.push('/albums')}
                  hitSlop={10}
                  style={({ pressed }) => [styles.all, pressed && styles.pressed]}
                >
                  <Text style={styles.allLabel}>Alle {albums.length}</Text>
                  <ChevronRight color={COLORS.navy} size={16} />
                </Pressable>
              ) : undefined
            }
          >
            {"Foto's"}
          </SectionHeading>

          {newest ? (
            <>
              <AlbumFeature album={newest} />
              {recent.length > 0 ? (
                <FlatList
                  data={recent}
                  keyExtractor={(album) => album.slug}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.strip}
                  renderItem={({ item }) => (
                    <AlbumTile
                      album={item}
                      withYear={!item.date || new Date(item.date).getFullYear() !== thisYear}
                      style={styles.tile}
                    />
                  )}
                />
              ) : null}
            </>
          ) : (
            <Empty title="Geen albums" hint="Albums verschijnen hier zodra ze publiek staan." />
          )}
        </View>

        {aftermovies.length > 0 ? <Aftermovies movies={aftermovies} /> : null}
        {publications.length > 0 ? <Magazines publications={publications} /> : null}
      </ScrollView>
    </>
  );
}

/** Op de site hangt hier `.vtk-media-video-section`: navy, met het patroon. */
function Aftermovies({ movies }: { movies: AppAftermovie[] }) {
  const { width } = useWindowDimensions();
  // Breed, maar met de volgende poster nog net in beeld.
  const posterWidth = Math.min(320, width - SPACING.lg * 2 - 40);

  return (
    <View style={styles.band}>
      <PatternBand offset={[-180, -320]} />
      <View style={styles.bandHead}>
        <View style={styles.ruleDark}>
          <Text style={styles.bandTitle}>Aftermovies</Text>
        </View>
      </View>
      <FlatList
        data={movies}
        keyExtractor={(movie) => movie.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={posterWidth + SPACING.md}
        decelerationRate="fast"
        contentContainerStyle={styles.strip}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Speel ${item.title}`}
            onPress={() => void WebBrowser.openBrowserAsync(item.externalUrl)}
            style={({ pressed }) => [{ width: posterWidth }, styles.movie, pressed && styles.pressed]}
          >
            <View style={styles.poster}>
              {item.posterUrl ? (
                <Image
                  source={{ uri: item.posterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
              <View style={styles.play}>
                <Play color={COLORS.ink} fill={COLORS.ink} size={22} style={styles.playIcon} />
              </View>
            </View>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

/** De plank van `MagazineShelf` op de site: het laatste nummer van elk blad vooraan. */
function Magazines({ publications }: { publications: AppPublication[] }) {
  // De server stuurt nieuwste eerst; het eerste van elk blad is dus het laatste nummer.
  const latest = KINDS.map((kind) => publications.find((item) => item.kind === kind)).filter(
    (item): item is AppPublication => Boolean(item),
  );
  const older = publications.filter((item) => !latest.includes(item));

  return (
    <View style={styles.shelf}>
      <SectionHeading>Magazines</SectionHeading>

      <View style={styles.latest}>
        {latest.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            disabled={!item.url}
            onPress={() => void WebBrowser.openBrowserAsync(item.url as string)}
            style={({ pressed }) => [styles.issue, pressed && styles.pressed]}
          >
            <Text style={styles.kicker}>{KIND_LABEL[item.kind].toUpperCase()}</Text>
            <MagazineCover publication={item} style={styles.coverLarge} />
            <Text style={styles.issueTitle} numberOfLines={2}>
              {item.issue ?? item.title}
            </Text>
          </Pressable>
        ))}
      </View>

      {older.length > 0 ? (
        <View style={styles.archive}>
          <Text style={styles.kicker}>EERDERE NUMMERS</Text>
          <FlatList
            data={older}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.strip}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                disabled={!item.url}
                onPress={() => void WebBrowser.openBrowserAsync(item.url as string)}
                style={({ pressed }) => [styles.small, pressed && styles.pressed]}
              >
                <MagazineCover publication={item} style={styles.coverSmall} compact />
                <Text style={styles.smallLabel} numberOfLines={2}>
                  {item.issue ?? item.title}
                </Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * De kaft: bladzijde 1, waarvan we de bovenkant tonen, zoals de site in het
 * nieuws doet. Een nummer van voor de kaften krijgt een blanco blad met de naam,
 * zodat de plank geen gat heeft.
 */
function MagazineCover({
  publication,
  style,
  compact = false,
}: {
  publication: AppPublication;
  style: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.paper, style]}>
      {publication.coverUrl ? (
        <Image
          source={{ uri: publication.coverUrl }}
          style={styles.coverImage}
          contentFit="cover"
          contentPosition="top"
          transition={200}
          recyclingKey={publication.id}
        />
      ) : (
        <View style={[styles.blank, compact && styles.blankCompact]}>
          <Text style={[styles.blankName, compact && styles.blankNameCompact]} numberOfLines={2}>
            {KIND_LABEL[publication.kind]}
          </Text>
          <View style={[styles.blankRule, compact && styles.blankRuleCompact]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  pressed: { opacity: 0.85 },
  stale: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  photos: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl + 4,
    gap: SPACING.lg,
  },
  all: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 6 },
  allLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },
  // Een rij loopt tot tegen de rand van het scherm, zodat de laatste tegel
  // zichtbaar doorloopt in plaats van afgesneden te lijken.
  bleed: { marginHorizontal: -SPACING.lg },
  strip: { gap: SPACING.md, paddingHorizontal: SPACING.lg },
  tile: { width: TILE },

  band: {
    backgroundColor: COLORS.navy,
    paddingVertical: SPACING.xl + 4,
    gap: SPACING.lg,
    overflow: 'hidden',
  },
  bandHead: { paddingHorizontal: SPACING.lg },
  ruleDark: {
    alignSelf: 'flex-start',
    paddingBottom: 6,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  bandTitle: { ...TYPE.heading, color: COLORS.onDark },
  movie: { gap: SPACING.sm + 2 },
  poster: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Zonder poster: dark glass, zoals elk paneel op een navy band.
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Een driehoek staat optisch links van het midden; een paar punten opschuiven.
  playIcon: { marginLeft: 3 },
  movieTitle: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.onDark },

  shelf: {
    backgroundColor: COLORS.paper2,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + 4,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  latest: { flexDirection: 'row', gap: 14 },
  issue: { flex: 1, maxWidth: '50%', gap: SPACING.sm },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  issueTitle: { ...TYPE.cardTitle, fontSize: 15, lineHeight: 20, color: COLORS.ink, marginTop: 2 },
  archive: { gap: SPACING.sm + 2, marginTop: SPACING.xs },
  small: { width: 72, gap: 6 },
  smallLabel: { fontFamily: FONTS.regular, fontSize: 11, lineHeight: 14, color: COLORS.body },

  // Een blad papier: wit, nauwelijks afgerond, met een zachte schaduw. De
  // schaduw zit op deze buitenste view; de foto erin wordt afgerond, want een
  // view met `overflow: hidden` tekent op iOS geen schaduw.
  paper: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    shadowColor: COLORS.navy,
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  coverLarge: { width: '100%', aspectRatio: 3 / 4 },
  coverSmall: { width: 72, aspectRatio: 3 / 4, borderRadius: 4 },
  coverImage: { width: '100%', height: '100%', borderRadius: 6 },
  blank: { flex: 1, padding: SPACING.md, gap: SPACING.sm },
  blankCompact: { padding: 6, gap: 4 },
  blankName: { fontFamily: FONTS.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: COLORS.ink },
  blankNameCompact: { fontSize: 9, lineHeight: 11, letterSpacing: 0 },
  blankRule: { width: 40, height: 3, backgroundColor: COLORS.yellow },
  blankRuleCompact: { width: 18, height: 2 },
});
