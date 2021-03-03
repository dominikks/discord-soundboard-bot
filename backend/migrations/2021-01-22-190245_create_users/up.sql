CREATE TABLE users (
  id NUMERIC PRIMARY KEY NOT NULL,
  last_login TIMESTAMP NOT NULL,
  constraint id_nonnegative check (id >= 0)
)