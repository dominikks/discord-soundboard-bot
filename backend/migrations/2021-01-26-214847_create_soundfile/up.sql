CREATE TABLE soundfiles (
  sound_id INTEGER PRIMARY KEY NOT NULL,
  file_name VARCHAR(64) NOT NULL,
  max_volume REAL NOT NULL,
  mean_volume REAL NOT NULL,
  length REAL NOT NULL,
  uploaded_by_user_id NUMERIC,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sound_id) REFERENCES sounds(id)
  ON DELETE RESTRICT,
  FOREIGN KEY(uploaded_by_user_id) REFERENCES users(id)
  ON DELETE SET NULL
)