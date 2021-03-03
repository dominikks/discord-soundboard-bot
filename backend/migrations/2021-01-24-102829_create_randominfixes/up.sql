CREATE TABLE randominfixes (
  guild_id NUMERIC NOT NULL,
  infix VARCHAR(32) NOT NULL,
  display_name VARCHAR(32) NOT NULL,
  PRIMARY KEY(guild_id, infix)
)