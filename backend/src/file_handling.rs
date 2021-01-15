use lazy_static::lazy_static;
use regex::Captures;
use regex::Regex;
use std::path::Path;
use std::path::PathBuf;
use tokio::fs;
use tokio::fs::ReadDir;
use tokio::io;
use tracing::debug;
use tracing::instrument;
use tracing::trace;

const SOUNDS_FOLDER: &str = "data/sounds";
pub const RECORDINGS_FOLDER: &str = "data/recorder";
pub const MIXES_FOLDER: &str = "data/mixes";

pub async fn create_folders() -> Result<(), io::Error> {
  fs::create_dir_all(Path::new(SOUNDS_FOLDER)).await?;
  fs::create_dir_all(Path::new(RECORDINGS_FOLDER)).await?;
  fs::create_dir_all(Path::new(MIXES_FOLDER)).await?;

  Ok(())
}

#[derive(Debug)]
pub enum FileError {
  InvalidFilename,
  IoError(io::Error),
}
impl From<io::Error> for FileError {
  fn from(err: io::Error) -> Self {
    FileError::IoError(err)
  }
}

#[derive(Debug)]
pub enum VolumeAdjustment {
  Automatic,
  Manual(f32),
}

#[derive(Debug)]
pub struct Sound {
  /// Parsed name. This is not equivalent to the file name.
  pub name: String,
  /// This path is relative to SOUNDS_FOLDER
  pub file_path: PathBuf,
  pub volume_adjustment: VolumeAdjustment,
}

impl Sound {
  /// Returns the full path relative to the program's root
  pub fn get_full_path(&self) -> PathBuf {
    get_full_sound_path(&self.file_path)
  }
}

/// Recursively traverse all directories and files and list them
#[instrument]
pub async fn get_sounds() -> Result<Vec<Sound>, FileError> {
  let mut results = Vec::new();
  let mut backlog = vec![PathBuf::from(SOUNDS_FOLDER)];

  while let Some(dir) = backlog.pop() {
    trace!(?dir, "Traversing sound files");
    let mut handle = (fs::read_dir(dir).await as Result<ReadDir, io::Error>)?;

    while let Some(file) = handle.next_entry().await? {
      let ft = file.file_type().await?;
      if ft.is_dir() {
        backlog.push(file.path());
      } else if ft.is_file() {
        if let Ok(sound) = parse_sound(&file.path()).await {
          results.push(sound);
        }
      }
    }
  }

  Ok(results)
}

/// `path` is assumed to be realtive to SOUNDS_FOLDER. It is also assumed to be safe
/// (i.e. no special symbols or characters like ..).
pub async fn get_sound(path: &PathBuf) -> Option<Sound> {
  let path = Path::new(SOUNDS_FOLDER).join(path);
  if path.exists() {
    parse_sound(&path).await.ok()
  } else {
    None
  }
}

/// `path` is assumed to be realtive to SOUNDS_FOLDER. It is also assumed to be safe
/// (i.e. no special symbols or characters like ..).
#[instrument]
async fn parse_sound(path: &PathBuf) -> Result<Sound, FileError> {
  lazy_static! {
    // Search for a string of the form vol:+1.5 or vol:-0.5 or vol:off surrounded by whitespace
    static ref RE_VOL: Regex = Regex::new(r"\bvol:([+-]?[\d]+(.[\d]+)?|off)\b").unwrap();
  }

  let name = path
    .file_stem()
    .ok_or(FileError::InvalidFilename)?
    .to_string_lossy();

  let mut vol_adj = VolumeAdjustment::Automatic;
  let name = RE_VOL.replace(&name, |caps: &Captures| {
    if let Some(adj) = caps.get(1).map(|cap| cap.as_str()).and_then(|cap| {
      if cap == "off" {
        Some(0.0)
      } else {
        cap.parse::<f32>().ok()
      }
    }) {
      vol_adj = VolumeAdjustment::Manual(adj);
    }
    ""
  });

  debug!(?name, ?vol_adj, "Parsed sound name");
  Ok(Sound {
    name: name.to_string(),
    file_path: path
      .strip_prefix(SOUNDS_FOLDER)
      .map_err(|_| FileError::InvalidFilename)?
      .to_path_buf(),
    volume_adjustment: vol_adj,
  })
}

pub fn get_full_sound_path(relative_path: &PathBuf) -> PathBuf {
  Path::new(SOUNDS_FOLDER).join(relative_path)
}
