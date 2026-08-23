import { StyleSheet, Text, View } from 'react-native';
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
 * De ene uitzondering is Home, met haar fotohero. Zo is het op de site ook.
 */
export function PageHead({
  title,
  subtitle,
  kicker,
  right,
}: {
  title: string;
  subtitle?: string | null;
  kicker?: string | null;
  /** Een enkele actie rechts van de titel, bv. een zoekknop. */
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.head, { paddingTop: insets.top + SPACING.lg }]}>
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
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  text: { flex: 1, gap: SPACING.xs },
  right: { paddingBottom: SPACING.xs },
  kicker: { ...TYPE.kicker, color: COLORS.yellow },
  title: { ...TYPE.pageTitle, color: COLORS.onDark },
  subtitle: { ...TYPE.body, color: COLORS.onDarkMuted },
});
