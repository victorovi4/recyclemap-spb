CREATE TABLE points (
    id Utf8 NOT NULL,
    name Utf8 NOT NULL,
    address Utf8 NOT NULL,
    lat Double NOT NULL,
    lng Double NOT NULL,
    hours Utf8,
    phone Utf8,
    website Utf8,
    description Utf8,
    status Utf8 NOT NULL,
    source Utf8 NOT NULL,
    source_id Utf8,
    photo_url Utf8,
    manually_edited Bool NOT NULL,
    created_at Timestamp NOT NULL,
    updated_at Timestamp NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_source_id GLOBAL ON (source, source_id)
    -- Индекс по (lat, lng) не создаём: YDB не поддерживает Double как ключ.
    -- Для 1000 точек bbox-фильтрация через SELECT ... WHERE lat BETWEEN ... AND lng BETWEEN ...
    -- работает без индекса.
);
