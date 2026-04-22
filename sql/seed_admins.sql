-- Whitelist административных email'ов для NextAuth-проверки.
-- PK — yandex_id (реальный ID приходит после первого OAuth-логина);
-- до первого логина храним как "seed-<slug>".
-- Проверка авторизации идёт по email (см. lib/admins.ts).
-- Идемпотентно: повторные UPSERT безопасны.

UPSERT INTO admins (yandex_id, email, role, created_at) VALUES
    ("seed-victorovi4-gmail", "victorovi4@gmail.com",  "admin", CurrentUtcTimestamp()),
    ("seed-dima-cleangames",  "dima@cleangames.org",   "admin", CurrentUtcTimestamp()),
    ("seed-mtr1305",          "mtr1305@yandex.ru",     "admin", CurrentUtcTimestamp()),
    ("seed-tulip-yulia",      "tulip-yulia@yandex.ru", "admin", CurrentUtcTimestamp());
