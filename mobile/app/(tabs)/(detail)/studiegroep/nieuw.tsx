import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createStudyGroup, joinStudyGroup } from '../../../../src/api/endpoints';
import { PageHead } from '../../../../src/components/PageHead';
import { Button, Card } from '../../../../src/components/ui';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../../src/theme/tokens';

/**
 * Een groep maken, of erbij komen met een code.
 *
 * Twee kaarten onder elkaar en geen segmenten: dit is geen keuze die je maakt
 * maar een die je al gemaakt hebt voor je hier bent. Wie een code kreeg, tikt hem
 * in; wie er geen heeft, maakt er een.
 */
export default function NieuweStudiegroepScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await createStudyGroup(name.trim());
      router.back();
    } catch (error) {
      Alert.alert('Dat lukte niet', groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await joinStudyGroup(code.trim());
      router.back();
    } catch (error) {
      Alert.alert('Dat lukte niet', groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Blokgroep" subtitle="Maak er een of kom erbij met een code" />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Ik heb een code</Text>
          <Text style={styles.body}>
            Zes tekens, van iemand die de groep al heeft.
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            style={[styles.input, styles.codeInput]}
          />
          <Button
            label="Deelnemen"
            busy={busy}
            onPress={join}
            variant={code.trim().length >= 4 ? 'primary' : 'ghost'}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Nieuwe groep</Text>
          <Text style={styles.body}>
            Je krijgt meteen een code om door te sturen. Alleen wie in de groep zit,
            ziet jullie tijden.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Blokgroep Arenberg"
            placeholderTextColor={COLORS.muted}
            maxLength={40}
            style={styles.input}
          />
          <Button
            label="Groep maken"
            busy={busy}
            onPress={create}
            variant={name.trim().length >= 2 ? 'primary' : 'ghost'}
          />
        </Card>

        <View style={styles.note}>
          <Text style={styles.hint}>
            Je studietijd is enkel zichtbaar voor wie in dezelfde groep zit. Stap je
            eruit, dan ben je meteen uit die lijst weg. Er is geen ranglijst over
            heel VTK.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

/** De foutcodes uit `lib/app-api/studyGroups.ts`, in mensentaal. */
export function groupErrorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('NOT_FOUND')) return 'Die code bestaat niet. Kijk hem nog eens na.';
  if (code.includes('GROUP_FULL')) return 'Die groep zit vol.';
  if (code.includes('TOO_MANY_GROUPS')) return 'Je zit al in het maximum aantal groepen.';
  if (code.includes('INVALID_NAME')) return 'Kies een naam van 2 tot 40 tekens.';
  if (code.includes('NOT_OWNER')) return 'Alleen wie de groep maakte, kan dat.';
  return 'Er ging iets mis. Probeer het straks opnieuw.';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  note: { paddingHorizontal: SPACING.xs },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    backgroundColor: COLORS.paper2,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
  },
  codeInput: {
    ...TYPE.sectionTitle,
    letterSpacing: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
