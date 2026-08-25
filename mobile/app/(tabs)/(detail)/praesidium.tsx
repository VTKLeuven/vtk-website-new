import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchPraesidium } from '../../../src/api/endpoints';
import { messageFor, useResource } from '../../../src/api/useResource';
import { PageHead } from '../../../src/components/PageHead';
import { Card, Empty, ErrorState, Loading } from '../../../src/components/ui';
import { useApp } from '../../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../src/theme/tokens';

/** Hoeveel jaren los in de balk staan; de rest zit erachter. */
const YEARS_IN_BAR = 5;

/**
 * Het praesidium, per werkingsjaar.
 *
 * De jarenbalk toont de laatste vijf jaren; oudere jaren zitten achter "meer".
 * Dat is dezelfde afweging als op de site: de historiek gaat twintig jaar terug,
 * en die allemaal tonen maakt van een balk een tweede navigatie.
 */
export default function PraesidiumScreen() {
  const { locale } = useApp();
  const [year, setYear] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const resource = useResource(
    'praesidium',
    () => fetchPraesidium(locale, year ?? undefined),
    `${locale}:${year ?? ''}`,
  );

  if (resource.loading) return <Loading label="Praesidium ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const data = resource.data;
  const visibleYears = showAll ? data.years : data.years.slice(0, YEARS_IN_BAR);

  return (
    <>
      <PageHead
        title="Praesidium"
        subtitle={`Werkingsjaar ${data.year}-${data.year + 1}`}
        kicker="De ploeg"
      />

      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
          {visibleYears.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: option === data.year }}
              accessibilityLabel={`Werkingsjaar ${option}-${option + 1}`}
              onPress={() => setYear(option)}
              style={[styles.year, option === data.year && styles.yearActive]}
            >
              <Text style={[styles.yearLabel, option === data.year && styles.yearLabelActive]}>
                {option}-{String(option + 1).slice(2)}
              </Text>
            </Pressable>
          ))}
          {!showAll && data.years.length > YEARS_IN_BAR ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toon oudere jaren"
              onPress={() => setShowAll(true)}
              style={styles.year}
            >
              <Text style={styles.yearLabel}>ouder</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {data.groups.length === 0 ? (
          <Empty
            title="Geen gegevens"
            hint={`Voor ${data.year}-${data.year + 1} staat er nog niemand ingevuld.`}
          />
        ) : null}

        {data.groups.map((group) => (
          <Card key={group.slug}>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.description ? <Text style={styles.hint}>{group.description}</Text> : null}
            <View style={styles.people}>
              {group.people.map((person, index) => (
                <View key={`${person.name}-${index}`} style={styles.person}>
                  {person.avatarUrl ? (
                    <Image source={{ uri: person.avatarUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarEmpty]} />
                  )}
                  <View style={styles.personText}>
                    <Text style={styles.personName}>{person.name}</Text>
                    {person.role ? <Text style={styles.hint}>{person.role}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  years: { gap: SPACING.sm, paddingBottom: SPACING.sm },
  year: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  yearActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  yearLabel: { ...TYPE.small, color: COLORS.body },
  yearLabelActive: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },
  groupName: { ...TYPE.sectionTitle, color: COLORS.ink },
  people: { gap: SPACING.md, marginTop: SPACING.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  personText: { flex: 1 },
  personName: { ...TYPE.body, color: COLORS.ink },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { borderWidth: 1, borderColor: COLORS.line },
  hint: { ...TYPE.small, color: COLORS.muted },
});
