export function parseGeom(geom: string): { lng: number; lat: number } {
  const match = /^POINT\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/.exec(geom);
  if (!match) throw new Error(`Invalid geom format: ${geom}`);
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (isNaN(lng) || isNaN(lat)) throw new Error(`Non-numeric coords in: ${geom}`);
  return { lng, lat };
}
