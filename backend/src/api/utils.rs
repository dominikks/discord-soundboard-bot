use rocket::http::ContentType;
use rocket::response::Responder;
use serenity::model::guild::Member as SerenityMember;
use serenity::model::user::User as SerenityUser;
use std::io;
use std::path::Path;
use std::path::PathBuf;
use tokio::fs::File;

#[derive(Debug)]
pub struct CachedFile(PathBuf, File);

impl CachedFile {
    pub async fn open<P: AsRef<Path>>(path: P) -> io::Result<Self> {
        let file = File::open(path.as_ref()).await?;
        Ok(Self(path.as_ref().to_path_buf(), file))
    }
}

impl<'r> Responder<'r, 'static> for CachedFile {
    fn respond_to(self, req: &'r rocket::Request<'_>) -> rocket::response::Result<'static> {
        let mut response = self.1.respond_to(req)?;

        // Add file
        let content_type = self
            .0
            .extension()
            .and_then(|ext| ContentType::from_extension(&ext.to_string_lossy()));
        if let Some(ct) = content_type.clone() {
            response.set_header(ct);
        }

        let cache_string;
        if content_type == Some(ContentType::HTML) {
            cache_string = "no-cache";
        } else if content_type == Some(ContentType::CSS)
            || content_type == Some(ContentType::JavaScript)
        {
            cache_string = "public, max-age=315360000"; // indefinitely
        } else {
            cache_string = "public, max-age=2592000"; // 30d
        }
        response.set_raw_header("Cache-Control", cache_string);

        Ok(response)
    }
}

pub trait AvatarOrDefault {
    /// Get user avatar or default icon, if no avatar is present
    fn avatar_url_or_default(&self) -> String;
}

impl AvatarOrDefault for SerenityUser {
    fn avatar_url_or_default(&self) -> String {
        self.avatar
            .as_ref()
            .map(|avatar_hash| {
                format!(
                    "https://cdn.discordapp.com/avatars/{}/{}.png",
                    self.id, avatar_hash
                )
            })
            .unwrap_or(format!(
                "https://cdn.discordapp.com/embed/avatars/{}.png",
                self.discriminator.map(|d| d.get()).unwrap_or(0) % 5
            ))
    }
}

impl AvatarOrDefault for SerenityMember {
    fn avatar_url_or_default(&self) -> String {
        self.avatar
            .as_ref()
            .map(|a| a.to_string())
            .unwrap_or_else(|| self.user.avatar_url_or_default())
    }
}
