use crate::api::CachedFile;
use crate::file_handling;
use rocket::get;
use rocket::response::Responder;
use rocket::routes;
use rocket::Route;
use rocket_contrib::json::Json;
use serde::Serialize;
use std::path::PathBuf;
use tracing::error;
use tracing::instrument;

pub fn get_routes() -> Vec<Route> {
  routes![list_sounds, get_sound]
}

#[derive(Serialize, Debug)]
struct Sound {
  /// Externally, we use the file path as id
  id: String,
  /// User visible name of the sound
  name: String,
  // Category is the part before the last slash, corresponds to directory structure
  category: String,
}

impl From<file_handling::Sound> for Sound {
  fn from(s: file_handling::Sound) -> Self {
    let fp = s.file_path.to_string_lossy();
    let cat_index = fp.rfind("/").unwrap_or(0);
    Self {
      id: fp.to_string(),
      name: s.name,
      category: fp[..cat_index].to_string(),
    }
  }
}

#[derive(Debug, Responder)]
enum ListError {
  #[response(status = 500)]
  IoError(String),
}

impl From<file_handling::FileError> for ListError {
  #[instrument]
  fn from(err: file_handling::FileError) -> Self {
    error!(?err, "File error occured");
    ListError::IoError(String::from("Internal IO Error"))
  }
}

#[get("/")]
async fn list_sounds() -> Result<Json<Vec<Sound>>, ListError> {
  Ok(Json(
    file_handling::get_sounds()
      .await?
      .into_iter()
      .map(|s| Sound::from(s))
      .collect(),
  ))
}

#[get("/<path..>")]
async fn get_sound(path: PathBuf) -> Option<CachedFile> {
  CachedFile::open(file_handling::get_full_sound_path(&path))
    .await
    .ok()
}
