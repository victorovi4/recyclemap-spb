import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PointRow } from "../lib/ydb-points";
import { fetchAllPoints, insertPoint } from "../lib/ydb-points";
import type { CategoryId } from "../lib/types";

type LegacyPoint = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categories: CategoryId[];
  hours: string;
  phone: string;
  website: string;
  description: string;
};

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // м
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findDuplicateByRadius(
  needle: { lat: number; lng: number },
  haystack: { id: string; lat: number; lng: number }[],
  radiusMeters: number,
): { id: string; distanceMeters: number } | null {
  let best: { id: string; distanceMeters: number } | null = null;
  for (const h of haystack) {
    const d = haversineMeters(needle.lat, needle.lng, h.lat, h.lng);
    if (d <= radiusMeters && (!best || d < best.distanceMeters)) {
      best = { id: h.id, distanceMeters: d };
    }
  }
  return best;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[а-я]/g, (c) => {
      const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
        ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[c] ?? "";
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const file = resolve(process.cwd(), "data/points.json");
  const legacy = JSON.parse(readFileSync(file, "utf-8")) as LegacyPoint[];
  console.log(`📥 Loaded ${legacy.length} legacy points from data/points.json`);

  const existing = await fetchAllPoints();
  console.log(`🗄  YDB сейчас содержит ${existing.length} точек`);

  let created = 0;
  let skipped = 0;

  for (const m of legacy) {
    const dup = findDuplicateByRadius(m, existing, 150);
    if (dup) {
      console.log(
        `⊘ "${m.name}" — дубль с ${dup.id} (${dup.distanceMeters.toFixed(0)} м), пропуск`,
      );
      skipped++;
      continue;
    }

    const id = `manual-${slugify(m.name)}-${m.lat.toFixed(4)}`;
    const row: PointRow = {
      id,
      name: m.name,
      address: m.address,
      lat: m.lat,
      lng: m.lng,
      description: m.description || null,
      hours: m.hours || null,
      schedule_json: null,
      phone: m.phone || null,
      website: m.website || null,
      photo_url: null,
      status: "active",
      source: "manual",
      source_id: null,
      categoryIds: m.categories,
    };

    await insertPoint(row);
    console.log(`+ "${m.name}" → ${id}`);
    created++;
  }

  console.log(`\n✅ Migration done: created ${created}, skipped ${skipped}`);
}

// Запускаем main() только когда файл вызван как CLI (а не импортирован тестом).
// `process.argv[1]` — путь к стартовому скрипту; tsx сохраняет имя файла.
const startedAsCli =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  /migrate-legacy-points\.ts$/.test(process.argv[1]);

if (startedAsCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
