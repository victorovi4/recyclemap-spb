import {
  parseAsArrayOf,
  parseAsString,
  createParser,
} from "nuqs";
import type { CategoryId } from "./types";

const VALID_CATS: ReadonlySet<CategoryId> = new Set([
  "plastic",
  "glass",
  "paper",
  "metal",
  "batteries",
  "electronics",
  "tetrapak",
  "textile",
  "lamps",
  "caps",
  "tires",
  "hazardous",
  "other",
]);

const COMMON = { history: "replace" as const, shallow: true };

/**
 * fractionsParser — список выбранных категорий через запятую.
 * - "plastic,glass" → ["plastic", "glass"]
 * - "" → [] (явно пустой выбор)
 * - параметр отсутствует → null (HomeClient интерпретирует как «все включены»)
 */
export const fractionsParser = parseAsArrayOf(
  parseAsString,
  ",",
).withOptions(COMMON);

/**
 * Постфильтрация: отбрасываем id, которых нет в нашем словаре.
 * Защита от мусорных URL.
 */
export function sanitizeFractions(arr: string[] | null): CategoryId[] | null {
  if (arr === null) return null;
  return arr.filter((x): x is CategoryId =>
    VALID_CATS.has(x as CategoryId),
  );
}

/**
 * llParser — координаты центра карты "lat,lng" с 4 знаками после запятой.
 * Невалидные значения, выход за диапазон → null.
 */
export const llParser = createParser({
  parse(v: string): [number, number] | null {
    const parts = v.split(",");
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  },
  serialize(v: [number, number]): string {
    return `${v[0].toFixed(4)},${v[1].toFixed(4)}`;
  },
}).withOptions(COMMON);

/**
 * zoomParser — целочисленный zoom в диапазоне 8..18.
 * Вне диапазона / нечисло → null.
 */
export const zoomParser = createParser({
  parse(v: string): number | null {
    if (!/^-?\d+$/.test(v)) return null;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    if (n < 8 || n > 18) return null;
    return n;
  },
  serialize(v: number): string {
    return String(v);
  },
}).withOptions(COMMON);
