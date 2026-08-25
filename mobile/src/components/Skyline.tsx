import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import {
  GROUND,
  GROUND_LINE,
  SKY_HORIZON,
  SKY_TOP,
  VIEW_WIDTH,
  placeSkyline,
  starsFor,
  type Building,
} from './skylineShapes';

/**
 * De skyline: wat er groeit terwijl je studeert.
 *
 * **Waarom een stad en geen balk.** Meten is het makkelijke deel; volhouden is het
 * punt. Er moet dus iets zijn dat aangroeit terwijl je zit en dat je niet stil wil
 * zien vallen. Forest heeft daar een boom voor; wij nemen de skyline uit het
 * VTK-posterbeeld, en die past bovendien in de huisstijl zonder er een tekenfilm
 * van te maken: navy silhouetten op een nachtblauwe lucht, met geel als het enige
 * accent, precies waar geel op de site ook voor dient.
 *
 * **Elke tien minuten komt er een verdieping bij** en gaan er ramen aan. Zolang je
 * sessie loopt staat er een kraan bovenop: het gebouw is in aanbouw. Stop je, dan
 * verdwijnt de kraan en blijft het gebouw staan op de hoogte die je haalde.
 *
 * In de zaal van een groep is elk lid één gebouw. Wie nu bezig is, heeft licht
 * achter de ramen; wie stil zit, staat er donker bij. Zo lees je in één oogopslag
 * of er iemand zit, zonder één cijfer te lezen.
 *
 * De meetkunde staat in `skylineShapes.ts`; hier wordt ze enkel getekend.
 */
export function Skyline({
  buildings,
  height = 132,
  moon = false,
  style,
}: {
  buildings: Building[];
  height?: number;
  /** De maan uit het posterbeeld. Enkel op een groot paneel, niet in een rij. */
  moon?: boolean;
  style?: ViewStyle;
}) {
  const placed = placeSkyline(buildings, height);
  const stars = starsFor(height);

  return (
    <View style={[styles.wrap, { height }, style]}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="vtk-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SKY_TOP} />
            <Stop offset="1" stopColor={SKY_HORIZON} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={VIEW_WIDTH} height={height} fill="url(#vtk-sky)" />

        {stars.map((star, index) => (
          <Circle
            key={index}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
            fill="#FFFFFF"
            opacity={star.opacity}
          />
        ))}

        {moon ? (
          <G>
            <Circle cx={VIEW_WIDTH - 40} cy={26} r={13} fill="#FFFFFF" opacity={0.08} />
            <Path
              d={`M${VIEW_WIDTH - 36},17 a9,9 0 1 0 0.6,17.8 a7,7 0 1 1 -0.6,-17.8 Z`}
              fill="#F2F5FF"
              opacity={0.92}
            />
          </G>
        ) : null}

        {placed.map((item) => (
          <G key={item.key}>
            <Rect
              x={item.x}
              y={item.top}
              width={item.width}
              height={height - GROUND - item.top}
              fill={item.fill}
            />
            {item.roof ? <Path d={item.roof} fill={item.fill} /> : null}
            {item.windows.map((window, index) => (
              <Rect
                key={index}
                x={window.x}
                y={window.y}
                width={window.width}
                height={window.height}
                rx={0.6}
                fill={window.fill}
                opacity={window.opacity}
              />
            ))}
            {item.crane ? <Path d={item.crane} fill="#FFD23F" opacity={0.95} /> : null}
          </G>
        ))}

        <Rect x={0} y={height - GROUND} width={VIEW_WIDTH} height={GROUND} fill={GROUND_LINE} />
      </Svg>
    </View>
  );
}

export { buildingFor, relativeBuildings, type Building } from './skylineShapes';

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 16, width: '100%' },
});
