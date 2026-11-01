use super::*;
use crate::db::DbConn;
use diesel::connection::SimpleConnection;
use diesel::RunQueryDsl;
use rocket::http::{ContentType, Cookie, CookieJar, Header, Status};
use rocket::local::asynchronous::Client as HttpClient;
use serenity::cache::Cache;
use serenity::http::HttpBuilder;
use serenity::model::event::GuildCreateEvent;
use serenity::model::guild::{Guild, Member, Role};
use serenity::model::id::{GuildId, RoleId, UserId as DiscordUserId};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

#[post("/session/<user>/<age>")]
fn session(user: u64, age: u64, cookies: &CookieJar<'_>) {
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - age;
    cookies.add_private(Cookie::new(
        "auth_session",
        serde_json::json!({"user_id": user.to_string(), "timestamp": timestamp.to_string()})
            .to_string(),
    ));
}

#[get("/session-user")]
fn session_user(user: auth::UserId) -> String {
    user.0.to_string()
}

fn discord_fixture() -> CacheHttp {
    let cache = Arc::new(Cache::default());
    let mut guild = Guild::default();
    guild.id = GuildId::new(100);
    guild.owner_id = DiscordUserId::new(1);
    guild.name = "Test guild".into();
    for id in [100, 10, 20] {
        let mut role = Role::default();
        role.id = RoleId::new(id);
        guild.roles.insert(role.id, role);
    }
    for (id, roles) in [(1, vec![]), (2, vec![20]), (3, vec![10]), (4, vec![])] {
        let mut member = Member::default();
        member.user.id = DiscordUserId::new(id);
        member.roles = roles.into_iter().map(RoleId::new).collect();
        guild.members.insert(member.user.id, member);
    }
    let mut event: GuildCreateEvent =
        serde_json::from_value(serde_json::to_value(guild).unwrap()).unwrap();
    cache.update(&mut event);
    CacheHttp {
        cache,
        // Any unexpected external request fails locally, never contacts Discord.
        http: Arc::new(
            HttpBuilder::new("fixture")
                .proxy("http://127.0.0.1:9")
                .build(),
        ),
    }
}

#[rocket::async_test]
async fn authenticated_sound_crud_permissions_and_playback() {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .expect("TEST_DATABASE_URL must point to a disposable PostgreSQL database");
    let figment = rocket::Config::figment()
        .merge((
            "databases.postgres_database",
            serde_json::json!({"url": database_url, "pool_size": 2}),
        ))
        .merge(("temp_dir", "data/test-uploads"));
    tokio::fs::create_dir_all("data/sounds").await.unwrap();
    tokio::fs::create_dir_all("data/test-uploads")
        .await
        .unwrap();
    let rocket = rocket::custom(figment)
        .attach(DbConn::fairing())
        .attach(AdHoc::on_ignite("Migrations", db::run_db_migrations))
        .mount("/test", routes![session, session_user])
        .mount("/api/sounds", sounds::get_routes())
        .mount("/api/guilds", commands::get_routes())
        .manage(discord_fixture())
        .manage(Client::new())
        .manage(EventBus::new());
    let http = HttpClient::tracked(rocket).await.unwrap();
    let db = DbConn::get_one(http.rocket()).await.unwrap();
    db.run(|conn| {
        diesel::sql_query("TRUNCATE soundfiles, sounds, authtokens, users, guildsettings CASCADE")
            .execute(conn)
            .unwrap();
        conn.batch_execute("INSERT INTO users (id, last_login) VALUES (1, NOW()), (2, NOW()), (3, NOW()), (4, NOW()); \
            INSERT INTO guildsettings (id, user_role_id, moderator_role_id) VALUES (100, 10, 20); \
            INSERT INTO authtokens (user_id, token, creation_time) VALUES (3, 'play-only', NOW())")
            .unwrap();
    })    .await;
    drop(db);

    assert_eq!(
        http.get("/test/session-user").dispatch().await.status(),
        Status::Unauthorized
    );
    assert_eq!(
        http.post("/api/guilds/100/stop").dispatch().await.status(),
        Status::Unauthorized
    );
    assert_eq!(
        http.get("/api/sounds")
            .header(Header::new("Authorization", "Bearer invalid"))
            .dispatch()
            .await
            .status(),
        Status::Unauthorized
    );
    // A plaintext cookie must not impersonate an authenticated session.
    assert_eq!(
        http.get("/test/session-user")
            .cookie(Cookie::new(
                "auth_session",
                r#"{"user_id":"1","timestamp":"9999999999"}"#
            ))
            .dispatch()
            .await
            .status(),
        Status::Unauthorized
    );
    http.post("/test/session/2/604801").dispatch().await;
    assert_eq!(
        http.get("/test/session-user").dispatch().await.status(),
        Status::Unauthorized
    );
    http.post("/test/session/2/3601").dispatch().await;
    let response = http.get("/test/session-user").dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    assert!(response
        .headers()
        .get("Set-Cookie")
        .any(|value| value.contains("auth_session=")));
    assert_eq!(response.into_string().await.unwrap(), "2");

    let payload = r#"{"guildId":"100","name":"Test sound","category":"effects"}"#;
    let created = http
        .post("/api/sounds")
        .header(ContentType::JSON)
        .body(payload)
        .dispatch()
        .await;
    assert_eq!(created.status(), Status::Ok);
    let sound: serde_json::Value = created.into_json().await.unwrap();
    assert_eq!(sound["guildId"], "100");
    assert_eq!(sound["name"], "Test sound");
    let id = sound["id"].as_str().unwrap().to_owned();
    let upload = http
        .post(format!("/api/sounds/{id}"))
        .header(ContentType::new("audio", "mpeg"))
        .body("not audio")
        .dispatch()
        .await;
    assert_eq!(upload.status(), Status::BadRequest);
    tokio::fs::write("data/test-uploads/fixture.wav", wav_fixture())
        .await
        .unwrap();
    let conversion = tokio::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            "data/test-uploads/fixture.wav",
            "data/test-uploads/fixture.mp3",
        ])
        .output()
        .await
        .unwrap();
    assert!(
        conversion.status.success(),
        "ffmpeg fixture generation failed"
    );
    let audio = tokio::fs::read("data/test-uploads/fixture.mp3")
        .await
        .unwrap();
    let uploaded = http
        .post(format!("/api/sounds/{id}"))
        .header(ContentType::new("audio", "mpeg"))
        .body(audio.clone())
        .dispatch()
        .await;
    assert_eq!(uploaded.status(), Status::Ok);
    let metadata: serde_json::Value = uploaded.into_json().await.unwrap();
    assert!((metadata["length"].as_f64().unwrap() - 1.0).abs() < 0.1);
    let downloaded = http.get(format!("/api/sounds/{id}")).dispatch().await;
    assert_eq!(downloaded.status(), Status::Ok);
    assert_eq!(downloaded.into_bytes().await.unwrap(), audio);
    assert_eq!(
        http.put(format!("/api/sounds/{id}"))
            .header(ContentType::JSON)
            .body(r#"{"name":"Renamed","volumeAdjustment":null}"#)
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    let sounds: serde_json::Value = http
        .get("/api/sounds")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    assert_eq!(sounds[0]["name"], "Renamed");
    assert!(sounds[0]["volumeAdjustment"].is_null());

    http.post("/test/session/3/0").dispatch().await;
    assert_eq!(
        http.post(format!("/api/guilds/100/play/{id}?autojoin=false"))
            .dispatch()
            .await
            .status(),
        Status::InternalServerError
    );
    assert_eq!(
        http.post("/api/sounds")
            .header(ContentType::JSON)
            .body(payload)
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    assert_eq!(
        http.delete(format!("/api/sounds/{id}"))
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    http.post("/test/session/4/0").dispatch().await;
    assert_eq!(
        http.get(format!("/api/sounds/{id}"))
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    assert_eq!(
        http.post("/api/guilds/100/stop").dispatch().await.status(),
        Status::Forbidden
    );
    // Valid command token grants membership, but never sound management.
    assert_eq!(
        http.post("/api/guilds/100/stop")
            .header(Header::new("Authorization", "Bearer play-only"))
            .dispatch()
            .await
            .status(),
        Status::InternalServerError
    );
    assert_eq!(
        http.post("/api/sounds")
            .header(Header::new("Authorization", "Bearer play-only"))
            .header(ContentType::JSON)
            .body(payload)
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    http.post("/test/session/1/0").dispatch().await;
    assert_eq!(
        http.get("/api/sounds/2147483647").dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        http.post("/api/sounds")
            .header(ContentType::JSON)
            .body(r#"{"guildId":100}"#)
            .dispatch()
            .await
            .status(),
        Status::UnprocessableEntity
    );
    assert_eq!(
        http.delete(format!("/api/sounds/{id}"))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        http.delete(format!("/api/sounds/{id}"))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    tokio::fs::remove_file("data/test-uploads/fixture.wav")
        .await
        .unwrap();
    tokio::fs::remove_file("data/test-uploads/fixture.mp3")
        .await
        .unwrap();
}

fn wav_fixture() -> Vec<u8> {
    let samples: Vec<i16> = (0..16000)
        .map(|index| {
            (0.25
                * i16::MAX as f32
                * (index as f32 * 440.0 * std::f32::consts::TAU / 16000.0).sin()) as i16
        })
        .collect();
    let length = (samples.len() * 2) as u32;
    let mut data = Vec::new();
    data.extend_from_slice(b"RIFF");
    data.extend_from_slice(&(36 + length).to_le_bytes());
    data.extend_from_slice(b"WAVEfmt ");
    data.extend_from_slice(&16u32.to_le_bytes());
    data.extend_from_slice(&1u16.to_le_bytes());
    data.extend_from_slice(&1u16.to_le_bytes());
    data.extend_from_slice(&16000u32.to_le_bytes());
    data.extend_from_slice(&32000u32.to_le_bytes());
    data.extend_from_slice(&2u16.to_le_bytes());
    data.extend_from_slice(&16u16.to_le_bytes());
    data.extend_from_slice(b"data");
    data.extend_from_slice(&length.to_le_bytes());
    for sample in samples {
        data.extend_from_slice(&sample.to_le_bytes());
    }
    data
}

#[rocket::async_test]
async fn disconnected_playback_fails_without_opening_sound_or_contacting_discord() {
    let client = Client::new();
    let guild = GuildId::new(100);
    assert!(matches!(
        client.stop(guild).await,
        Err(crate::discord::client::ClientError::NotInAChannel)
    ));
    assert!(matches!(
        client.play("does-not-exist.mp3", 0.0, guild).await,
        Err(crate::discord::client::ClientError::NotInAChannel)
    ));
    assert!(matches!(
        client.leave(guild).await,
        Err(crate::discord::client::ClientError::NotInAChannel)
    ));
    assert!(matches!(
        client
            .join_user(guild, DiscordUserId::new(3), &discord_fixture())
            .await,
        Err(crate::discord::client::ClientError::UserNotFound)
    ));
    tokio::time::timeout(Duration::from_secs(1), client.stop(guild))
        .await
        .unwrap()
        .unwrap_err();
}
