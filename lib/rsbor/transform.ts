export function parseGeom(geom: string): { lng: number; lat: number } {
  const match = /^POINT\(([-\d.]+)\s+([-\d.]+)\)$/.exec(geom);
  if (!match) throw new Error(`Invalid geom format: ${geom}`);
  return { lng: Number(match[1]), lat: Number(match[2]) };
}
