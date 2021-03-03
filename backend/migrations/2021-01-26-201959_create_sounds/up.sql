CREATE TABLE sounds (
  id SERIAL PRIMARY KEY,
  guild_id NUMERIC NOT NULL,
  name VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  created_by_user_id NUMERIC,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_edited_by_user_id NUMERIC,
  last_edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  volume_adjustment REAL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id)
  ON DELETE SET NULL,
  FOREIGN KEY(last_edited_by_user_id) REFERENCES users(id)
  ON DELETE SET NULL
)