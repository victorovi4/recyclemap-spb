-- Phase B — расширение схемы categories под таксономию РС.
-- DDL и DML в YDB нельзя смешивать в одном запросе (DML не "видит" свежедобавленные
-- колонки в том же batch'е), поэтому seed-данные вынесены в
-- `006b_seed_rsbor_categories.sql` — применять после этого файла.
--
-- ALTER TABLE ADD COLUMN не идемпотентен: повторный запуск упадёт с ошибкой
-- "column already exists" — это нормально, значит миграция уже применена.

ALTER TABLE categories ADD COLUMN rsbor_id Int32;
ALTER TABLE categories ADD COLUMN icon_path Utf8;
