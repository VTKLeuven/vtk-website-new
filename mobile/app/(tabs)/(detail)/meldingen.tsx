import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { AppNotificationTopic } from '../../../src/api/contract';
import {
  fetchNotificationSettings,
  setCategoryFollow,
  setNotificationTopic,
} from '../../../src/api/endpoints';
import { messageFor, useResource } from '../../../src/api/useResource';
import { PageHead } from '../../../src/components/PageHead';
import { Button, Card, ErrorState, Loading } from '../../../src/components/ui';
import { disablePush, enablePush, hasBeenAsked, pushIsOn } from '../../../src/push';
import { useApp } from '../../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../src/theme/tokens';

/**
 * Waarvoor je telefoon afgaat.
 *
 * Twee lagen, en het verschil is belangrijk genoeg om het uit te leggen op het
 * scherm zelf:
 *
 * 1. **De toestemming van je telefoon.** Staat die uit, dan komt er niets binnen,
 *    ongeacht wat er hieronder aangevinkt staat. Op iOS krijg je maar één kans om
 *    ze te vragen, dus die vraag stellen we hier en niet bij de eerste start.
 * 2. **Welke van de berichten je wil.** Dat staat op de server, want de server
 *    beslist wat hij stuurt.
 *
 * De categorieën eronder zijn iets anders dan een schakelaar: dat is een
 * abonnement op nieuwe evenementen. Het is het enige bericht dat geen "je moet nu
 * iets doen" is, en het mag precies omdat je er zelf om vraagt, per categorie.
 */

/** De zinnen bij elk soort bericht. Ze staan hier omdat ze UI zijn, geen contract. */
const TOPICS: Record<AppNotificationTopic, { label: string; hint: string }> = {
  'theokot.open': {
    label: 'Broodjes gaan open',
    hint: 'Wanneer een nieuwe bestelronde opengaat. De deadline ligt uren voor het eten.',
  },
  'theokot.pickup': {
    label: 'Je broodje ligt klaar',
    hint: 'Op het moment dat de afhaal begint.',
  },
  'shift.reminder': {
    label: 'Je shift begint',
    hint: 'De dag ervoor en vlak voor de start. Komt ook per mail.',
  },
  'calendar.follow': {
    label: 'Nieuw in wat je volgt',
    hint: 'Wanneer er een evenement bijkomt in een categorie hieronder.',
  },
  'calendar.interest': {
    label: 'Herinnering aan wat je aanduidde',
    hint: 'Een dag voor een evenement waar je een ster bij zette.',
  },
  'study.groupStart': {
    label: 'De eerste van je blokgroep zit',
    hint: 'Eén bericht per groep per dag, wanneer de eerste begint. Niet bij elke volgende.',
  },
};

export default function MeldingenScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const resource = useResource(
    'meldingen',
    () =>
      viewer ? fetchNotificationSettings(locale) : Promise.reject(new Error('Niet ingelogd')),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  const [topics, setTopics] = useState<Record<string, boolean>>({});
  const [follows, setFollows] = useState<string[] | null>(null);
  const [pushOn, setPushOn] = useState(pushIsOn);
  const [busy, setBusy] = useState(false);

  if (!viewer) {
    return (
      <>
        <PageHead title="Meldingen" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Meldingen hangen aan je account en aan je toestel.</Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Instellingen ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const settings = resource.data;
  const followed = follows ?? settings.followedCategories;
  const enabledFor = (topic: AppNotificationTopic) =>
    topics[topic] ?? settings.topics.find((entry) => entry.topic === topic)?.enabled ?? true;

  /**
   * De schakelaar meteen omzetten en pas daarna wegschrijven. Wachten op het
   * rondje zou een schakelaar opleveren die een halve seconde terugspringt, en
   * dat leest als "het werkte niet".
   */
  const toggleTopic = (topic: AppNotificationTopic, next: boolean) => {
    setTopics((current) => ({ ...current, [topic]: next }));
    void setNotificationTopic(topic, next).catch(() => {
      setTopics((current) => ({ ...current, [topic]: !next }));
      Alert.alert('Niet opgeslagen', 'Die instelling kon niet bewaard worden. Probeer opnieuw.');
    });
  };

  const toggleFollow = (slug: string, next: boolean) => {
    setFollows(next ? [...followed, slug] : followed.filter((item) => item !== slug));
    void setCategoryFollow(slug, next).catch(() => {
      setFollows(followed);
      Alert.alert('Niet opgeslagen', 'Die categorie kon niet bewaard worden. Probeer opnieuw.');
    });
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        return;
      }
      const ok = await enablePush();
      setPushOn(ok);
      if (!ok) {
        Alert.alert(
          'Pushberichten staan uit',
          hasBeenAsked()
            ? 'Je toestel laat geen berichten toe voor deze app. Dat kan je aanzetten in de instellingen van je telefoon.'
            : 'Er kon geen toestemming opgehaald worden.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Meldingen" subtitle="Waarvoor je telefoon afgaat" />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <Card featured={!pushOn}>
          <View style={styles.headRow}>
            <Bell color={COLORS.navy} size={20} />
            <Text style={styles.title}>Pushberichten</Text>
          </View>
          <Text style={styles.body}>
            {pushOn
              ? 'Dit toestel staat aangemeld. Hieronder kies je welke berichten je wil.'
              : 'Zonder dit komt er niets binnen, hoe je het hieronder ook instelt.'}
          </Text>
          <Button
            label={pushOn ? 'Uitzetten op dit toestel' : 'Aanzetten'}
            variant={pushOn ? 'ghost' : 'primary'}
            busy={busy}
            onPress={() => void togglePush()}
          />
        </Card>

        <Text style={styles.sectionTitle}>Soorten bericht</Text>
        <View style={styles.list}>
          {settings.topics.map((entry) => {
            const copy = TOPICS[entry.topic];
            if (!copy) return null;
            return (
              <View key={entry.topic} style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.rowLabel}>{copy.label}</Text>
                  <Text style={styles.hint}>{copy.hint}</Text>
                </View>
                <Switch
                  value={enabledFor(entry.topic)}
                  onValueChange={(next) => toggleTopic(entry.topic, next)}
                  trackColor={{ true: COLORS.yellow, false: COLORS.line2 }}
                  thumbColor={COLORS.surface}
                />
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Categorieën volgen</Text>
        <Text style={styles.hint}>
          Krijg een bericht wanneer er een evenement bijkomt in een categorie die je volgt. Tik om
          aan of uit te zetten.
        </Text>
        <View style={styles.chips}>
          {settings.categories.map((category) => {
            const active = followed.includes(category.slug);
            return (
              <Pressable
                key={category.slug}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  active ? `${category.name} niet meer volgen` : `${category.name} volgen`
                }
                onPress={() => toggleFollow(category.slug, !active)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {settings.categories.length === 0 ? (
          <Text style={styles.hint}>Er staan nog geen categorieën klaar.</Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.md },

  list: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
  },
  switchText: { flex: 1, gap: 2 },
  rowLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipLabel: { ...TYPE.small, color: COLORS.body },
  chipLabelActive: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },

  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});
