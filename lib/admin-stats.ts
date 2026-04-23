import { getDriver } from "./ydb";

export type PointsBySource = { source: string; count: number };

export type CategoryWithCount = {
  id: string;
  label: string;
  color: string;
  icon: string; // emoji fallback
  icon_path: string | null;
  sort_order: number;
  point_count: number;
};

export type RecentPoint = {
  id: string;
  name: string;
  address: string;
  hours: string | null;
  phone: string | null;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = any;

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (v && typeof v === "object" && "toString" in v) return Number(v.toString());
  return 0;
}

export async function getPointsBySource(): Promise<PointsBySource[]> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session: RawRow) =>
    session.executeQuery(`SELECT source, COUNT(*) AS n FROM points GROUP BY source;`),
  );
  const rows = (result as RawRow).resultSets[0]?.rows ?? [];
  return rows.map((r: RawRow) => ({
    source: r.items[0].textValue ?? "unknown",
    count: asNumber(r.items[1].uint64Value ?? r.items[1].int64Value ?? 0),
  }));
}

export async function getCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const driver = await getDriver();
  const [catsResult, countResult] = await Promise.all([
    driver.tableClient.withSession(async (session: RawRow) =>
      session.executeQuery(
        `SELECT id, label, color, icon, icon_path, sort_order FROM categories ORDER BY sort_order;`,
      ),
    ),
    driver.tableClient.withSession(async (session: RawRow) =>
      session.executeQuery(
        `SELECT category_id, COUNT(*) AS n FROM point_categories GROUP BY category_id;`,
      ),
    ),
  ]);

  const countMap = new Map<string, number>();
  for (const r of ((countResult as RawRow).resultSets[0]?.rows ?? []) as RawRow[]) {
    countMap.set(
      r.items[0].textValue,
      asNumber(r.items[1].uint64Value ?? r.items[1].int64Value ?? 0),
    );
  }

  const categories = (((catsResult as RawRow).resultSets[0]?.rows ?? []) as RawRow[]).map(
    (r) => ({
      id: r.items[0].textValue,
      label: r.items[1].textValue,
      color: r.items[2].textValue,
      icon: r.items[3].textValue,
      icon_path: r.items[4]?.textValue ?? null,
      sort_order: asNumber(r.items[5].int32Value ?? 0),
      point_count: 0,
    }),
  );
  for (const c of categories) c.point_count = countMap.get(c.id) ?? 0;
  return categories;
}

export async function getRecentPoints(limit = 5): Promise<RecentPoint[]> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session: RawRow) =>
    session.executeQuery(
      `SELECT id, name, address, hours, phone, CAST(updated_at AS Utf8) AS ts
       FROM points WHERE source = "rsbor"
       ORDER BY updated_at DESC LIMIT ${Number(limit)};`,
    ),
  );
  const rows = (result as RawRow).resultSets[0]?.rows ?? [];
  return rows.map((r: RawRow) => ({
    id: r.items[0].textValue,
    name: r.items[1].textValue,
    address: r.items[2].textValue,
    hours: r.items[3]?.textValue ?? null,
    phone: r.items[4]?.textValue ?? null,
    updated_at: r.items[5]?.textValue ?? "",
  }));
}
