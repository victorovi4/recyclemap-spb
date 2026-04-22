import { getDriver, TypedValues } from "./ydb";

/** Проверка — есть ли этот email в whitelist-таблице admins. */
export async function isAdminEmail(email: string): Promise<boolean> {
  try {
    const driver = await getDriver();
    const rows = await driver.tableClient.withSession(async (session) => {
      const { resultSets } = await session.executeQuery(
        `DECLARE $email AS Utf8;
         SELECT email FROM admins WHERE email = $email LIMIT 1;`,
        { $email: TypedValues.utf8(email) },
      );
      return resultSets[0]?.rows ?? [];
    });
    return rows.length > 0;
  } catch (err) {
    console.error("isAdminEmail query failed:", err);
    return false;
  }
}
