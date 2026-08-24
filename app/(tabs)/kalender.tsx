import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { fetchCalendar } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { EventRow } from '../../src/components/EventRow';
import { PageHead } from '../../src/components/PageHead';
import { Empty, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * De kalender: alles wat er de komende tijd te doen is, als lijst.
 *
 * Een maandraster zoals op de site zou hier niet werken. Op een telefoon is een
 * dag in zo'n raster een vakje van een halve centimeter; wat je wil weten is
 * "wat komt er nu", en dat is een lijst. De categoriechips bovenaan zijn de
 * filters die op de site links staan.
 *
 * Werkt zonder login. Wie ingelogd is, ziet de evenementen van zijn eigen
 * doelgroepen; dat vertelt het scherm er ook bij, want anders zoekt iemand
 * tevergeefs naar een eerstejaarsactiviteit die er voor hem uitgefilterd is.
 */
export default function KalenderScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const [category, setCategory] = useState<string | null>(null);

  const resource = useResource(
    'kalender',
    () => fetchCalendar(locale, { categorie: category ?? undefined }),
    `${locale}:${category ?? ''}`,
  );

  if (resource.loading) return <Loading label="Kalender ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { events, categories, filteredByAudience } = resource.data;

  return (
    <>
      <PageHead title="Kalender" subtitle="Alles wat er te doen is" />

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipBar}
        >
          <Chip label="Alles" active={category === null} onPress={() => setCategory(null)} />
          {categories.map((item) => (
            <Chip
              key={item.slug}
              label={item.name}
              active={category === item.slug}
              onPress={() => setCategory(category === item.slug ? null : item.slug)}
            />
          ))}
        </ScrollView>
      ) : null}

      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <FlatList
        data={events}
        keyExtractor={(event) => event.id}
        contentContainerStyle={styles.list}
        style={styles.root}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
        renderItem={({ item }) => (
          <EventRow
            event={item}
            locale={locale}
            onPress={() => router.push(`/evenement/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <Empty
            title="Niets gevonden"
            hint={
              category
                ? 'Er staat niets in deze categorie. Zet de filter op Alles om de rest te zien.'
                : 'Er staat nog niets gepland.'
            }
            action={category ? { label: 'Toon alles', onPress: () => setCategory(null) } : undefined}
          />
        }
        ListFooterComponent={
          viewer && filteredByAudience && events.length > 0 ? (
            <Text style={styles.footer}>
              Je ziet de evenementen die bij jouw studiejaar horen. Activiteiten voor een andere
              doelgroep staan er niet tussen.
            </Text>
          ) : null
        }
      />
    </>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  chipBar: {
    flexGrow: 0,
    backgroundColor: COLORS.paper,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  chips: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  // Geel is het accent voor wat actief is, precies zoals bij de filters op de site.
  chipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipLabel: { ...TYPE.small, color: COLORS.body },
  chipLabelActive: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.lg },
});
