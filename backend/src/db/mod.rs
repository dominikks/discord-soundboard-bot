use diesel::PgConnection;
use rocket::Build;
use rocket::Rocket;
use rocket_sync_db_pools::database;

pub mod models;
pub mod schema;

#[database("postgres_database")]
pub struct DbConn(PgConnection);

pub async fn run_db_migrations(rocket: Rocket<Build>) -> Rocket<Build> {
    use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

    const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

    DbConn::get_one(&rocket)
        .await
        .expect("Database connection")
        .run(|c| {
            c.run_pending_migrations(MIGRATIONS)
                .expect("Diesel migrations");
        })
        .await;

    rocket
}
