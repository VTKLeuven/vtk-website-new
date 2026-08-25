import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * De donkere paginakop, `.vtk-page-head` uit `apps/web/app/design/vtk-base.css`.
 *
 * Op de site opent elke pagina buiten de homepage hiermee: full-bleed navy, een
 * lichte titel, een gedempte ondertitel en een gele onderlijn. In de app doet ze
 * hetzelfde werk. **Bouw geen tweede soort schermopener**; dat is een bestaande
 * regel op de site en ze geldt hier even hard.
 *
 * **De terugknop hoort hier en nergens anders.** De schermen draaien met
 * `headerShown: false`, dus er is geen systeemkop die er een tekent. Zonder deze
 * knop kwam je op iOS nergens meer weg zodra je één keer doorklikte (de
 * hardwareknop van Android redde dat daar wel), en dat was letterlijk het geval
 * op het ticketscherm. Hij verschijnt vanzelf zodra er iets is om naar terug te
 * keren, dus een tabscherm krijgt er geen.
 */
export function PageHead({
  title,
  subtitle,
  kicker,
  right,
  /** Zet dit op `false` wanneer een scherm bewust geen weg terug heeft. */
  back = true,
}: {
  title: string;
  subtitle?: string | null;
  kicker?: string | null;
  /** Een enkele actie rechts van de titel, bv. een zoekknop. */
  right?: React.ReactNode;
  back?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();

  return (
    <View style={[styles.head, { paddingTop: insets.top + SPACING.md }]}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Terug"
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ChevronLeft color={COLORS.onDark} size={20} />
          <Text style={styles.backLabel}>Terug</Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <View style={styles.text}>
          {kicker ? <Text style={styles.kicker}>{kicker.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    // De gele onderlijn van `.vtk-page-head`.
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginLeft: -SPACING.xs,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  backPressed: { opacity: 0.6 },
  backLabel: { ...TYPE.small, color: COLORS.onDark },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  text: { flex: 1, gap: SPACING.xs },
  right: { paddingBottom: SPACING.xs },
  kicker: { ...TYPE.kicker, color: COLORS.yellow },
  title: { ...TYPE.pageTitle, color: COLORS.onDark },
  subtitle: { ...TYPE.body, color: COLORS.onDarkMuted },
});
