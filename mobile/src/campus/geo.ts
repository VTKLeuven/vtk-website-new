/**
 * De rekenkant van de campuskaart: projectie en afstand.
 *
 * Apart van de component, want dit is pure wiskunde en de component is React.
 * Beide willen bij de projectie: de kaart om te tekenen, het routeren om een
 * berekende route in dezelfde ruimte te zetten.
 */

/** Een punt op aarde. */
export type LatLng = [lat: number, lng: number];
/** Een punt in de `viewBox` van de SVG. */
export type Point = { x: number; y: number };

/**
 * Web Mercator, dezelfde projectie als elke webkaart.
 *
 * Op de schaal van één campus zou lat/lng gewoon schalen ook wel werken, maar
 * dan staat het noorden niet loodrecht en klopt de verhouding van de gebouwen
 * net niet. Dit zijn vijf regels; die scheelt kosten we liever niet.
 */
function mercator(point: LatLng): Point {
  return {
    x: (point[1] * Math.PI) / 180,
    y: Math.log(Math.tan(Math.PI / 4 + (point[0] * Math.PI) / 360)),
  };
}

export type Projection = {
  width: number;
  height: number;
  project: (point: LatLng) => Point;
};

/**
 * Zet een verzameling punten om in een projectie die ze allemaal bevat.
 *
 * De breedte staat vast op `width`; de hoogte volgt uit de verhouding van het
 * gebied, zodat de kaart niet uitgerekt wordt. `padding` is een fractie van het
 * gebied, zodat er lucht rond de buitenste gebouwen blijft.
 */
export function fitProjection(points: LatLng[], width = 1000, padding = 0.06): Projection {
  const projected = points.map(mercator);
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);

  const spanX = (Math.max(...xs) - Math.min(...xs)) * padding;
  const spanY = (Math.max(...ys) - Math.min(...ys)) * padding;
  const minX = Math.min(...xs) - spanX;
  const maxX = Math.max(...xs) + spanX;
  const minY = Math.min(...ys) - spanY;
  const maxY = Math.max(...ys) + spanY;

  const height = (width * (maxY - minY)) / (maxX - minX);

  return {
    width,
    height,
    project(point: LatLng): Point {
      const { x, y } = mercator(point);
      return {
        x: ((x - minX) / (maxX - minX)) * width,
        y: ((maxY - y) / (maxY - minY)) * height,
      };
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function trace(points: LatLng[], projection: Projection): string {
  return points
    .map((point) => {
      const { x, y } = projection.project(point);
      return `${round(x)} ${round(y)}`;
    })
    .join('L');
}

/** Een gesloten veelhoek als SVG-pad. */
export function polygonPath(outline: LatLng[], projection: Projection): string {
  return outline.length === 0 ? '' : `M${trace(outline, projection)}Z`;
}

/** Een open lijn als SVG-pad. */
export function linePath(points: LatLng[], projection: Projection): string {
  return points.length === 0 ? '' : `M${trace(points, projection)}`;
}

const EARTH = 6371000;
const RAD = Math.PI / 180;

/** Afstand in meter, haversine. */
export function metres(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}
