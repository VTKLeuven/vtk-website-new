import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, Play } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppOpeningHours } from '../../src/api/contract';
import { fetchHome } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { EventRow } from '../../src/components/EventRow';
import { Shortcuts } from '../../src/components/Shortcuts';
import { Prose } from '../../src/components/Prose';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, DARK_GLASS, FONTS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Home.
 *
 * Het enige scherm met een fotohero in plaats van de donkere paginakop; op de
 * site is de homepage ook de enige die dat mag. De ritmiek van de site komt
 * terug als stapel: hero, openingsuren op een navy band, evenementen op papier,
 * career weer navy, jouw POC's, partners.
 *
 * De sectie **Jouw POC's** staat bewust helemaal onderaan en niet tussen twee
 * donkere banden. Ze verschijnt enkel voor een ingelogd lid met studierichtingen,
 * en zat ze ertussen, dan zouden die twee banden tegen elkaar botsen zodra ze
 * wegvalt. Dezelfde reden als op de site.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, viewer, gate, bootstrap } = useApp();
  const resource = useResource('home', () => fetchHome(locale), locale);

  if (resource.loading) return <Loading label="VTK openen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const home = resource.data;
  const firstName = viewer?.name.split(' ')[0];

  return (
    <View style={styles.root}>
      {/* De hero staat buiten de scroll, net als `PageHead` op elk ander scherm.
          Zat hij erbinnen, dan kon je hem naar beneden trekken en verscheen er
          een lege strook boven de foto; dat gebeurt nergens anders in de app. */}
      <View style={styles.hero}>
        {home.heroPhotoUrl ? (
          <Image source={{ uri: home.heroPhotoUrl }} style={styles.heroPhoto} contentFit="cover" />
        ) : null}
        <View style={styles.heroScrim} />
        <View style={[styles.heroText, { paddingTop: insets.top + SPACING.lg }]}>
          <Text style={styles.heroKicker}>VTK LEUVEN</Text>
          <Text style={styles.heroTitle}>
            {firstName ? `Dag ${firstName}, ` : ''}
            <Text style={styles.heroAccent}>welkom</Text>
          </Text>
        </View>
      </View>

      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
      <View style={styles.stack}>
        {gate ? (
          <View style={styles.paperBlock}>
            <Card featured>
              <Text style={styles.cardTitle}>
                {gate === 'onboarding' ? 'Werk je profiel af' : 'Bevestig je studie'}
              </Text>
              <Text style={styles.cardBody}>
                {gate === 'onboarding'
                  ? 'Nog een paar gegevens en je account is klaar. Zonder dat blijven bestellen en tickets gesloten.'
                  : 'Elk werkingsjaar geef je opnieuw op wat je studeert. Dat houdt de mailinglijsten en de cursusdienst kloppend.'}
              </Text>
              <Button
                label="Nu doen"
                onPress={() => router.push({ pathname: '/poort', params: { gate } })}
              />
            </Card>
          </View>
        ) : null}

        <View style={styles.paperBlock}>
          <Shortcuts />
        </View>

        {bootstrap?.announcement ? (
          <View style={styles.paperBlock}>
            <Card>
              <Text style={styles.kicker}>AANKONDIGING</Text>
              <Text style={styles.cardTitle}>{bootstrap.announcement.title}</Text>
              <Prose>{bootstrap.announcement.body}</Prose>
            </Card>
          </View>
        ) : null}

        {/* Openingsuren: een navy band, zoals op de site meteen onder de hero. */}
        <View style={styles.bandDark}>
          <Text style={styles.bandTitleDark}>Openingsuren</Text>
          <View style={styles.hoursRow}>
            <HoursPanel hours={home.openingHours.theokot} />
            <HoursPanel hours={home.openingHours.cursusdienst} />
            <HoursPanel
              hours={home.openingHours.elixir}
              // De live geluidsstatus van 't ElixIr wint van het uurrooster, maar
              // enkel als de meting vers is: een verouderde "open" is erger dan
              // geen antwoord.
              live={
                home.barStatus && !home.barStatus.stale
                  ? home.barStatus.isOpen
                    ? 'Nu open'
                    : 'Nu gesloten'
                  : null
              }
            />
          </View>
        </View>

        {home.upcomingEvents.length > 0 ? (
          <View style={styles.bandTint}>
            <View style={styles.bandHead}>
              <Text style={styles.bandTitle}>Opkomende evenementen</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Alle evenementen"
                onPress={() => router.push('/kalender')}
                style={styles.more}
              >
                <Text style={styles.moreText}>alles</Text>
                <ChevronRight color={COLORS.muted} size={16} />
              </Pressable>
            </View>
            <View style={styles.list}>
              {home.upcomingEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  locale={locale}
                  onPress={() => router.push(`/evenement/${event.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {home.aftermovies.length > 0 ? (
          <View style={styles.bandDark}>
            <Text style={styles.bandTitleDark}>Aftermovies</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.movies}>
              {home.aftermovies.map((movie) => (
                <Pressable
                  key={movie.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Bekijk ${movie.title}`}
                  onPress={() => void WebBrowser.openBrowserAsync(movie.externalUrl)}
                  style={styles.movie}
                >
                  {movie.posterUrl ? (
                    <Image
                      source={{ uri: movie.posterUrl }}
                      style={styles.moviePoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.moviePoster, styles.moviePosterEmpty]} />
                  )}
                  <View style={styles.moviePlay}>
                    <Play color={COLORS.ink} size={16} fill={COLORS.ink} />
                  </View>
                  <Text style={styles.movieTitle} numberOfLines={2}>
                    {movie.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {home.career ? (
          <View style={styles.bandDark}>
            <Text style={styles.bandTitleDark}>{home.career.title}</Text>
            <Text style={styles.bandBodyDark}>{home.career.body}</Text>
            {home.career.ctaUrl ? (
              <View style={styles.bandAction}>
                <Button
                  label={home.career.ctaLabel ?? 'Meer weten'}
                  onDark
                  onPress={() => void WebBrowser.openBrowserAsync(home.career!.ctaUrl as string)}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {home.pocs.length > 0 ? (
          <View style={styles.bandTint}>
            <View style={styles.bandHead}>
              <Text style={styles.bandTitle}>Jouw POC{"'"}s</Text>
              {/* Dezelfde "bekijk alles" als op de site: wie de POC van een
                  andere richting zoekt, geraakt er anders nergens. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Alle POC's"
                onPress={() => router.push('/pocs')}
                style={styles.more}
              >
                <Text style={styles.moreText}>alles</Text>
                <ChevronRight color={COLORS.muted} size={16} />
              </Pressable>
            </View>
            <View style={styles.list}>
              {home.pocs.map((poc) => (
                <Card key={poc.id}>
                  <Text style={styles.cardTitle}>{poc.name}</Text>
                  {poc.email ? <Text style={styles.hint}>{poc.email}</Text> : null}
                  <View style={styles.people}>
                    {poc.people.map((person, index) => (
                      <View key={`${person.name}-${index}`} style={styles.person}>
                        {person.avatarUrl ? (
                          <Image
                            source={{ uri: person.avatarUrl }}
                            style={styles.avatar}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.avatar, styles.avatarEmpty]} />
                        )}
                        <View style={styles.personText}>
                          <Text style={styles.personName}>{person.name}</Text>
                          {person.role ? <Text style={styles.hint}>{person.role}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {home.partners.length > 0 ? (
          <View style={styles.paperBlock}>
            <Text style={styles.bandTitle}>Hoofdpartners</Text>
            <View style={styles.partners}>
              {home.partners.map((partner) =>
                partner.logoUrl ? (
                  <Pressable
                    key={partner.id}
                    accessibilityRole={partner.url ? 'link' : 'image'}
                    accessibilityLabel={partner.name}
                    disabled={!partner.url}
                    onPress={() => void WebBrowser.openBrowserAsync(partner.url as string)}
                    style={styles.partner}
                  >
                    <Image
                      source={{ uri: partner.logoUrl }}
                      style={styles.partnerLogo}
                      contentFit="contain"
                    />
                  </Pressable>
                ) : null,
              )}
            </View>
          </View>
        ) : null}

        {!viewer ? (
          <View style={styles.paperBlock}>
            <Card>
              <Text style={styles.cardTitle}>Log in met je VTK-account</Text>
              <Text style={styles.cardBody}>
                Zonder inloggen kan je alles lezen. Bestellen, tickets en je profiel vragen een
                account.
              </Text>
              <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
            </Card>
          </View>
        ) : null}
      </View>
      </ScrollView>
    </View>
  );
}

/**
 * Eén dienst met zijn uren. Dag en uur staan als twee kolommen naast elkaar en
 * niet als "maandag 12:00-16:00" in één string: dat is de regel over gelabelde
 * kolommen uit CLAUDE.md, en met een rooster is ze meteen zichtbaar.
 */
function HoursPanel({ hours, live }: { hours: AppOpeningHours; live?: string | null }) {
  return (
    <View style={styles.hoursPanel}>
      <Text style={styles.hoursName}>{hours.name}</Text>

      {hours.unavailable ? (
        <Text style={styles.hoursMuted}>Uren niet beschikbaar</Text>
      ) : (
        <>
          <Text style={live || hours.openNow ? styles.hoursOpen : styles.hoursMuted}>
            {live ?? (hours.openNow ? 'Nu open' : 'Nu gesloten')}
          </Text>
          {hours.entries.map((entry) => (
            <View key={entry.day} style={styles.hoursLine}>
              <Text style={styles.hoursDay} numberOfLines={1}>
                {entry.day}
              </Text>
              <Text style={styles.hoursValue} numberOfLines={1}>
                {entry.hours}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING.xxl },

  // Lager dan toen hij meescrolde: een vaste kop neemt zijn hoogte permanent in,
  // en 240 punten hero op een telefoon laat weinig over voor de inhoud.
  hero: { backgroundColor: COLORS.navy, minHeight: 180, justifyContent: 'flex-end' },
  heroPhoto: { ...StyleSheet.absoluteFillObject },
  // Het scrim van de site: het zwaarst waar de tekst staat.
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14, 26, 54, 0.58)' },
  heroText: { padding: SPACING.lg, gap: SPACING.sm },
  heroKicker: { ...TYPE.kicker, color: COLORS.yellow },
  heroTitle: { fontFamily: FONTS.bold, fontSize: 32, lineHeight: 38, color: COLORS.onDark },
  heroAccent: { fontFamily: FONTS.serifItalic, color: COLORS.yellow, fontSize: 34 },

  stack: { gap: 0 },
  paperBlock: { padding: SPACING.lg, gap: SPACING.md },

  bandDark: { backgroundColor: COLORS.navy, padding: SPACING.lg, gap: SPACING.md },
  bandTint: { backgroundColor: COLORS.paper2, padding: SPACING.lg, gap: SPACING.md },
  bandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bandTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  bandTitleDark: { ...TYPE.sectionTitle, color: COLORS.onDark },
  bandBodyDark: { ...TYPE.body, color: COLORS.onDarkMuted },
  bandAction: { alignItems: 'flex-start' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { ...TYPE.small, color: COLORS.muted },
  list: { gap: SPACING.md },

  // Op een donkere band zijn panelen dark glass, geen tweede blok navy.
  hoursRow: { gap: SPACING.md },
  hoursPanel: {
    backgroundColor: DARK_GLASS.background,
    borderWidth: 1,
    borderColor: DARK_GLASS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: 2,
  },
  hoursName: { ...TYPE.cardTitle, color: COLORS.onDark, marginBottom: SPACING.xs },
  hoursOpen: { ...TYPE.small, color: COLORS.yellow, marginBottom: SPACING.sm },
  hoursMuted: { ...TYPE.small, color: COLORS.onDarkMuted, marginBottom: SPACING.sm },
  hoursLine: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  hoursDay: { ...TYPE.small, color: COLORS.onDarkMuted, flex: 1 },
  hoursValue: { ...TYPE.small, color: COLORS.onDark },

  movies: { gap: SPACING.md, paddingRight: SPACING.lg },
  movie: { width: 200, gap: SPACING.sm },
  moviePoster: { width: 200, height: 112, borderRadius: RADIUS.sm, backgroundColor: COLORS.ink },
  moviePosterEmpty: { borderWidth: 1, borderColor: DARK_GLASS.border },
  moviePlay: {
    position: 'absolute',
    left: SPACING.sm,
    top: SPACING.sm,
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieTitle: { ...TYPE.small, color: COLORS.onDark },

  people: { gap: SPACING.md, marginTop: SPACING.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  personText: { flex: 1 },
  personName: { ...TYPE.body, color: COLORS.ink },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { borderWidth: 1, borderColor: COLORS.line },

  partners: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  partner: {
    width: '30%',
    aspectRatio: 1.8,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.sm,
  },
  partnerLogo: { width: '100%', height: '100%' },

  kicker: { ...TYPE.kicker, color: COLORS.muted },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  cardBody: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});
