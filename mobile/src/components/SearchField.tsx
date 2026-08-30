import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Het zoekveld: een pill met een vergrootglas ervoor.
 *
 * Stond eerst enkel in `zoeken.tsx`. Met het albumoverzicht erbij is dit de
 * derde plek waar hetzelfde veld nodig is, en drie kopieën van een invoerveld
 * gaan uit elkaar lopen zodra iemand er een randkleur aan verandert.
 *
 * De wisknop verschijnt pas zodra er iets staat. Op een lijst die live filtert
 * is dat geen versiering: zonder die knop moet je een zoekterm letter per letter
 * terugwissen voor je de volledige lijst terugziet.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Wat een screenreader voorleest; het veld heeft geen zichtbaar label. */
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <Search color={COLORS.muted} size={18} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        style={styles.input}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={label}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoekterm wissen"
          onPress={() => onChange('')}
          hitSlop={12}
        >
          <X color={COLORS.muted} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    margin: SPACING.lg,
    marginBottom: 0,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  input: { ...TYPE.body, color: COLORS.ink, flex: 1, paddingVertical: SPACING.md },
});
