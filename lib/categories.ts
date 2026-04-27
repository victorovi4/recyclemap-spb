import type { CategoryId, PublicCategory } from "./types";
import { getDriver } from "./ydb";

export async function fetchAllCategories(): Promise<PublicCategory[]> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session) => {
    const query = `
      SELECT id, label, color, icon, icon_path, sort_order
      FROM categories
      ORDER BY sort_order;
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).executeQuery(query, {});
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).resultSets[0]?.rows ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    id: r.items[0].textValue as CategoryId,
    label: r.items[1].textValue as string,
    color: r.items[2].textValue as string,
    emoji: r.items[3].textValue as string,
    iconPath: (r.items[4]?.textValue as string | null) ?? null,
    sortOrder: (r.items[5].int32Value as number | undefined) ?? 0,
  }));
}
