import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Een aantal kiezen: min, het getal, plus.
 *
 * De twee knoppen zijn 44 bij 44, want dat is de kleinste maat die een duim
 * betrouwbaar raakt. Ze krijgen allebei een `accessibilityLabel` met de naam van
 * het item erin: zonder dat hoort een screenreader twintig keer "plus" zonder te
 * weten waarvan.
 */
export function Stepper({
  value,
  onChange,
  max,
  label,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Bovengrens; bereikt betekent dat plus niet meer kan. */
  max: number;
  /** Waar dit aantal over gaat, voor de screenreader. */
  label: string;
  disabled?: boolean;
}) {
  const canRemove = !disabled && value > 0;
  const canAdd = !disabled && value < max;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Eén minder: ${label}`}
        disabled={!canRemove}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [
          styles.button,
          !canRemove && styles.buttonOff,
          pressed && styles.buttonPressed,
        ]}
      >
        <Minus color={canRemove ? COLORS.ink : COLORS.muted} size={18} />
      </Pressable>

      <Text style={styles.value} accessibilityLabel={`${value} maal ${label}`}>
        {value}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Eén meer: ${label}`}
        disabled={!canAdd}
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [
          styles.button,
          !canAdd && styles.buttonOff,
          pressed && styles.buttonPressed,
        ]}
      >
        <Plus color={canAdd ? COLORS.ink : COLORS.muted} size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  button: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  buttonOff: { borderColor: COLORS.line, backgroundColor: COLORS.paper2 },
  buttonPressed: { opacity: 0.7 },
  value: { ...TYPE.cardTitle, color: COLORS.ink, minWidth: 28, textAlign: 'center' },
});
