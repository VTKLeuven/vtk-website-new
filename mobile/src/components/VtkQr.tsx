import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import {
  CANVAS,
  FRAME_INNER_INSET,
  FRAME_INNER_RADIUS,
  FRAME_OUTER_INSET,
  FRAME_OUTER_RADIUS,
  NAVY,
  QR_EXTENT,
  WHITE,
  qrDrawing,
} from './vtkQrPaths';

/**
 * Een QR in de huisstijl: navy ronde stippen, ronde zoekpatronen, een navy kader
 * en het woordmerk in het midden. Dezelfde opmaak als de tickets en de korte
 * links op de site.
 *
 * De meetkunde staat in `vtkQrPaths.ts`; hier wordt ze enkel getekend. Er gaat één
 * `Path` per kleur naar SVG en niet duizend `Rect`-knopen: een QR van dit formaat
 * heeft er al gauw duizend, en dat zijn er duizend te veel om bij elke render door
 * de bridge te sturen.
 */
export function VtkQr({ value, size }: { value: string; size: number }) {
  const drawing = useMemo(() => qrDrawing(value), [value]);
  if (!drawing) return null;

  const scale = size / CANVAS;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
        <Rect
          x={FRAME_OUTER_INSET}
          y={FRAME_OUTER_INSET}
          width={CANVAS - FRAME_OUTER_INSET * 2}
          height={CANVAS - FRAME_OUTER_INSET * 2}
          rx={FRAME_OUTER_RADIUS}
          fill={NAVY}
        />
        <Rect
          x={FRAME_INNER_INSET}
          y={FRAME_INNER_INSET}
          width={QR_EXTENT}
          height={QR_EXTENT}
          rx={FRAME_INNER_RADIUS}
          fill={WHITE}
        />
        <Path d={drawing.navy} fill={NAVY} />
        <Path d={drawing.white} fill={WHITE} />
        <Path d={drawing.navyCore} fill={NAVY} />
      </Svg>

      {/*
        Het logobestand is lichtgrijs, gemaakt voor de donkere navigatiebalk. Net
        als op de site gebruiken we enkel zijn alfakanaal: `tintColor` geeft het
        woordmerk exact hetzelfde navy als de modules.
      */}
      <Image
        source={require('../../assets/vtk-logo.png')}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="VTK"
        style={[
          styles.logo,
          {
            left: drawing.logo.x * scale,
            top: drawing.logo.y * scale,
            width: drawing.logo.width * scale,
            height: drawing.logo.height * scale,
            tintColor: NAVY,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { position: 'absolute' },
});
