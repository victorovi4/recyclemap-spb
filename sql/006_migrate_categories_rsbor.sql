-- Phase B — расширение categories под таксономию РС (13 категорий).
-- Применяется однократно. ALTER TABLE ADD COLUMN идемпотентен в YDB только если
-- колонки нет; повторный запуск упадёт — это нормально.

ALTER TABLE categories ADD COLUMN rsbor_id Int32;
ALTER TABLE categories ADD COLUMN icon_path Utf8;

UPDATE categories SET rsbor_id = 1,  color = "#4085F3", icon_path = "/icons/fractions/paper.svg"      WHERE id = "paper";
UPDATE categories SET rsbor_id = 2,  color = "#ED671C", icon_path = "/icons/fractions/plastic.svg"    WHERE id = "plastic";
UPDATE categories SET rsbor_id = 3,  color = "#227440", icon_path = "/icons/fractions/glass.svg"      WHERE id = "glass";
UPDATE categories SET rsbor_id = 4,  color = "#E83623", icon_path = "/icons/fractions/metall.svg"     WHERE id = "metal";
UPDATE categories SET rsbor_id = 5,  color = "#2CC0A5", icon_path = "/icons/fractions/tetrapack.svg"  WHERE id = "tetrapak";
UPDATE categories SET rsbor_id = 6,  color = "#EA4C99", icon_path = "/icons/fractions/clothes.svg"    WHERE id = "textile";
UPDATE categories SET rsbor_id = 9,  color = "#C06563", icon_path = "/icons/fractions/appliances.svg" WHERE id = "electronics";
UPDATE categories SET rsbor_id = 10, color = "#C8744E", icon_path = "/icons/fractions/battery.svg"    WHERE id = "batteries";

UPSERT INTO categories (id, label, color, icon, icon_path, rsbor_id, sort_order) VALUES
    ("lamps",     "Лампочки",       "#8F6EEF", "💡", "/icons/fractions/lightbulbs.svg", 7,  9),
    ("caps",      "Крышечки",       "#DAA219", "🎩", "/icons/fractions/caps.svg",        8,  10),
    ("tires",     "Шины",           "#6F4D41", "🛞", "/icons/fractions/tires.svg",       11, 11),
    ("hazardous", "Опасные отходы", "#242627", "☣️", "/icons/fractions/dangerous.svg",   12, 12),
    ("other",     "Прочее",         "#3EB8DE", "♻️", "/icons/fractions/other.svg",       13, 13);
