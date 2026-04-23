// Локальный запуск импорта без Serverless-ограничений (10-мин LB, 15-мин
// execution_timeout). Используется для первого прогона и отладки.
// Env переменные передаются снаружи (см. README / docs).
//
// Запуск:
//   YC_TOKEN=$(yc iam create-token) \
//   YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135 \
//   YDB_DATABASE=/ru-central1/.../... \
//   RESEND_API_KEY=re_... \
//   IMPORT_REPORT_TO=you@example.com \
//   npx tsx scripts/run-import.ts

import { runImport } from "../lib/importers/rsbor";

runImport()
  .then((stats) => {
    console.log("\n=== IMPORT DONE ===");
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n=== IMPORT FAILED ===");
    console.error(err);
    process.exit(1);
  });
