use diesel::PgConnection;
use diesel_migrations::embed_migrations;
use rocket::Rocket;
use rocket_contrib::database;

pub mod models;
pub mod schema;

#[database("postgres_database")]
pub struct DbConn(PgConnection);

embed_migrations!();

pub async fn run_db_migrations(rocket: Rocket) -> Result<Rocket, Rocket> {
  DbConn::get_one(&rocket)
    .await
    .expect("database connection")
    .run(|c| match embedded_migrations::run(c) {
      Ok(()) => Ok(rocket),
      Err(e) => {
        error!("Failed to run database migrations: {:?}", e);
        Err(rocket)
      }
    })
    .await
}
