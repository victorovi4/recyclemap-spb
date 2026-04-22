import type { CategoryId } from "./types";
import { getDriver, TypedValues } from "./ydb";

export type PointRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string | null;
  hours: string | null;
  schedule_json: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  status: string;
  source: string;
  source_id: string | null;
  categoryIds: CategoryId[];
};

export type ExistingPoint = {
  id: string;
  manually_edited: boolean;
  data: PointRow;
};

export function pointsEqual(a: PointRow, b: PointRow): boolean {
  const scalarEqual =
    a.id === b.id &&
    a.source === b.source &&
    a.source_id === b.source_id &&
    a.name === b.name &&
    a.address === b.address &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.description === b.description &&
    a.hours === b.hours &&
    a.schedule_json === b.schedule_json &&
    a.phone === b.phone &&
    a.website === b.website &&
    a.photo_url === b.photo_url &&
    a.status === b.status;
  if (!scalarEqual) return false;

  const aCats = [...a.categoryIds].sort().join(",");
  const bCats = [...b.categoryIds].sort().join(",");
  return aCats === bCats;
}

// Find by (source, source_id). Returns null if not found.
export async function findBySource(
  source: string,
  sourceId: string,
): Promise<ExistingPoint | null> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $source AS Utf8;
      DECLARE $source_id AS Utf8;
      SELECT p.id, p.name, p.address, p.lat, p.lng, p.description, p.hours,
             p.schedule_json, p.phone, p.website, p.photo_url, p.status,
             p.source, p.source_id, p.manually_edited,
             (SELECT AGG_LIST(category_id) FROM point_categories WHERE point_id = p.id) AS cats
      FROM points AS p
      WHERE p.source = $source AND p.source_id = $source_id;
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).executeQuery(query, {
      $source: TypedValues.utf8(source),
      $source_id: TypedValues.utf8(sourceId),
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).resultSets[0]?.rows ?? [];
  if (rows.length === 0) return null;

  const r = rows[0].items as unknown as RawRow[];
  const data: PointRow = {
    id: r[0].textValue!,
    name: r[1].textValue!,
    address: r[2].textValue!,
    lat: r[3].doubleValue!,
    lng: r[4].doubleValue!,
    description: r[5].textValue ?? null,
    hours: r[6].textValue ?? null,
    schedule_json: r[7].textValue ?? null,
    phone: r[8].textValue ?? null,
    website: r[9].textValue ?? null,
    photo_url: r[10].textValue ?? null,
    status: r[11].textValue!,
    source: r[12].textValue!,
    source_id: r[13].textValue ?? null,
    categoryIds: (r[15].items?.map((i) => i.textValue!) ?? []) as CategoryId[],
  };

  return {
    id: data.id,
    manually_edited: r[14].boolValue ?? false,
    data,
  };
}

type RawRow = {
  textValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  int32Value?: number;
  items?: RawRow[];
};

export async function insertPoint(row: PointRow): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $address AS Utf8;
      DECLARE $lat AS Double; DECLARE $lng AS Double;
      DECLARE $hours AS Utf8?; DECLARE $phone AS Utf8?; DECLARE $website AS Utf8?;
      DECLARE $description AS Utf8?; DECLARE $schedule_json AS Json?;
      DECLARE $status AS Utf8; DECLARE $source AS Utf8; DECLARE $source_id AS Utf8?;
      DECLARE $photo_url AS Utf8?; DECLARE $ts AS Timestamp;
      UPSERT INTO points
        (id, name, address, lat, lng, hours, phone, website, description,
         schedule_json, status, source, source_id, photo_url,
         manually_edited, created_at, updated_at)
      VALUES
        ($id, $name, $address, $lat, $lng, $hours, $phone, $website, $description,
         $schedule_json, $status, $source, $source_id, $photo_url,
         false, $ts, $ts);
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session as any).executeQuery(query, {
      $id: TypedValues.utf8(row.id),
      $name: TypedValues.utf8(row.name),
      $address: TypedValues.utf8(row.address),
      $lat: TypedValues.double(row.lat),
      $lng: TypedValues.double(row.lng),
      $hours: TypedValues.optional(TypedValues.utf8(row.hours ?? "")),
      $phone: TypedValues.optional(TypedValues.utf8(row.phone ?? "")),
      $website: TypedValues.optional(TypedValues.utf8(row.website ?? "")),
      $description: TypedValues.optional(TypedValues.utf8(row.description ?? "")),
      $schedule_json: TypedValues.optional(TypedValues.json(row.schedule_json ?? "null")),
      $status: TypedValues.utf8(row.status),
      $source: TypedValues.utf8(row.source),
      $source_id: TypedValues.optional(TypedValues.utf8(row.source_id ?? "")),
      $photo_url: TypedValues.optional(TypedValues.utf8(row.photo_url ?? "")),
      $ts: TypedValues.timestamp(new Date()),
    });
  });
  await replacePointCategories(row.id, row.categoryIds);
}

export async function updatePoint(row: PointRow): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $address AS Utf8;
      DECLARE $lat AS Double; DECLARE $lng AS Double;
      DECLARE $hours AS Utf8?; DECLARE $phone AS Utf8?; DECLARE $website AS Utf8?;
      DECLARE $description AS Utf8?; DECLARE $schedule_json AS Json?;
      DECLARE $photo_url AS Utf8?; DECLARE $ts AS Timestamp;
      UPDATE points SET
        name = $name, address = $address, lat = $lat, lng = $lng,
        hours = $hours, phone = $phone, website = $website, description = $description,
        schedule_json = $schedule_json, photo_url = $photo_url, updated_at = $ts
      WHERE id = $id;
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session as any).executeQuery(query, {
      $id: TypedValues.utf8(row.id),
      $name: TypedValues.utf8(row.name),
      $address: TypedValues.utf8(row.address),
      $lat: TypedValues.double(row.lat),
      $lng: TypedValues.double(row.lng),
      $hours: TypedValues.optional(TypedValues.utf8(row.hours ?? "")),
      $phone: TypedValues.optional(TypedValues.utf8(row.phone ?? "")),
      $website: TypedValues.optional(TypedValues.utf8(row.website ?? "")),
      $description: TypedValues.optional(TypedValues.utf8(row.description ?? "")),
      $schedule_json: TypedValues.optional(TypedValues.json(row.schedule_json ?? "null")),
      $photo_url: TypedValues.optional(TypedValues.utf8(row.photo_url ?? "")),
      $ts: TypedValues.timestamp(new Date()),
    });
  });
  await replacePointCategories(row.id, row.categoryIds);
}

async function replacePointCategories(pointId: string, categoryIds: string[]): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session as any).executeQuery(
      `DECLARE $pid AS Utf8; DELETE FROM point_categories WHERE point_id = $pid;`,
      { $pid: TypedValues.utf8(pointId) },
    );
    for (const cid of categoryIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (session as any).executeQuery(
        `DECLARE $pid AS Utf8; DECLARE $cid AS Utf8;
         UPSERT INTO point_categories (point_id, category_id) VALUES ($pid, $cid);`,
        { $pid: TypedValues.utf8(pointId), $cid: TypedValues.utf8(cid) },
      );
    }
  });
}

export async function fetchRsborIdMap(): Promise<Map<number, CategoryId>> {
  const driver = await getDriver();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await driver.tableClient.withSession(async (session) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).executeQuery(`SELECT id, rsbor_id FROM categories WHERE rsbor_id IS NOT NULL;`),
  );
  const map = new Map<number, CategoryId>();
  for (const row of result.resultSets[0]?.rows ?? []) {
    const items = row.items as unknown as RawRow[];
    map.set(items[1].int32Value!, items[0].textValue! as CategoryId);
  }
  return map;
}
