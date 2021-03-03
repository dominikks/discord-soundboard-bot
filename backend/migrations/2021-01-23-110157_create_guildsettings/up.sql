CREATE TABLE guildsettings (
  id NUMERIC PRIMARY KEY NOT NULL,
  user_role_id NUMERIC,
  moderator_role_id NUMERIC,
  target_max_volume REAL NOT NULL DEFAULT 0,
  target_mean_volume REAL NOT NULL DEFAULT -13
)