import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppTicketQuestion } from '../api/contract';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

export type AnswerValue = string | boolean | string[];

/**
 * Eén vraag bij een ticket.
 *
 * De vijf types die `TicketQuestionType` kent, allemaal native. Er is bewust geen
 * "onbekend type valt terug op de webshop": vijf is het volledige aantal, en zou
 * er ooit een zesde bijkomen, dan hoort dat hier een echt veld te worden en geen
 * omweg.
 *
 * Het label draagt de sterretjes niet: verplicht staat er in woorden bij. Een
 * asterisk is een conventie die je moet kennen, en de helft van de mensen leest
 * ze als een voetnoot.
 */
export function QuestionField({
  question,
  value,
  onChange,
}: {
  question: AppTicketQuestion;
  value: AnswerValue | undefined;
  onChange: (next: AnswerValue) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {question.label}
        {question.required ? '' : ' (mag leeg blijven)'}
      </Text>
      {question.description ? <Text style={styles.hint}>{question.description}</Text> : null}

      {question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT' ? (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline={question.type === 'LONG_TEXT'}
          style={[styles.input, question.type === 'LONG_TEXT' && styles.inputTall]}
          placeholderTextColor={COLORS.muted}
          accessibilityLabel={question.label}
        />
      ) : null}

      {question.type === 'BOOLEAN' ? (
        <Toggle
          checked={value === true}
          label={question.label}
          onPress={() => onChange(value !== true)}
        />
      ) : null}

      {question.type === 'SINGLE_CHOICE' ? (
        <View style={styles.options}>
          {question.options.map((option) => (
            <Toggle
              key={option}
              checked={value === option}
              label={option}
              onPress={() => onChange(option)}
            />
          ))}
        </View>
      ) : null}

      {question.type === 'MULTIPLE_CHOICE' ? (
        <View style={styles.options}>
          {question.options.map((option) => {
            const chosen = Array.isArray(value) && value.includes(option);
            return (
              <Toggle
                key={option}
                checked={chosen}
                label={option}
                onPress={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    chosen ? current.filter((item) => item !== option) : [...current, option],
                  );
                }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Een aankruisbare regel. Dezelfde vorm voor ja/nee, één-uit-veel en
 * meerdere-uit-veel: het verschil zit in wat de knop doet, niet in hoe hij eruit
 * ziet, en drie soorten vakjes leren is niet nodig om een broodje te bestellen.
 */
function Toggle({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Check color={COLORS.ink} size={14} /> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACING.sm },
  label: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  hint: { ...TYPE.small, color: COLORS.muted },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  inputTall: { minHeight: 96, textAlignVertical: 'top' },
  options: { gap: SPACING.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  togglePressed: { opacity: 0.7 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  toggleLabel: { ...TYPE.body, color: COLORS.body, flex: 1 },
});
