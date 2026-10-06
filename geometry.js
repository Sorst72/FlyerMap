import { feature, featureCollection, area, difference, intersect, kinks } from '@turf/turf';
export const legacyGeometry = polygon => ({ type:'Polygon', coordinates:[[...polygon.map(([lat,lng]) => [lng,lat]), [polygon[0][1],polygon[0][0]]]] });
export function validGeometry(g) {
  if (!g || !['Polygon','MultiPolygon'].includes(g.type)) return false;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 100) return false;
  let count = 0;
  for (const rings of polygons) {
    if (!Array.isArray(rings) || !rings.length) return false;
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      count += ring.length;
      if (count > 10000 || !ring.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return false;
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return false;
    }
  }
  try { return area(feature(g)) > 1 && kinks(feature(g)).features.length === 0; } catch { return false; }
}
export function inside(child, parent) {
  const remainder = difference(featureCollection([feature(child), feature(parent)]));
  return !remainder || area(remainder) < 0.01;
}
export function overlaps(a,b) {
  const intersection = intersect(featureCollection([feature(a), feature(b)]));
  return !!intersection && area(intersection) > 0.01;
}
