import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  BookOpen,
  CalendarClock,
  ExternalLink,
  Sandwich,
  TicketCheck,
  Wrench,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * De vijf dingen waarvoor iemand de app opent.
 *
 * Ze staan op Home en niet in de Info-tab, en dat is de scheiding: **Home is wat
 * je wil doen, Info is waar alles staat.** Toen deze snelkoppelingen ook in Info
 * stonden, kwam de helft ervan twee keer voor: één keer als tegel en één keer als
 * menu-item uit het CMS.
 *
 * Twee ervan verlaten de app, want cursusdienst en tijdsloten draaien op Cudi en
 * niet op deze site (zie `docs/design-decisions.md`). Die krijgen daarom het
 * pijltje naar buiten: je hoort te weten dat je in een browser terechtkomt
 * voordat je tikt, niet erna.
 */

const CUDI = 'https://cudi.vtk.be';

type Shortcut = {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Een route in de app, of een volledig adres naar buiten. */
  to: string;
  external?: boolean;
};

export function Shortcuts() {
  const router = useRouter();

  const items: Shortcut[] = [
    {
      key: 'broodjes',
      label: 'Broodjes',
      icon: <Sandwich color={COLORS.navy} size={22} />,
      to: '/bestellen',
    },
    {
      key: 'tickets',
      label: 'Tickets',
      icon: <TicketCheck color={COLORS.navy} size={22} />,
      to: '/tickets',
    },
    {
      key: 'shiften',
      label: 'Shiften',
      icon: <Wrench color={COLORS.navy} size={22} />,
      to: '/shiften',
    },
    {
      key: 'cursusdienst',
      label: 'Cursusdienst',
      icon: <BookOpen color={COLORS.navy} size={22} />,
      to: `${CUDI}/vtk/shop`,
      external: true,
    },
    {
      key: 'tijdsloten',
      label: 'Tijdsloten',
      icon: <CalendarClock color={COLORS.navy} size={22} />,
      to: `${CUDI}/vtk/account/slots`,
      external: true,
    },
  ];

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={
            item.external ? `${item.label}, opent cudi.vtk.be` : item.label
          }
          onPress={() =>
            item.external
              ? void WebBrowser.openBrowserAsync(item.to)
              : router.push(item.to as never)
          }
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        >
          <View style={styles.iconRow}>
            {item.icon}
            {item.external ? <ExternalLink color={COLORS.muted} size={13} /> : null}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  // Drie op een rij op een gewone telefoon. Bij vijf items betekent dat een
  // volle rij en een halve; dat leest beter dan twee rijen van tweeënhalf.
  tile: {
    width: '31.5%',
    aspectRatio: 1.15,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  pressed: { backgroundColor: COLORS.paper2 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  label: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
});
