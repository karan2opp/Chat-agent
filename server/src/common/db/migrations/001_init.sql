CREATE EXTENSION IF NOT EXISTS vector;

-- One row per conversation turn. Nothing writes to it yet; it exists so the
-- DB is proven end to end and the memory layer has a home.
CREATE TABLE IF NOT EXISTS turns (
  id             BIGSERIAL PRIMARY KEY,
  session_id     TEXT        NOT NULL,
  ts_utc         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_text      TEXT        NOT NULL,
  assistant_text TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS turns_session_ts_idx ON turns (session_id, ts_utc);
