import * as WebBrowser from 'expo-web-browser';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchRooms } from '../api/endpoints';
import type { AppRoom } from '../api/contract';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { SearchField } from '../components/SearchField';
import { Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * De lokalenzoeker.
 *
 * **Waarom hier één keer alles opgehaald wordt en niet per aanslag gezocht.**
 * De hele verzameling is klein en verandert bijna nooit; ze staat na de eerste
 * keer in de leescache van `useResource` en werkt dus ook zonder netwerk, in een
 * kelder of in een aula met slechte ontvangst. Dat is precies waar iemand een
 * lokaal zoekt. Filteren gebeurt daarom lokaal, met dezelfde normalisatie als op
 * de server, zodat "200K 00.06", "200k0006" en "aula k" hetzelfde vinden.
 *
 * De kaart komt onder het zoekveld in fase 2; zie `docs/lokalenzoeker.md`.
 */

/** Kleine letters, punten en spaties weg. Zelfde regel als in de API. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, '');
}

function floorLabel(floor: number | null): string | null {
  if (floor === null) return null;
  return floor === 0 ? 'gelijkvloers' : `verdieping ${floor}`;
}

export default function LokalenScreen() {
  const [query, setQuery] = useState('');
  const resource = useResource('lokalen', () => fetchRooms());
  const data = resource.data;

  const rooms = useMemo(
    () => (data ? data.buildings.flatMap((building) => building.rooms) : []),
    [data],
  );

  const results = useMemo(() => {
    const term = normalise(query);
    if (!term) return rooms;
    const scored: { room: AppRoom; score: number }[] = [];
    for (const room of rooms) {
      const label = normalise(room.label);
      const hay = [label, normalise(room.code ?? ''), normalise(room.name), normalise(room.buildingName)];
      if (!hay.some((entry) => entry.includes(term))) continue;
      scored.push({ room, score: label === term ? 0 : label.startsWith(term) ? 1 : 2 });
    }
    return scored
      .sort((a, b) => a.score - b.score || a.room.label.localeCompare(b.room.label, 'nl'))
      .map((entry) => entry.room);
  }, [rooms, query]);

  if (resource.loading) {
    return (
      <View style={styles.root}>
        <PageHead title="Lokalen" subtitle="Zoek een lokaal op de campus" />
        <Loading />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.root}>
        <PageHead title="Lokalen" subtitle="Zoek een lokaal op de campus" />
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHead title="Lokalen" subtitle="Zoek een lokaal op de campus" />
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <View style={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="200K 00.06, aula, Franklin"
          label="Zoek een lokaal of gebouw"
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(room) => room.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          /* KULag screent enkel op toegankelijkheid, dus niet elk lokaal staat
             erin. Doen alsof een bureau niet bestaat is erger dan zeggen waar
             het wel te vinden is. */
          <Empty
            title="Niets gevonden"
            hint="Deze lijst komt uit de KU Leuven Access Guide en bevat de aula's, leslokalen en inkomhallen. Een bureau of labo staat er niet altijd in."
            action={{
              label: 'Zoeken bij KU Leuven',
              onPress: () => void WebBrowser.openBrowserAsync(data.sourceUrl),
            }}
          />
        }
        renderItem={({ item }) => <RoomRow room={item} />}
      />
    </View>
  );
}

function RoomRow({ room }: { room: AppRoom }) {
  const where = [room.buildingName, floorLabel(room.floor)].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.label}, ${room.name}, ${where}`}
      onPress={() => void WebBrowser.openBrowserAsync(room.kulagUrl)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowCode}>{room.label}</Text>
        <Text style={styles.rowName} numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {where}
        </Text>
      </View>
      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  search: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
  },
  rowPressed: { backgroundColor: COLORS.paper2 },
  rowText: { flex: 1, gap: 2 },
  rowCode: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  rowName: { ...TYPE.small, color: COLORS.body },
  rowMeta: { ...TYPE.small, color: COLORS.muted },
});
