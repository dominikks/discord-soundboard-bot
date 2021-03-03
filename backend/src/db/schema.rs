table! {
    authtokens (user_id) {
        user_id -> Numeric,
        token -> Varchar,
        creation_time -> Timestamp,
    }
}

table! {
    guildsettings (id) {
        id -> Numeric,
        user_role_id -> Nullable<Numeric>,
        moderator_role_id -> Nullable<Numeric>,
        target_max_volume -> Float4,
        target_mean_volume -> Float4,
    }
}

table! {
    randominfixes (guild_id, infix) {
        guild_id -> Numeric,
        infix -> Varchar,
        display_name -> Varchar,
    }
}

table! {
    soundfiles (sound_id) {
        sound_id -> Int4,
        file_name -> Varchar,
        max_volume -> Float4,
        mean_volume -> Float4,
        length -> Float4,
        uploaded_by_user_id -> Nullable<Numeric>,
        uploaded_at -> Timestamp,
    }
}

table! {
    sounds (id) {
        id -> Int4,
        guild_id -> Numeric,
        name -> Varchar,
        category -> Varchar,
        created_by_user_id -> Nullable<Numeric>,
        created_at -> Timestamp,
        last_edited_by_user_id -> Nullable<Numeric>,
        last_edited_at -> Timestamp,
        volume_adjustment -> Nullable<Float4>,
    }
}

table! {
    users (id) {
        id -> Numeric,
        last_login -> Timestamp,
    }
}

joinable!(authtokens -> users (user_id));
joinable!(soundfiles -> sounds (sound_id));
joinable!(soundfiles -> users (uploaded_by_user_id));

allow_tables_to_appear_in_same_query!(
    authtokens,
    guildsettings,
    randominfixes,
    soundfiles,
    sounds,
    users,
);
