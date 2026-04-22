export type RSBorScheduleDay = {
  dow: number; // 0=Пн, 1=Вт, ..., 6=Вс
  opens: string[];
  closes: string[];
};

const DOW_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatIntervals(opens: string[], closes: string[]): string {
  return opens.map((o, i) => `${o}–${closes[i] ?? "?"}`).join(", ");
}

export function formatSchedule(schedule: RSBorScheduleDay[]): string {
  if (schedule.length === 0) return "Не указано";

  const sorted = [...schedule].sort((a, b) => a.dow - b.dow);
  const groups: { start: number; end: number; intervals: string }[] = [];

  for (const day of sorted) {
    const intervals = formatIntervals(day.opens, day.closes);
    const last = groups[groups.length - 1];
    if (last && last.intervals === intervals && last.end === day.dow - 1) {
      last.end = day.dow;
    } else {
      groups.push({ start: day.dow, end: day.dow, intervals });
    }
  }

  return groups
    .map((g) => {
      const label = g.start === g.end
        ? DOW_RU[g.start]
        : `${DOW_RU[g.start]}–${DOW_RU[g.end]}`;
      return `${label} ${g.intervals}`;
    })
    .join(", ");
}

export function isSpbAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return address.toLowerCase().includes("санкт-петербург");
}

export function isSpbBbox(lat: number, lng: number): boolean {
  return lat >= 59.75 && lat <= 60.1 && lng >= 29.9 && lng <= 30.7;
}

export function parseGeom(geom: string): { lng: number; lat: number } {
  const match = /^POINT\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/.exec(geom);
  if (!match) throw new Error(`Invalid geom format: ${geom}`);
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (isNaN(lng) || isNaN(lat)) throw new Error(`Non-numeric coords in: ${geom}`);
  return { lng, lat };
}
