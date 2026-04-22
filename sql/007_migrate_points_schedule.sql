-- Phase B — добавляем колонку schedule_json для сырой структуры расписания от РС.
-- Поле hours Utf8? остаётся (туда пишем отформатированный текст).

ALTER TABLE points ADD COLUMN schedule_json Json;
