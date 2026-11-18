import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '../api/client';
import type { AppPoll, AppPollQuestion } from '../api/contract';
import { answerPoll, fetchPolls } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Ruim genoeg voor een alinea; dezelfde grens als op de site (`MAX_OPEN_ANSWER_LENGTH`). */
const MAX_OPEN_ANSWER = 2000;

/**
 * Peilingen: je RiVers vragen je mening voor de POC.
 *
 * Wat op de homepage van de site in de POC-band staat, met dezelfde zinnen (die
 * komen vertaald van de server) en dezelfde regels: elke vraag mag je overslaan,
 * opnieuw versturen vervangt je vorige antwoord, en **je ziet geen tussenstand**.
 * Anoniem: de server bewaart bij een antwoord geen gebruiker.
 */
export default function PeilingenScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('peilingen', () => fetchPolls(locale), locale);

  if (!viewer) {
    return (
      <>
        <PageHead title="Peilingen" subtitle="Je RiVers vragen je mening" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Een peiling is voor de studenten van een richting, en welke richting jij volgt, staat
              in je account. Je antwoord blijft anoniem.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Peilingen ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { polls, missingProgramme } = resource.data;

  return (
    <>
      <PageHead title="Peilingen" subtitle="Je RiVers vragen je mening" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {polls.length === 0 ? (
          missingProgramme ? (
            <Empty
              title="We weten je richting niet"
              hint="Een peiling is voor de studenten van een richting. Vul je richting in bij je gegevens op vtk.be; daarna verschijnen hier de vragen van je RiVers."
            />
          ) : (
            <Empty
              title="Geen open peilingen"
              hint="Je RiVers vragen hier je mening voor de volgende POC. Er staat nu niets open."
            />
          )
        ) : null}

        {polls.map((poll) => (
          <PollCard key={poll.id} poll={poll} onSaved={() => void resource.refresh()} />
        ))}
      </ScrollView>
    </>
  );
}

function PollCard({ poll, onSaved }: { poll: AppPoll; onSaved: () => void }) {
  // De antwoorden als strings, zoals het formulier op de site ze stuurt.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(poll.answers).map(([id, answer]) => [
        id,
        answer.text ?? (answer.value === null ? '' : String(answer.value)),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (questionId: string, value: string) => {
    setSaved(false);
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const filled = Object.values(answers).some((value) => value.trim() !== '');

  const submit = async () => {
    setBusy(true);
    try {
      await answerPoll({ pollId: poll.id, answers });
      setSaved(true);
      onSaved();
    } catch (error) {
      Alert.alert('Niet verstuurd', pollErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card featured={!poll.answered}>
      <Text style={styles.kicker}>{poll.askedBy.toUpperCase()}</Text>
      <Text style={styles.pollTitle}>{poll.title}</Text>
      <Text style={styles.body}>{poll.lead}</Text>
      <Text style={styles.hint}>{poll.openUntil}</Text>

      <View style={styles.questions}>
        {poll.questions.map((question, index) => (
          <Question
            key={question.id}
            number={index + 1}
            question={question}
            value={answers[question.id] ?? ''}
            onChange={(value) => set(question.id, value)}
          />
        ))}
      </View>

      {saved ? (
        <Text style={styles.thanks}>Bedankt, je antwoord is bewaard. {poll.thanks}</Text>
      ) : poll.answered ? (
        <Text style={styles.hint}>
          Je antwoordde al. Pas gerust iets aan: opnieuw versturen vervangt je vorige antwoord.
        </Text>
      ) : null}

      <Button
        label={poll.answered || saved ? 'Antwoord aanpassen' : 'Versturen'}
        busy={busy}
        disabled={!filled}
        onPress={() => void submit()}
      />
      <Text style={styles.hint}>{poll.anonymous}</Text>
    </Card>
  );
}

function Question({
  number,
  question,
  value,
  onChange,
}: {
  number: number;
  question: AppPollQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  // Nog eens tikken op je keuze haalt ze weg: een vraag overslaan mag.
  const toggle = (next: string) => onChange(value === next ? '' : next);

  return (
    <View style={styles.question}>
      <Text style={styles.questionText}>
        {number}. {question.text}
      </Text>

      {question.kind === 'YES_NO' ? (
        <View style={styles.choices}>
          <Choice label="Ja" selected={value === '1'} onPress={() => toggle('1')} />
          <Choice label="Nee" selected={value === '0'} onPress={() => toggle('0')} />
        </View>
      ) : question.kind === 'SCORE' ? (
        <>
          <View style={styles.choices}>
            {[1, 2, 3, 4, 5].map((score) => (
              <Choice
                key={score}
                label={String(score)}
                selected={value === String(score)}
                onPress={() => toggle(String(score))}
                square
              />
            ))}
          </View>
          {question.low || question.high ? (
            <View style={styles.scale}>
              <Text style={styles.hint}>{question.low ? `1 = ${question.low}` : ''}</Text>
              <Text style={styles.hint}>{question.high ? `5 = ${question.high}` : ''}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={MAX_OPEN_ANSWER}
          style={styles.input}
          placeholder="Je antwoord (mag leeg blijven)"
          placeholderTextColor={COLORS.muted}
          accessibilityLabel={question.text}
        />
      )}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  square = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  square?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        square && styles.choiceSquare,
        selected && styles.choiceSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

/** De melding bij een geweigerd antwoord; de codes komen van `submitPollAnswers`. */
function pollErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'POLL_CLOSED':
      return 'Deze peiling is intussen gesloten.';
    case 'POLL_NOT_YOURS':
      return 'Deze peiling is voor een andere richting of fase dan de jouwe.';
    case 'POLL_TOO_LONG':
      return 'Een open antwoord is te lang. Hou het onder de 2000 tekens.';
    case 'POLL_EMPTY':
      return 'Beantwoord minstens één vraag.';
    case 'POLL_INVALID':
      return 'Een van de antwoorden klopt niet. Trek het scherm omlaag om te vernieuwen.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  pollTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  thanks: { ...TYPE.body, color: COLORS.ink },
  questions: { gap: SPACING.lg, marginVertical: SPACING.sm },
  question: { gap: SPACING.sm },
  questionText: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  choice: {
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    minWidth: 64,
    alignItems: 'center',
  },
  choiceSquare: { minWidth: 44, paddingHorizontal: SPACING.md },
  choiceSelected: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  choicePressed: { opacity: 0.7 },
  choiceLabel: { ...TYPE.body, color: COLORS.ink },
  choiceLabelSelected: { color: COLORS.paper },
  scale: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
