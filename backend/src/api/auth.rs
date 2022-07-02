use crate::api::utils::AvatarOrDefault;
use crate::api::Snowflake;
use crate::api::DISCORD_CLIENT_ID;
use crate::api::DISCORD_CLIENT_SECRET;
use crate::db::models;
use crate::db::DbConn;
use crate::discord::management::get_guilds_for_user;
use crate::discord::management::UserPermission;
use crate::CacheHttp;
use crate::BASE_URL;
use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use bigdecimal::ToPrimitive;
use diesel::prelude::*;
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::AuthUrl;
use oauth2::AuthorizationCode;
use oauth2::ClientId;
use oauth2::ClientSecret;
use oauth2::CsrfToken;
use oauth2::PkceCodeChallenge;
use oauth2::PkceCodeVerifier;
use oauth2::RedirectUrl;
use oauth2::RequestTokenError;
use oauth2::Scope;
use oauth2::TokenResponse;
use oauth2::TokenUrl;
use rand::distributions::Alphanumeric;
use rand::rngs::OsRng;
use rand::Rng;
use rocket::get;
use rocket::http::Cookie;
use rocket::http::CookieJar;
use rocket::http::SameSite;
use rocket::http::Status;
use rocket::outcome::try_outcome;
use rocket::outcome::IntoOutcome;
use rocket::request;
use rocket::request::FromRequest;
use rocket::request::Outcome;
use rocket::response::status;
use rocket::response::Redirect;
use rocket::response::Responder;
use rocket::serde::json::Json;
use rocket::time::OffsetDateTime;
use rocket::Request;
use rocket::Route;
use rocket::State;
use serde::Deserialize;
use serde::Serialize;
use serde::Serializer;
use serde_with::serde_as;
use serde_with::TimestampSeconds;
use serenity::model::id::UserId as SerenityUserId;
use std::error::Error;
use std::iter;
use std::time::Duration;
use std::time::SystemTime;

static SESSION_COOKIE: &str = "auth_session";
static LOGIN_COOKIE: &str = "auth_login";

pub fn get_oauth_client() -> BasicClient {
    BasicClient::new(
        ClientId::new(DISCORD_CLIENT_ID.clone()),
        Some(ClientSecret::new(DISCORD_CLIENT_SECRET.clone())),
        AuthUrl::new("https://discord.com/api/oauth2/authorize".to_string())
            .expect("Parse discord auth url"),
        Some(
            TokenUrl::new("https://discord.com/api/oauth2/token".to_string())
                .expect("Parse discord token url"),
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(format!("{}/api/auth/login", BASE_URL.clone()))
            .expect("Create redirect url"),
    )
}

pub fn get_routes() -> Vec<Route> {
    routes![
        user,
        login_pre,
        login_post,
        login_error,
        logout,
        get_auth_token
    ]
}

#[derive(Debug, Clone)]
pub struct UserId(pub u64);

impl From<UserId> for SerenityUserId {
    fn from(user: UserId) -> Self {
        SerenityUserId(user.0)
    }
}

#[serde_as]
#[derive(Deserialize, Serialize, Debug)]
struct SessionInfo {
    #[serde_as(as = "TimestampSeconds<String>")]
    timestamp: SystemTime,
    user_id: Snowflake,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for UserId {
    type Error = ();

    /// Protected api endpoints can inject `User`.
    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        let cookies = request.cookies();
        cookies
            .get_private(SESSION_COOKIE)
            .and_then(|cookie| serde_json::from_str::<SessionInfo>(cookie.value()).ok())
            .and_then(|cookie| {
                let diff = SystemTime::now()
                    .duration_since(cookie.timestamp)
                    .ok()?
                    .as_secs();

                // If the session cookie is more than 7 days old, we ignore it. If it is more than 1h old,
                // we renew it. Otherwise, we do nothing.
                if diff > 60 * 60 * 24 * 7 {
                    return None;
                } else if diff > 60 * 60 {
                    if let Ok(data) = serde_json::to_string(&SessionInfo {
                        user_id: cookie.user_id.clone(),
                        timestamp: SystemTime::now(),
                    }) {
                        cookies.add_private(Cookie::new(SESSION_COOKIE, data));
                    }
                }

                Some(cookie)
            })
            .map(|session| Self(session.user_id.0))
            .into_outcome((Status::Unauthorized, ()))
    }
}

/// This represents a user that has authenticated using an auth token. Currently, there are is only one type of token
/// that has limited permissions. This struct is used to distinguish it from regular cookie authentication.
#[derive(Debug, Clone)]
pub struct TokenUserId(u64);

impl From<TokenUserId> for SerenityUserId {
    fn from(user: TokenUserId) -> Self {
        SerenityUserId(user.0)
    }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for TokenUserId {
    type Error = ();

    /// Protected api endpoints can inject `User`.
    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        const TOKEN_PREFIX: &str = "Bearer ";
        let db = try_outcome!(request.guard::<DbConn>().await);

        let header = request
            .headers()
            .get_one("Authorization")
            .and_then(|header_val| {
                if header_val.starts_with(TOKEN_PREFIX) {
                    Some(String::from(&header_val[TOKEN_PREFIX.len()..]))
                } else {
                    None
                }
            });

        if let Some(auth_token) = header {
            let res = db
                .run(move |c| {
                    use crate::db::schema::authtokens::dsl::*;

                    authtokens
                        .filter(token.eq(auth_token))
                        .first::<models::AuthToken>(c)
                })
                .await
                .ok()
                .and_then(|auth_token| {
                    let diff = SystemTime::now()
                        .duration_since(auth_token.creation_time)
                        .ok()?
                        .as_secs();

                    // Ignore the token if it is more than a week old
                    if diff > 60 * 60 * 24 * 7 {
                        None
                    } else {
                        Some(auth_token)
                    }
                })
                .and_then(|auth_token| auth_token.user_id.to_u64())
                .map(|user_id| TokenUserId(user_id));

            if let Some(uid) = res {
                return Outcome::Success(uid);
            }
        }

        request
            .guard::<UserId>()
            .await
            .map(|user_id| TokenUserId(user_id.0))
    }
}

#[derive(Responder, Debug)]
enum AuthError {
    #[response(status = 403)]
    CsrfMissmatch(String),
    #[response(status = 403)]
    MissingLoginCookie(String),
    #[response(status = 500)]
    RequestTokenError(String),
    #[response(status = 500)]
    UserDataError(String),
    #[response(status = 500)]
    InternalError(String),
}

impl AuthError {
    fn bigdecimal_error() -> Self {
        Self::InternalError(String::from("Number handling error"))
    }
}

impl<RE: Error, T: oauth2::ErrorResponse> From<RequestTokenError<RE, T>> for AuthError {
    fn from(err: RequestTokenError<RE, T>) -> Self {
        error!(?err, "Request token error in OAuth2 Flow");
        Self::RequestTokenError(String::from(
            "Error in OAuth2 Flow. Failed to fetch access token from Discord API.",
        ))
    }
}

impl From<reqwest::Error> for AuthError {
    fn from(err: reqwest::Error) -> Self {
        error!(?err, "Reqwest error in API call");
        Self::UserDataError(String::from("Failed to fetch user data from Discord API."))
    }
}

impl From<diesel::result::Error> for AuthError {
    fn from(err: diesel::result::Error) -> Self {
        error!(?err, "Diesel error in API call");
        Self::InternalError(String::from("Database operation failed."))
    }
}

impl From<serenity::Error> for AuthError {
    fn from(err: serenity::Error) -> Self {
        error!(?err, "Serenity request error in auth API call");
        Self::InternalError(String::from("Error communicating with the Discord API."))
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct User {
    id: Snowflake,
    username: String,
    discriminator: u16,
    avatar_url: String,
    guilds: Vec<GuildInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GuildInfo {
    id: Snowflake,
    name: String,
    icon_url: Option<String>,
    role: UserPermission,
}

impl Serialize for UserPermission {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(match *self {
            UserPermission::Admin => "admin",
            UserPermission::Moderator => "moderator",
            UserPermission::User => "user",
        })
    }
}

#[get("/user")]
async fn user(
    user: UserId,
    cache_http: &State<CacheHttp>,
    db: DbConn,
) -> Result<Json<User>, AuthError> {
    let s_user = SerenityUserId::from(user.clone())
        .to_user(cache_http.inner())
        .await
        .map_err(|_| {
            AuthError::InternalError(String::from("Failed to fetch user data from Discord API."))
        })?;

    let avatar_url = s_user.avatar_url_or_default();

    let user_id: SerenityUserId = user.into();
    let user_guilds = get_guilds_for_user(cache_http.inner(), &db, user_id).await?;
    let mut guilds = vec![];

    for (guild, perm) in user_guilds.into_iter() {
        guilds.push(GuildInfo {
            id: Snowflake(guild.id.0),
            icon_url: guild.icon_url(),
            name: guild.name,
            role: perm,
        });
    }

    Ok(Json(User {
        id: Snowflake(s_user.id.0),
        username: s_user.name,
        discriminator: s_user.discriminator,
        avatar_url,
        guilds,
    }))
}

#[get("/auth/login?<error>&<error_description>")]
fn login_error(error: String, error_description: String) -> status::Unauthorized<String> {
    warn!(?error, "Oauth2 request failed: {}", error_description);
    status::Unauthorized(Some(String::from(
        "OAuth2 Request to Discord API failed. Could not authenticate you.",
    )))
}

/// Login cookie data
#[derive(Deserialize, Serialize, Debug)]
struct LoginInfo {
    csrf_state: String,
    pkce_verifier: String,
}

/// A user as defined by the Discord API
#[serde_as]
#[derive(Deserialize, Debug)]
struct DiscordUser {
    id: Snowflake,
}

/// This is the callback of the oauth request
#[instrument(skip(cookies, oauth, db, code))]
#[get("/auth/login?<code>&<state>", rank = 2)]
async fn login_post(
    cookies: &CookieJar<'_>,
    oauth: &State<BasicClient>,
    db: DbConn,
    code: String,
    state: String,
) -> Result<Redirect, AuthError> {
    let login_cookie = cookies
        .get_private(LOGIN_COOKIE)
        .and_then(|cookie| serde_json::from_str::<LoginInfo>(cookie.value()).ok())
        .ok_or(AuthError::MissingLoginCookie(String::from(
            "Unknown login session",
        )))?;
    cookies.remove_private(Cookie::named(LOGIN_COOKIE));

    if state != login_cookie.csrf_state {
        return Err(AuthError::CsrfMissmatch(String::from(
            "Possible Cross Site Request Forgery attack detected",
        )));
    }

    let token_result = oauth
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(PkceCodeVerifier::new(login_cookie.pkce_verifier))
        .request_async(async_http_client)
        .await?;

    let access_token = token_result.access_token().secret();
    let user_info: DiscordUser = reqwest::Client::new()
        .get("https://discord.com/api/v8/users/@me")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?
        .json()
        .await?;
    let user_id = UserId(user_info.id.0);

    let m_user = BigDecimal::from_u64(user_id.0)
        .map(|uid| models::User {
            id: uid,
            last_login: SystemTime::now(),
        })
        .ok_or(AuthError::bigdecimal_error())?;
    db.run(move |c| {
        use crate::db::schema::users::dsl::*;

        diesel::insert_into(users)
            .values(&m_user)
            .on_conflict(id)
            .do_update()
            .set(&m_user)
            .execute(c)
    })
    .await?;

    let session = SessionInfo {
        timestamp: SystemTime::now(),
        user_id: Snowflake(user_id.0),
    };
    cookies.add_private(Cookie::new(
        SESSION_COOKIE,
        serde_json::to_string(&session)
            .map_err(|_| AuthError::InternalError(String::from("Failed to set session cookie.")))?,
    ));

    Ok(Redirect::to("/"))
}

/// This initializes the oauth request
#[instrument(skip(cookies, oauth))]
#[get("/auth/login", rank = 3)]
fn login_pre(cookies: &CookieJar<'_>, oauth: &State<BasicClient>) -> Result<Redirect, AuthError> {
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Generate the full authorization URL.
    let (auth_url, csrf_state) = oauth
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("identify".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    // Place the csrf token and pkce verifier as secure cookies on the client, expiring in 5 minutes
    cookies.add_private(
        Cookie::build(
            LOGIN_COOKIE,
            serde_json::to_string(&LoginInfo {
                csrf_state: csrf_state.secret().clone(),
                pkce_verifier: pkce_verifier.secret().clone(),
            })
            .map_err(|_| {
                AuthError::InternalError(String::from("Failed to set temporary cookie."))
            })?,
        )
        .expires(OffsetDateTime::now_utc() + Duration::from_secs(5 * 60))
        .same_site(SameSite::Lax)
        .finish(),
    );

    // Send redirect
    Ok(Redirect::to(auth_url.as_str().to_string()))
}

#[post("/auth/logout")]
fn logout(cookies: &CookieJar<'_>) -> String {
    cookies.remove_private(Cookie::named(SESSION_COOKIE));
    String::from("User logged out")
}

/// Beware: this replaces the current auth token by a new one. The old one becomes invalid.
#[post("/auth/gettoken")]
async fn get_auth_token(user: UserId, db: DbConn) -> Result<String, AuthError> {
    let uid = BigDecimal::from_u64(user.0).ok_or(AuthError::bigdecimal_error())?;
    let auth_token: String = iter::repeat(())
        .map(|_| OsRng.sample(Alphanumeric))
        .map(char::from)
        .take(32)
        .collect();

    {
        let auth_token = models::AuthToken {
            user_id: uid,
            token: auth_token.clone(),
            creation_time: SystemTime::now(),
        };
        db.run(move |c| {
            use crate::db::schema::authtokens::dsl::*;

            diesel::insert_into(authtokens)
                .values(&auth_token.clone())
                .on_conflict(user_id)
                .do_update()
                .set(auth_token)
                .execute(c)
        })
        .await?;
    }

    Ok(auth_token)
}
