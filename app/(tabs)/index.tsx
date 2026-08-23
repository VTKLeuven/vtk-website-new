import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, ErrorState, Loading, SectionTitle, StaleNotice } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, FONTS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Home.
 *
 * Het enige scherm met een eigen kop in plaats van de donkere paginakop: op de
 * site is de homepage ook de enige met een hero. Hier is dat voorlopig de navy
 * band met het gele cursieve serif-accent; de fotohero volgt in fase 1, samen met
 * de echte inhoud (openingsuren, komende evenementen, aftermovies, jouw POC's).
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bootstrap, viewer, loading, stale, error, refresh, gate } = useApp();

  if (loading) return <Loading label="VTK openen" />;

  if (!bootstrap) {
    return (
      <ErrorState
        message={
          error?.name === 'NetworkError'
            ? 'Geen verbinding met vtk.be. Kijk je netwerk na en probeer opnieuw.'
            : (error?.message ?? 'De app kon niet opstarten.')
        }
        onRetry={() => void refresh()}
      />
    );
  }

  const firstName = viewer?.name.split(' ')[0];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}

      <View style={[styles.hero, { paddingTop: insets.top + SPACING.xl }]}>
        <Text style={styles.heroKicker}>VTK LEUVEN</Text>
        <Text style={styles.heroTitle}>
          {firstName ? `Dag ${firstName}, ` : ''}
          <Text style={styles.heroAccent}>welkom</Text>
        </Text>
        <Text style={styles.heroBody}>
          De kring van de burgerlijk ingenieurs, in je broekzak.
        </Text>
      </View>

      <View style={styles.body}>
        {gate ? (
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
        ) : null}

        {bootstrap.announcement ? (
          <Card>
            <Text style={styles.cardKicker}>AANKONDIGING</Text>
            <Text style={styles.cardTitle}>{bootstrap.announcement.title}</Text>
            {/* Markdown wordt in fase 3 echt gerenderd, samen met de CMS-pagina's.
                Tot dan is dit de platte tekst, en dat is beter dan sterretjes. */}
            <Text style={styles.cardBody}>{bootstrap.announcement.body}</Text>
          </Card>
        ) : null}

        {!viewer ? (
          <Card>
            <Text style={styles.cardTitle}>Log in met je VTK-account</Text>
            <Text style={styles.cardBody}>
              Zonder inloggen kan je alles lezen. Bestellen, tickets en je profiel vragen een account.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        ) : null}

        <SectionTitle>Wat er nog komt</SectionTitle>
        <Card>
          <Text style={styles.cardBody}>
            Dit is de eerste versie van de app: de schil staat, de rest volgt per
            onderdeel. Openingsuren, evenementen en broodjes bestellen zijn als
            eerste aan de beurt.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: SPACING.xxl },
  hero: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  heroKicker: { ...TYPE.kicker, color: COLORS.yellow },
  heroTitle: { fontFamily: FONTS.bold, fontSize: 32, lineHeight: 38, color: COLORS.onDark },
  // Het gele cursieve serif-accent uit de hero op de site. Enkel hier.
  heroAccent: { fontFamily: FONTS.serifItalic, color: COLORS.yellow, fontSize: 34 },
  heroBody: { ...TYPE.body, color: COLORS.onDarkMuted },
  body: { padding: SPACING.lg, gap: SPACING.lg },
  cardKicker: { ...TYPE.kicker, color: COLORS.muted },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  cardBody: { ...TYPE.body, color: COLORS.body },
});
