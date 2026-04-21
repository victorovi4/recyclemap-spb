import { Driver, getCredentialsFromEnv } from "ydb-sdk";

let driverPromise: Promise<Driver> | null = null;

/**
 * Singleton YDB driver. Lazily initialized on first call.
 *
 * Credentials source:
 *   - В проде: контейнер получает service-account credentials автоматически
 *     через метаданные YC (getCredentialsFromEnv распознаёт)
 *   - Локально: `yc iam create-token` → экспортировать как YC_TOKEN
 */
export function getDriver(): Promise<Driver> {
  if (driverPromise) return driverPromise;

  const endpoint = process.env.YDB_ENDPOINT;
  const database = process.env.YDB_DATABASE;

  if (!endpoint || !database) {
    throw new Error("YDB_ENDPOINT and YDB_DATABASE env vars are required");
  }

  driverPromise = (async () => {
    const driver = new Driver({
      endpoint,
      database,
      authService: getCredentialsFromEnv(),
    });
    const ready = await driver.ready(10_000);
    if (!ready) throw new Error("YDB driver failed to initialize within 10s");
    return driver;
  })();

  return driverPromise;
}
