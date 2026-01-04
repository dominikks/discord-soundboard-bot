use crate::db::DbConn;
use crate::CacheHttp;
use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use bigdecimal::ToPrimitive;
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use serenity::model::guild::Guild;
use serenity::model::guild::Member;
use serenity::model::id::GuildId;
use serenity::model::id::UserId;

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum UserPermission {
    Admin,
    Moderator,
    User,
}

#[derive(Debug)]
pub struct PermissionResponse {
    pub permission: UserPermission,
    pub member: Member,
}

pub enum PermissionError {
    InsufficientPermission,
    DieselError(DieselError),
    BigDecimalError,
}

impl From<DieselError> for PermissionError {
    fn from(err: DieselError) -> Self {
        PermissionError::DieselError(err)
    }
}

pub async fn check_guild_user(
    cache_http: &CacheHttp,
    db: &DbConn,
    user_id: UserId,
    guild_id: GuildId,
) -> Result<PermissionResponse, PermissionError> {
    get_permission_level(cache_http, db, user_id, guild_id).await
}

pub async fn check_guild_moderator(
    cache_http: &CacheHttp,
    db: &DbConn,
    user_id: UserId,
    guild_id: GuildId,
) -> Result<PermissionResponse, PermissionError> {
    let response = get_permission_level(cache_http, db, user_id, guild_id).await?;

    if response.permission == UserPermission::Admin
        || response.permission == UserPermission::Moderator
    {
        Ok(response)
    } else {
        Err(PermissionError::InsufficientPermission)
    }
}

pub async fn check_guild_admin(
    cache_http: &CacheHttp,
    user_id: UserId,
    guild_id: GuildId,
) -> Result<(), PermissionError> {
    let member = guild_id
        .member(cache_http, user_id)
        .await
        .map_err(|_| PermissionError::InsufficientPermission)?;

    member
        .permissions(cache_http)
        .ok()
        .and_then(|perms| {
            if perms.administrator() {
                Some(())
            } else {
                None
            }
        })
        .ok_or(PermissionError::InsufficientPermission)
}

pub async fn get_permission_level(
    cache_http: &CacheHttp,
    db: &DbConn,
    user_id: UserId,
    guild_id: GuildId,
) -> Result<PermissionResponse, PermissionError> {
    let member = guild_id
        .member(cache_http, user_id)
        .await
        .map_err(|_| PermissionError::InsufficientPermission)?;

    if member
        .permissions(cache_http)
        .map(|perms| perms.administrator())
        .unwrap_or(false)
    {
        return Ok(PermissionResponse {
            member,
            permission: UserPermission::Admin,
        });
    }

    let gid = BigDecimal::from_u64(guild_id.get()).ok_or(PermissionError::BigDecimalError)?;
    let (user_role_id, moderator_role_id) = db
        .run(move |c| {
            use crate::db::schema::guildsettings::dsl::*;
            guildsettings
                .find(gid)
                .select((user_role_id, moderator_role_id))
                .first::<(Option<BigDecimal>, Option<BigDecimal>)>(c)
                .optional()
        })
        .await?
        .unwrap_or((None, None));

    if let Some(moderator_role_id) = moderator_role_id {
        let rid = moderator_role_id
            .to_u64()
            .ok_or(PermissionError::BigDecimalError)?;

        if member.roles.iter().any(|role| role.0 == rid) {
            return Ok(PermissionResponse {
                member,
                permission: UserPermission::Moderator,
            });
        }
    }

    if let Some(user_role_id) = user_role_id {
        let rid = user_role_id
            .to_u64()
            .ok_or(PermissionError::BigDecimalError)?;

        if member.roles.iter().any(|role| role.0 == rid) {
            return Ok(PermissionResponse {
                member,
                permission: UserPermission::User,
            });
        }
    }

    Err(PermissionError::InsufficientPermission)
}

#[instrument(skip(cache_http, db), err)]
pub async fn get_guilds_for_user(
    cache_http: &CacheHttp,
    db: &DbConn,
    user_id: UserId,
) -> Result<Vec<(Guild, UserPermission)>, serenity::Error> {
    let mut response = vec![];
    for guild_id in cache_http.cache.guilds() {
        if let Ok(perm) = get_permission_level(cache_http, db, user_id, guild_id).await {
            if let Some(guild) = guild_id.to_guild_cached(&cache_http.cache) {
                response.push((guild, perm.permission));
            }
        }
    }
    Ok(response)
}
