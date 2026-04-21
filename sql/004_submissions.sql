CREATE TABLE submissions (
    id Utf8 NOT NULL,
    type Utf8 NOT NULL,
    target_point_id Utf8,
    submitter_email Utf8 NOT NULL,
    payload Json NOT NULL,
    status Utf8 NOT NULL,
    admin_note Utf8,
    created_at Timestamp NOT NULL,
    reviewed_at Timestamp,
    PRIMARY KEY (id),
    INDEX idx_status GLOBAL ON (status, created_at)
);
