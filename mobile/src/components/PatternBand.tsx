import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { TECHNISCH_PATTERN } from '../theme/pattern';

/** Zo groot staat één tegel van het patroon; op de site is dat 880 px op een breed scherm. */
const TILE = 620;

/**
 * Het technische patroon over een navy band, zoals `.vtk-page-head::after` op de
 * site: witte lijnen op een derde sterkte. Elk scherm geeft een eigen `offset`
 * mee, zodat niet elke kop hetzelfde stuk van de tekening toont; op de site heeft
 * ook elke band zijn eigen uitsnede.
 *
 * Twee op twee tegels: genoeg voor de breedste telefoon en de hoogste kop. Het
 * patroon is naadloos, dus de naad tussen twee tegels valt niet op.
 */
export const PatternBand = memo(function PatternBand({
  offset = [0, 0],
  opacity = 0.34,
}: {
  /** Waar de tekening begint, in px; negatief schuift ze naar links of boven. */
  offset?: [number, number];
  opacity?: number;
}) {
  // Altijd binnen één tegel beginnen, zodat de twee tegels de hele band dekken.
  const left = -(((-offset[0] % TILE) + TILE) % TILE);
  const top = -(((-offset[1] % TILE) + TILE) % TILE);

  return (
    <View pointerEvents="none" style={[styles.layer, { opacity }]}>
      {[0, 1].map((row) =>
        [0, 1].map((col) => (
          <SvgXml
            key={`${row}-${col}`}
            xml={TECHNISCH_PATTERN}
            width={TILE}
            height={TILE}
            style={{ position: 'absolute', left: left + col * TILE, top: top + row * TILE }}
          />
        )),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
