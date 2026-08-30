import * as WebBrowser from 'expo-web-browser';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchRooms } from '../api/endpoints';
import type { AppBuilding, AppCampusMap, AppRoom } from '../api/contract';
import { messageFor, useResource } from '../api/useResource';
import { metres, type LatLng } from '../campus/geo';
import { nearestNode, prepare, shortestPathToAny } from '../campus/route';
import { CampusMap } from '../components/CampusMap';
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
 * De kaart eronder is `CampusMap`; de route wordt hier berekend en niet daar,
 * zodat de kaart puur tekent en dit scherm de toestand houdt.
 */

/** Kleine letters, punten en spaties weg. Zelfde regel als in de API. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, '');
}

/**
 * De deuren van een gebouw, of het zwaartepunt wanneer OSM er geen kent.
 *
 * Welke deur de juiste is, beslist de route en niet de afstand tot het midden:
 * bij een lang gebouw ligt elke deur ver van het zwaartepunt, en de dichtstbije
 * kan aan de verkeerde kant liggen. `shortestPathToAny` kiest de beste in één
 * zoektocht. De koppeling deur-gebouw komt van de server en is exclusief.
 */
function doorsFor(building: AppBuilding, campus: AppCampusMap): LatLng[] {
  const doors = campus.entrances
    .filter((entrance) => entrance.buildingId === building.id)
    .map((entrance) => [entrance.lat, entrance.lng] as LatLng);
  if (doors.length > 0) return doors;
  return building.lat !== null && building.lng !== null ? [[building.lat, building.lng]] : [];
}

/**
 * De halte waar de campus begint.
 *
 * OSM geeft er vijf terug, waaronder beide richtingen van dezelfde halte, en de
 * eerste uit die lijst is geen keuze maar toeval. Genomen wordt de halte die het
 * dichtst bij het midden van het padennet ligt: dat is stabiel, en het is waar
 * de meeste mensen uitstappen. Zodra `expo-location` erin zit (fase 3) vervangt
 * de eigen positie dit hele stuk.
 */
function arrivalStop(campus: AppCampusMap): { lat: number; lng: number; name: string | null } | null {
  if (campus.busStops.length === 0) return null;

  const nodes = campus.walk.nodes;
  const centre: LatLng = [
    nodes.reduce((sum, node) => sum + node[0], 0) / nodes.length,
    nodes.reduce((sum, node) => sum + node[1], 0) / nodes.length,
  ];

  return campus.busStops.reduce((best, stop) =>
    metres([stop.lat, stop.lng], centre) < metres([best.lat, best.lng], centre) ? stop : best,
  );
}

function floorLabel(floor: number | null): string | null {
  if (floor === null) return null;
  return floor === 0 ? 'gelijkvloers' : `verdieping ${floor}`;
}

export default function LokalenScreen() {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
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

  /**
   * Waar de kaart naartoe wijst.
   *
   * Een zoekopdracht die op één gebouw uitkomt is net zo goed een keuze als
   * erop tikken; wachten op een extra tik laat iemand raden dat er nog iets te
   * zien is. Tikken wint wel van zoeken, want dat is de meest recente keuze.
   */
  const focus = useMemo(() => {
    if (picked) return picked;
    const ids = new Set(results.map((room) => room.buildingId));
    return ids.size === 1 ? [...ids][0] : null;
  }, [picked, results]);

  const graph = useMemo(
    () => (data ? prepare(data.campus.walk) : null),
    [data],
  );

  /**
   * De route naar het gekozen gebouw.
   *
   * Vertrek is voorlopig de bushalte: bruikbaar zonder één toestemmingsvraag, en
   * het is waar de meeste mensen de campus binnenkomen. Zodra `expo-location`
   * erin zit (fase 3) wordt dat de eigen positie.
   */
  const route = useMemo(() => {
    if (!data || !graph) return null;
    const building = data.buildings.find((entry) => entry.id === focus);
    if (!building || building.lat === null || building.lng === null) return null;

    const start = arrivalStop(data.campus);
    if (!start) return null;

    const doors = doorsFor(building, data.campus);
    if (doors.length === 0) return null;

    const path = shortestPathToAny(
      graph,
      nearestNode(graph, [start.lat, start.lng]),
      doors.map((door) => nearestNode(graph, door)),
    );
    return path ? { ...path, from: start.name, building } : null;
  }, [data, graph, focus]);

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
          onChange={(next) => {
            setQuery(next);
            // Opnieuw beginnen te typen laat de keuze los; anders blijft de
            // kaart een gebouw tonen dat niet meer in de lijst staat.
            setPicked(null);
          }}
          placeholder="200K 00.06, aula, Franklin"
          label="Zoek een lokaal of gebouw"
        />

        <CampusMap
          buildings={data.buildings}
          campus={data.campus}
          selectedId={focus}
          routePoints={route?.points ?? []}
          onSelect={(id) => setPicked((current) => (current === id ? null : id))}
        />

        <Text style={styles.legend}>
          {route
            ? `${route.building.name}${route.building.shortCode ? ` (${route.building.shortCode})` : ''} · ${Math.round(route.metres)} m te voet vanaf ${route.from ?? 'de halte'}`
            : 'Tik een gebouw aan of zoek een lokaal; de route wordt hier berekend.'}
        </Text>
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
  search: { padding: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.md },
  legend: { ...TYPE.small, color: COLORS.muted },
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
