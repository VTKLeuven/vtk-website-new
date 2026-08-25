import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  ChevronRight,
  Music,
  Sandwich,
  TicketCheck,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTodayTask } from '../api/contract';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Eén ding dat op jou wacht: je broodje, je shift van vanavond, je ticket.
 *
 * De volgorde en de dringendheid komen van de server; die weet welke van deze
 * dingen een deadline heeft. Wat hier gebeurt is enkel tekenen, en dat is met
 * opzet: zou de app zelf beslissen wat dringend is, dan zou die regel op twee
 * plaatsen staan en vroeg of laat uit elkaar lopen.
 *
 * Een dringende taak krijgt de gele rail van de site (`box-shadow: inset 3px 0`
 * daar, een linkerrand hier). Geen navy vlak: dat is op de site voorbehouden aan
 * volle banden en niet aan een kaart in een raster.
 */
const ICONS: Record<AppTodayTask['kind'], React.ComponentType<{ color: string; size: number }>> = {
  gate: TriangleAlert,
  'theokot-pickup': Sandwich,
  'theokot-order': Sandwich,
  ticket: TicketCheck,
  shift: Wrench,
  piano: Music,
};

export function TaskCard({ task }: { task: AppTodayTask }) {
  const router = useRouter();
  const Icon = ICONS[task.kind] ?? CalendarCheck;

  /**
   * De server geeft een pad met soms een querystring (`/poort?gate=onboarding`).
   * `router.push` wil dat als twee stukken, anders belandt de query in het pad en
   * vindt de router niets.
   */
  const go = () => {
    const [pathname, query] = task.path.split('?');
    const params = Object.fromEntries(new URLSearchParams(query ?? ''));
    router.push({ pathname: pathname as never, params });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[task.title, task.detail].filter(Boolean).join(', ')}
      onPress={go}
      style={({ pressed }) => [
        styles.card,
        task.highlight && styles.highlight,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, task.highlight && styles.iconHighlight]}>
        <Icon color={task.highlight ? COLORS.ink : COLORS.navy} size={18} />
      </View>

      <View style={styles.text}>
        <Text style={styles.title}>{task.title}</Text>
        {task.detail ? <Text style={styles.detail}>{task.detail}</Text> : null}
        {task.actionLabel ? <Text style={styles.action}>{task.actionLabel}</Text> : null}
      </View>

      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  highlight: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
  pressed: { backgroundColor: COLORS.paper2 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHighlight: { backgroundColor: COLORS.yellow },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  detail: { ...TYPE.small, color: COLORS.muted },
  action: {
    ...TYPE.small,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.ink,
    marginTop: 2,
  },
});
