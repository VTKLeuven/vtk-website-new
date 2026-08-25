import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Twee of drie kanten van hetzelfde onderwerp: Mijn tickets en Kopen, Bestellen
 * en Afhalen.
 *
 * Bewust geen tweede tabbalk en geen aparte schermen. Wat je met een ticket doet
 * (kopen, tonen) is één zaak in het hoofd van wie het opent, en het onder twee
 * plaatsen in de onderbalk zetten zou betekenen dat je moet weten in welke van de
 * twee je moet zijn voor je iets ziet.
 *
 * Staat direct onder de donkere kop en dus op papier, met de actieve kant in
 * geel; dat is dezelfde accentregel als op de site, waar geel voor actieve
 * toestanden is en niet voor vulling.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; badge?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.track}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                option.badge ? `${option.label}, ${option.badge}` : option.label
              }
              onPress={() => onChange(option.value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {option.label}
              </Text>
              {option.badge ? (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                    {option.badge > 99 ? '99+' : option.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  track: {
    flexDirection: 'row',
    gap: SPACING.xs,
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.pill,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 38,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
  },
  segmentActive: { backgroundColor: COLORS.yellow },
  label: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.muted },
  labelActive: { color: COLORS.ink },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.line,
  },
  badgeText: { ...TYPE.small, fontSize: 11, color: COLORS.body },
  badgeActive: { backgroundColor: 'rgba(10,15,31,0.14)' },
  badgeTextActive: { color: COLORS.ink },
});
