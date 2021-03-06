use crate::api::Snowflake;
use crate::api::UserId;
use crate::db::models;
use crate::db::DbConn;
use crate::discord::management::check_guild_admin;
use crate::discord::management::check_guild_moderator;
use crate::discord::management::get_guilds_for_user;
use crate::discord::management::PermissionError;
use crate::CacheHttp;
use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use bigdecimal::ToPrimitive;
use core::convert::TryFrom;
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use rocket::Route;
use rocket::State;
use rocket_contrib::json::Json;
use serde::Deserialize;
use serde::Serialize;
use serenity::model::id::GuildId;
use std::collections::HashMap;

pub fn get_routes() -> Vec<Route> {
  routes![
    get_all_random_infixes,
    set_random_infixes,
    get_guild_settings,
    set_guild_settings
  ]
}

#[derive(Debug, Responder)]
enum SettingsError {
  #[response(status = 500)]
  NumericalError(String),
  #[response(status = 500)]
  DieselError(String),
  #[response(status = 500)]
  SerenityError(String),
  #[response(status = 403)]
  InsufficientPermission(String),
}

impl SettingsError {
  fn bigdecimal_error() -> Self {
    Self::NumericalError(String::from("BigDecimal handling error."))
  }
}

impl From<DieselError> for SettingsError {
  fn from(err: DieselError) -> Self {
    error!(?err, "Diesel error in Random Infix API.");
    Self::DieselError(String::from("Failed to load data from database."))
  }
}

impl From<serenity::Error> for SettingsError {
  fn from(err: serenity::Error) -> Self {
    error!(?err, "Failed to load data from the Discord API");
    Self::SerenityError(String::from("Error fetching data from the Discord API."))
  }
}

impl From<PermissionError> for SettingsError {
  fn from(_: PermissionError) -> Self {
    Self::InsufficientPermission(String::from(
      "You do not have the permission to perform this action",
    ))
  }
}

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Debug)]
struct RandomInfix {
  guild_id: Snowflake,
  infix: String,
  display_name: String,
}

impl TryFrom<models::RandomInfix> for RandomInfix {
  type Error = ();

  fn try_from(infix: models::RandomInfix) -> Result<Self, Self::Error> {
    Ok(Self {
      guild_id: Snowflake(infix.guild_id.to_u64().ok_or(())?),
      infix: infix.infix,
      display_name: infix.display_name,
    })
  }
}

#[get("/randominfixes")]
async fn get_all_random_infixes(
  user: UserId,
  db: DbConn,
  cache_http: State<'_, CacheHttp>,
) -> Result<Json<Vec<RandomInfix>>, SettingsError> {
  use crate::db::schema::randominfixes::dsl::*;

  let guilds = get_guilds_for_user(cache_http.inner(), &db, user.into())
    .await?
    .into_iter()
    .map(|(guild, _)| BigDecimal::from_u64(guild.id.0))
    .collect::<Option<Vec<_>>>()
    .ok_or(SettingsError::bigdecimal_error())?;

  let infixes = db
    .run(move |c| {
      randominfixes
        .filter(guild_id.eq_any(&guilds))
        .load::<models::RandomInfix>(c)
    })
    .await?
    .into_iter()
    .map(|ri| RandomInfix::try_from(ri))
    .collect::<Result<Vec<_>, _>>()
    .map_err(|_| SettingsError::bigdecimal_error())?;

  Ok(Json(infixes))
}

#[serde(rename_all = "camelCase")]
#[derive(Deserialize, Debug)]
struct RandomInfixParameter {
  infix: String,
  display_name: String,
}

#[put("/guilds/<guild_id>/randominfixes", format = "json", data = "<params>")]
async fn set_random_infixes(
  guild_id: u64,
  user: UserId,
  db: DbConn,
  cache_http: State<'_, CacheHttp>,
  params: Json<Vec<RandomInfixParameter>>,
) -> Result<(), SettingsError> {
  check_guild_moderator(cache_http.inner(), &db, user.into(), GuildId(guild_id)).await?;

  let gid = BigDecimal::from_u64(guild_id).ok_or(SettingsError::bigdecimal_error())?;
  let random_infixes = params
    .into_inner()
    .into_iter()
    .map(|infix| models::RandomInfix {
      guild_id: gid.clone(),
      infix: infix.infix,
      display_name: infix.display_name,
    })
    .collect::<Vec<_>>();

  db.run(move |c| {
    use crate::db::schema::randominfixes::dsl::*;

    // Delete all infixes and reinsert them
    diesel::delete(randominfixes.filter(guild_id.eq(&gid)))
      .execute(c)
      .and_then(|_| {
        diesel::insert_into(randominfixes)
          .values(&random_infixes)
          .execute(c)
      })
  })
  .await?;

  Ok(())
}

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Debug)]
struct GuildSettings {
  user_role_id: Option<Snowflake>,
  moderator_role_id: Option<Snowflake>,
  target_max_volume: f32,
  target_mean_volume: f32,
  roles: HashMap<Snowflake, String>,
}

#[get("/guilds/<guild_id>/settings")]
async fn get_guild_settings(
  guild_id: u64,
  user: UserId,
  db: DbConn,
  cache_http: State<'_, CacheHttp>,
) -> Result<Json<GuildSettings>, SettingsError> {
  let guild_id = GuildId(guild_id);
  check_guild_admin(cache_http.inner(), user.into(), guild_id).await?;

  let gid = BigDecimal::from_u64(guild_id.0).ok_or(SettingsError::bigdecimal_error())?;
  let guild_settings = db
    .run(move |c| {
      use crate::db::schema::guildsettings::dsl::*;

      // Ensure that an entry for the guild is always present
      diesel::insert_into(guildsettings)
        .values(id.eq(gid.clone()))
        .on_conflict(id)
        .do_nothing()
        .execute(c)
        .and_then(|_| guildsettings.find(gid).first::<models::GuildSettings>(c))
    })
    .await?;

  let user_role_id = guild_settings
    .user_role_id
    .map(|role_id| role_id.to_u64().ok_or(SettingsError::bigdecimal_error()))
    .map_or(Ok(None), |r| r.map(Some))?
    .map(|rid| Snowflake(rid));
  let moderator_role_id = guild_settings
    .moderator_role_id
    .map(|role_id| role_id.to_u64().ok_or(SettingsError::bigdecimal_error()))
    .map_or(Ok(None), |r| r.map(Some))?
    .map(|rid| Snowflake(rid));

  let roles = guild_id
    .to_partial_guild(&cache_http.inner().http)
    .await?
    .roles
    .into_iter()
    .map(|(role_id, role)| (Snowflake(role_id.0), role.name))
    .collect::<HashMap<_, _>>();

  Ok(Json(GuildSettings {
    user_role_id,
    moderator_role_id,
    target_max_volume: guild_settings.target_max_volume,
    target_mean_volume: guild_settings.target_mean_volume,
    roles: roles,
  }))
}

#[serde(rename_all = "camelCase")]
#[derive(Deserialize, Debug)]
pub struct GuildSettingsParameter {
  #[serde(default, with = "::serde_with::rust::double_option")]
  user_role_id: Option<Option<Snowflake>>,
  #[serde(default, with = "::serde_with::rust::double_option")]
  moderator_role_id: Option<Option<Snowflake>>,
  target_max_volume: Option<f32>,
  target_mean_volume: Option<f32>,
}

#[put("/guilds/<guild_id>/settings", format = "json", data = "<params>")]
async fn set_guild_settings(
  guild_id: u64,
  user: UserId,
  db: DbConn,
  cache_http: State<'_, CacheHttp>,
  params: Json<GuildSettingsParameter>,
) -> Result<(), SettingsError> {
  let guild_id = GuildId(guild_id);
  check_guild_admin(cache_http.inner(), user.into(), guild_id).await?;

  let gid = BigDecimal::from_u64(guild_id.0).ok_or(SettingsError::bigdecimal_error())?;
  let params = params.into_inner();

  // We assume that the data is already present in the database at that point (queried at least once)
  db.run(move |c| -> Result<(), SettingsError> {
    use crate::db::schema::guildsettings;
    // Performing separate update queries feeld kinda hacky. However, I cannot be bothered to fight Diesel.

    if let Some(user_role_id) = params.user_role_id {
      let role_id = user_role_id
        .map(|rid| BigDecimal::from_u64(rid.0).ok_or(SettingsError::bigdecimal_error()))
        .map_or(Ok(None), |r| r.map(Some))?;

      diesel::update(guildsettings::table)
        .filter(guildsettings::id.eq(gid.clone()))
        .set(guildsettings::user_role_id.eq(role_id))
        .execute(c)?;
    }

    if let Some(moderator_role_id) = params.moderator_role_id {
      let role_id = moderator_role_id
        .map(|rid| BigDecimal::from_u64(rid.0).ok_or(SettingsError::bigdecimal_error()))
        .map_or(Ok(None), |r| r.map(Some))?;

      diesel::update(guildsettings::table)
        .filter(guildsettings::id.eq(gid.clone()))
        .set(guildsettings::moderator_role_id.eq(role_id))
        .execute(c)?;
    }

    if let Some(target_max_volume) = params.target_max_volume {
      diesel::update(guildsettings::table)
        .filter(guildsettings::id.eq(gid.clone()))
        .set(guildsettings::target_max_volume.eq(target_max_volume))
        .execute(c)?;
    }

    if let Some(target_mean_volume) = params.target_mean_volume {
      diesel::update(guildsettings::table)
        .filter(guildsettings::id.eq(gid))
        .set(guildsettings::target_mean_volume.eq(target_mean_volume))
        .execute(c)?;
    }

    Ok(())
  })
  .await
}
