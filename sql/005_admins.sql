CREATE TABLE admins (
    yandex_id Utf8 NOT NULL,
    email Utf8 NOT NULL,
    role Utf8 NOT NULL,
    created_at Timestamp NOT NULL,
    PRIMARY KEY (yandex_id)
);
