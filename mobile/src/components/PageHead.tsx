import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { PatternBand } from './PatternBand';

export type HeadTab<T extends string> = {
  value: T;
  label: string;
  badge?: number;
  /**
   * Een gedempt getal achter het label, zoals het aantal foto's in een deel van
   * een album. Geen `badge`: die is geel en vraagt aandacht, dit is enkel info.
   */
  count?: number;
};

/**
 * De donkere paginakop, `.vtk-page-head` uit `apps/web/app/design/vtk-base.css`.
 *
 * Op de site opent elke pagina buiten de homepage hiermee: full-bleed navy met
 * het technische patroon op een derde sterkte, een lichte titel, een gedempte
 * ondertitel en een gele onderlijn van 5 px. In de app doet ze hetzelfde werk.
 * **Bouw geen tweede soort schermopener**; dat is een bestaande regel op de site
 * en ze geldt hier even hard. Home tekent dezelfde kop, met de openingsuren erin
 * (`children`).
 *
 * **Tabbladen horen in de kop** (`tabs`), als de pillen van de site: een volle
 * lichte pil voor wat open staat, een omlijnde voor de rest. Ze vervangen de gele
 * schuifschakelaar die vroeger onder de kop stond. Met `scroll` lopen ze op één
 * regel door tot over de rand, voor een lange rij zoals de jaartallen van de
 * albums; anders breken ze af naar een volgende regel.
 *
 * **De terugknop hoort hier en nergens anders.** De schermen draaien met
 * `headerShown: false`, dus er is geen systeemkop die er een tekent. Zonder deze
 * knop kwam je op iOS nergens meer weg zodra je één keer doorklikte. Hij staat
 * als kruimelpad boven de titel, zoals op de site, en verschijnt enkel wanneer er
 * iets is om naar terug te keren; een tabscherm zet `back={false}`.
 */
export function PageHead<T extends string = string>({
  title,
  subtitle,
  kicker,
  right,
  back = true,
  backLabel = 'Terug',
  tabs,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** Een korte regel boven de titel, zoals de datum op Home. */
  kicker?: string | null;
  /** Een enkele actie rechts van de titel, bv. een zoekknop. */
  right?: React.ReactNode;
  back?: boolean;
  /** Wat er naast het pijltje staat; standaard "Terug". */
  backLabel?: string;
  tabs?: { options: HeadTab<T>[]; value: T; onChange: (next: T) => void; scroll?: boolean };
  /** Extra inhoud onderaan de kop, nog op de navy band. */
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();

  return (
    <View style={[styles.head, { paddingTop: insets.top + SPACING.md }]}>
      <PatternBand offset={patternOffsetFor(title)} />

      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <ChevronLeft color={COLORS.onDarkMuted} size={18} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.noBack} />
      )}

      <View style={styles.row}>
        <View style={styles.text}>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {tabs ? (
        tabs.scroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {tabs.options.map((option) => (
              <TabPill
                key={option.value}
                option={option}
                active={option.value === tabs.value}
                onPress={() => tabs.onChange(option.value)}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.tabs}>
            {tabs.options.map((option) => (
              <TabPill
                key={option.value}
                option={option}
                active={option.value === tabs.value}
                onPress={() => tabs.onChange(option.value)}
              />
            ))}
          </View>
        )
      ) : null}

      {children}
    </View>
  );
}

function TabPill<T extends string>({
  option,
  active,
  onPress,
}: {
  option: HeadTab<T>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={option.count === undefined ? option.label : `${option.label}, ${option.count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{option.label}</Text>
      {option.count !== undefined ? (
        <Text style={[styles.tabCount, active && styles.tabCountActive]}>{option.count}</Text>
      ) : null}
      {option.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{option.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Elk scherm een eigen uitsnede van het patroon, afgeleid van de titel. Op de
 * site heeft elke band zijn eigen crop; zo toont ook hier geen twee koppen
 * hetzelfde stuk.
 */
function patternOffsetFor(title: string): [number, number] {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return [-((hash * 7) % 620), -((hash * 13) % 620)];
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.xl - 4,
    paddingBottom: SPACING.xl,
    overflow: 'hidden',
    // De gele onderlijn van `.vtk-page-head` (inset 0 -5px 0 var(--yellow)).
    borderBottomWidth: 5,
    borderBottomColor: COLORS.yellow,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginLeft: -SPACING.xs,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  noBack: { height: SPACING.md },
  pressed: { opacity: 0.6 },
  backLabel: { ...TYPE.small, color: COLORS.onDarkMuted },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  text: { flex: 1, gap: SPACING.sm },
  right: { paddingBottom: SPACING.xs },
  kicker: { ...TYPE.small, color: COLORS.onDarkMuted },
  title: { ...TYPE.pageTitle, color: COLORS.onDark },
  subtitle: { ...TYPE.body, color: COLORS.onDarkMuted },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACING.lg },
  // Tot tegen de rand van het scherm, zodat de laatste pil zichtbaar doorloopt.
  tabsScroll: { marginTop: SPACING.lg, marginRight: -(SPACING.xl - 4) },
  tabsScrollContent: { gap: 6, paddingRight: SPACING.xl - 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tabActive: { backgroundColor: COLORS.onDark, borderColor: COLORS.onDark },
  tabLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.onDark },
  tabLabelActive: { color: COLORS.ink },
  tabCount: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(239,242,248,0.6)' },
  tabCountActive: { color: COLORS.muted },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
  },
  badgeText: { fontFamily: FONTS.semibold, fontSize: 11, lineHeight: 16, color: COLORS.ink },
});
