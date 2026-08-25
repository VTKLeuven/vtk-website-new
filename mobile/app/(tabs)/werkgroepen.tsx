import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchWerkgroepen } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Card, Empty, ErrorState, Loading } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * De werkgroepen, per werkingsjaar.
 *
 * Een werkgroep zonder leden dit jaar blijft in de lijst staan met een lege
 * ploeg; hij bestaat wel degelijk, en hem verzwijgen laat lijken alsof hij
 * opgeheven is.
 */
export default function WerkgroepenScreen() {
  const { locale } = useApp();
  const [year, setYear] = useState<number | null>(null);
  const resource = useResource(
    'werkgroepen',
    () => fetchWerkgroepen(locale, year ?? undefined),
    `${locale}:${year ?? ''}`,
  );

  if (resource.loading) return <Loading label="Werkgroepen ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const data = resource.data;

  return (
    <>
      <PageHead
        title="Werkgroepen"
        subtitle={data.year ? `Werkingsjaar ${data.year}-${data.year + 1}` : undefined}
        kicker="Mee bouwen"
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {data.years.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
            {data.years.map((option) => (
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
          </ScrollView>
        ) : null}

        {data.groups.length === 0 ? (
          <Empty title="Geen werkgroepen" hint="Er staat voor dit jaar niets ingevuld." />
        ) : null}

        {data.groups.map((group) => (
          <Card key={group.slug}>
            {group.imageUrl ? (
              <Image source={{ uri: group.imageUrl }} style={styles.photo} contentFit="cover" />
            ) : null}
            <Text style={styles.groupName}>{group.name}</Text>
            {group.description ? <Text style={styles.body}>{group.description}</Text> : null}
            {group.people.length === 0 ? (
              <Text style={styles.hint}>Dit jaar nog niemand ingevuld.</Text>
            ) : (
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
            )}
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
  photo: { width: '100%', height: 140, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  groupName: { ...TYPE.sectionTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  people: { gap: SPACING.md, marginTop: SPACING.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  personText: { flex: 1 },
  personName: { ...TYPE.body, color: COLORS.ink },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { borderWidth: 1, borderColor: COLORS.line },
});
