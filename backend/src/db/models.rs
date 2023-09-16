use crate::db::schema::*;
use bigdecimal::BigDecimal;
use std::time::SystemTime;

#[derive(Queryable, Insertable, Identifiable, Debug, Clone)]
#[diesel(table_name = guildsettings)]
pub struct GuildSettings {
    pub id: BigDecimal,
    pub user_role_id: Option<BigDecimal>,
    pub moderator_role_id: Option<BigDecimal>,
    pub target_max_volume: f32,
    pub target_mean_volume: f32,
}

#[derive(Queryable, Insertable, AsChangeset, Identifiable, Debug)]
#[diesel(table_name = users)]
pub struct User {
    pub id: BigDecimal,
    pub last_login: SystemTime,
}

#[derive(Queryable, Insertable, AsChangeset, Identifiable, Debug)]
#[diesel(table_name = randominfixes)]
#[diesel(primary_key(guild_id, infix))]
pub struct RandomInfix {
    pub guild_id: BigDecimal,
    pub infix: String,
    pub display_name: String,
}

#[derive(Queryable, Insertable, AsChangeset, Identifiable, Debug, Clone)]
#[diesel(table_name = authtokens)]
#[diesel(primary_key(user_id))]
pub struct AuthToken {
    pub user_id: BigDecimal,
    pub token: String,
    pub creation_time: SystemTime,
}

#[derive(Queryable, Insertable, Identifiable, Debug, Clone)]
#[diesel(table_name = sounds)]
pub struct Sound {
    pub id: i32,
    pub guild_id: BigDecimal,
    pub name: String,
    pub category: String,
    pub created_by_user_id: Option<BigDecimal>,
    pub created_at: SystemTime,
    pub last_edited_by_user_id: Option<BigDecimal>,
    pub last_edited_at: SystemTime,
    pub volume_adjustment: Option<f32>,
}

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = sounds)]
pub struct SoundChangeset {
    pub name: Option<String>,
    pub category: Option<String>,
    pub volume_adjustment: Option<Option<f32>>,
}

#[derive(Queryable, Insertable, AsChangeset, Identifiable, Debug, Clone)]
#[diesel(table_name = soundfiles)]
#[diesel(primary_key(sound_id))]
pub struct Soundfile {
    pub sound_id: i32,
    pub file_name: String,
    pub max_volume: f32,
    pub mean_volume: f32,
    pub length: f32,
    pub uploaded_by_user_id: Option<BigDecimal>,
    pub uploaded_at: SystemTime,
}
