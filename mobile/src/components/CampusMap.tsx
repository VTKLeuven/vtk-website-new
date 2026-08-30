import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import type { AppBuilding, AppCampusMap } from '../api/contract';
import { fitProjection, linePath, polygonPath, type LatLng } from '../campus/geo';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * De campuskaart, getekend uit de gegevens die we zelf ophalen.
 *
 * **Waarom hier geen kaartbibliotheek staat.** `react-native-maps` en
 * `expo-maps` zijn native modules die niet in Expo Go zitten, en Expo Go is de
 * enige weg naar een iPhone (zie `mobile/AGENTS.md`). Een WebView met Leaflet
 * zou regel 2 omzeilen. Wat overblijft is dit, en het is niet de armste maar de
 * beste optie: we hebben echte voetafdrukken en een echt padennet, en een eigen
 * tekening kan het gezochte gebouw in geel zetten en de rest laten zwijgen. Een
 * wereldkaart met veertig vreemde labels kan dat niet.
 *
 * Rastertegels van OSM gebruiken we bewust niet; hun gebruiksvoorwaarden staan
 * app-gebruik op schaal niet toe. Zie `docs/lokalenzoeker.md`.
 */

const MAX_SCALE = 6;

/**
 * Hoe breed een gebouw op het scherm moet zijn voor zijn code erop past.
 *
 * Veertien codes passen niet op een campus van 350 punten breed; 200M, 200S en
 * 200L zouden over elkaar vallen. Daarom draagt een gebouw zijn label pas
 * wanneer het groot genoeg in beeld staat, en komen de kleine erbij naarmate je
 * inzoomt. Het gekozen gebouw houdt zijn label altijd: dat is waar je naar zoekt.
 */
const LABEL_AT_WIDTH = 78;

export function CampusMap({
  buildings,
  campus,
  selectedId,
  routePoints,
  here,
  onSelect,
  height = 260,
}: {
  buildings: AppBuilding[];
  campus: AppCampusMap;
  selectedId: string | null;
  /** De berekende wandelroute; leeg wanneer er geen doel is. */
  routePoints: LatLng[];
  /** Waar de gebruiker staat, wanneer hij dat gedeeld heeft. */
  here: LatLng | null;
  onSelect: (buildingId: string) => void;
  height?: number;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  /**
   * De projectie past op onze eigen gebouwen en niet op alles wat OSM meestuurt:
   * anders bepaalt een pad dat toevallig tot de rand van de bbox loopt hoe ver
   * de campus weg staat. Wat erbuiten valt wordt door de lijst afgesneden.
   */
  const view = useMemo(() => {
    const points: LatLng[] = buildings.flatMap((building) => building.outline);
    if (points.length === 0) return null;

    const projection = fitProjection(points);
    return {
      projection,
      context: campus.context.map((outline) => polygonPath(outline, projection)),
      // Het hele padennet als één pad: duizend losse elementen tekenen is
      // hetzelfde beeld voor veel meer werk.
      walk: campus.walk.edges
        .map(([a, b]) => linePath([campus.walk.nodes[a], campus.walk.nodes[b]], projection))
        .join(''),
      shapes: buildings.map((building) => {
        const xs = building.outline.map((point) => projection.project(point).x);
        return {
          id: building.id,
          code: building.shortCode,
          name: building.name,
          d: polygonPath(building.outline, projection),
          /** Breedte in viewBox-eenheden; bepaalt of het label past. */
          width: Math.max(...xs) - Math.min(...xs),
          centre:
            building.lat !== null && building.lng !== null
              ? projection.project([building.lat, building.lng])
              : null,
        };
      }),
    };
  }, [buildings, campus]);

  const route = useMemo(
    () => (view && routePoints.length > 1 ? linePath(routePoints, view.projection) : ''),
    [view, routePoints],
  );

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      // Slepen heeft enkel zin wanneer er meer kaart is dan er past.
      if (savedScale.value <= 1) return;
      x.value = savedX.value + event.translationX;
      y.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1);
      savedScale.value = 1;
      x.value = withTiming(0);
      y.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  /**
   * De zoom op de JS-kant, om te beslissen welke labels meegaan.
   *
   * Enkel bij een merkbare stap: elke frame een `setState` doen zou de hele
   * kaart opnieuw laten renderen tijdens het knijpen, en dat is precies wanneer
   * het vloeiend moet blijven.
   */
  const [zoom, setZoom] = useState(1);
  useAnimatedReaction(
    () => scale.value,
    (value, previous) => {
      if (previous === null || Math.abs(value - previous) > 0.3) runOnJS(setZoom)(value);
    },
  );

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  if (!view) return null;

  const { projection } = view;

  return (
    <View style={[styles.frame, { height }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, animated]}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`-12 -12 ${projection.width + 24} ${projection.height + 24}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Onder: wat KULag niet kent, zodat de campus geen zwevende vormen is. */}
            <G>
              {view.context.map((d, index) => (
                <Path key={`ctx-${index}`} d={d} fill={COLORS.paper2} />
              ))}
            </G>

            {/* De paden. Dit is wat de kaart leesbaar maakt. */}
            <Path d={view.walk} stroke={COLORS.line2} strokeWidth={1.6} fill="none" strokeLinecap="round" />

            {route ? (
              <>
                <Path d={route} stroke={COLORS.paper2} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Path d={route} stroke={COLORS.yellowDeep} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : null}

            {view.shapes.map((shape) => {
              const on = shape.id === selectedId;
              const dim = selectedId !== null && !on;
              return (
                <Path
                  key={shape.id}
                  d={shape.d}
                  fill={on ? COLORS.yellow : COLORS.surface}
                  stroke={on ? COLORS.yellowDeep : COLORS.line2}
                  strokeWidth={on ? 2.4 : 1.6}
                  strokeLinejoin="round"
                  opacity={dim ? 0.45 : 1}
                  onPress={() => onSelect(shape.id)}
                />
              );
            })}

            {view.shapes.map((shape) =>
              shape.centre && shape.code && (shape.id === selectedId || shape.width * zoom >= LABEL_AT_WIDTH) ? (
                <SvgText
                  key={`label-${shape.id}`}
                  x={shape.centre.x}
                  y={shape.centre.y}
                  fontSize={34 / zoom}
                  fontWeight="700"
                  fill={shape.id === selectedId ? COLORS.ink : COLORS.muted}
                  opacity={selectedId !== null && shape.id !== selectedId ? 0.45 : 1}
                  textAnchor="middle"
                  // `alignmentBaseline` doet op Android niets; een halve
                  // regelhoogte omlaag zet de tekst wel op beide platformen in
                  // het midden van het gebouw.
                  dy={12 / zoom}
                >
                  {shape.code}
                </SvgText>
              ) : null,
            )}

            {routePoints.length > 1 ? (
              <>
                {/* Sta je er zelf, dan draagt de blauwe stip het vertrek en is
                    een tweede wit bolletje ernaast enkel verwarrend. */}
                {here ? null : (
                  <Circle
                    cx={projection.project(routePoints[0]).x}
                    cy={projection.project(routePoints[0]).y}
                    r={7}
                    fill={COLORS.surface}
                    stroke={COLORS.line2}
                    strokeWidth={2}
                  />
                )}
                <Circle
                  cx={projection.project(routePoints[routePoints.length - 1]).x}
                  cy={projection.project(routePoints[routePoints.length - 1]).y}
                  r={8}
                  fill={COLORS.yellow}
                  stroke={COLORS.ink}
                  strokeWidth={1.8}
                />
              </>
            ) : null}

            {here ? (
              <>
                <Circle
                  cx={projection.project(here).x}
                  cy={projection.project(here).y}
                  r={14}
                  fill={COLORS.navy}
                  opacity={0.16}
                />
                <Circle
                  cx={projection.project(here).x}
                  cy={projection.project(here).y}
                  r={6}
                  fill={COLORS.navy}
                  stroke={COLORS.surface}
                  strokeWidth={2.4}
                />
              </>
            ) : null}
          </Svg>
        </Animated.View>
      </GestureDetector>

      {/* ODbL. Dit is de licentie, geen nette gewoonte. */}
      <Text style={styles.credit}>{campus.attribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  credit: {
    ...TYPE.small,
    fontSize: 10,
    position: 'absolute',
    right: SPACING.sm,
    bottom: SPACING.xs,
    color: COLORS.muted,
  },
});
