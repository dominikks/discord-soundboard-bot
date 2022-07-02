use crate::audio_utils;
use std::ffi::OsString;
use std::fmt;
use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
use std::time::SystemTime;
use tokio::fs;
use tokio::fs::ReadDir;
use tokio::io;

lazy_static! {
    static ref SOUNDS_FOLDER: &'static Path = Path::new("data/sounds");
    pub static ref RECORDINGS_FOLDER: &'static Path = Path::new("data/recorder");
    pub static ref MIXES_FOLDER: &'static Path = Path::new("data/mixes");
}

pub async fn create_folders() -> Result<(), io::Error> {
    fs::create_dir_all(*SOUNDS_FOLDER).await?;
    fs::create_dir_all(*RECORDINGS_FOLDER).await?;
    if MIXES_FOLDER.exists() {
        // Clean temporary mixes that might be remaining
        fs::remove_dir_all(*MIXES_FOLDER).await?;
    }
    fs::create_dir_all(*MIXES_FOLDER).await?;

    Ok(())
}

pub fn get_full_sound_path(filename: &str) -> PathBuf {
    (*SOUNDS_FOLDER).join(filename)
}

#[derive(Debug)]
pub enum FileError {
    IoError(io::Error),
}

impl From<io::Error> for FileError {
    fn from(err: io::Error) -> Self {
        FileError::IoError(err)
    }
}

impl fmt::Display for FileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        match self {
            FileError::IoError(err) => write!(f, "FileError: IoError occurred. {}", err),
        }
    }
}

#[derive(Debug)]
pub struct Recording {
    pub guild_id: u64,
    pub timestamp: SystemTime,
    pub length: f32,
    pub users: Vec<RecordingUser>,
}

#[derive(Debug)]
pub struct RecordingUser {
    /// Parsed name. This is not equivalent to the file name.
    pub name: String,
    /// This is the file name in the recordings folder
    pub file_name: OsString,
}

#[instrument(err)]
pub async fn get_recordings_for_guild(guild_id: u64) -> Result<Vec<Recording>, FileError> {
    let mut results = Vec::new();
    let start_dir = (*RECORDINGS_FOLDER).join(guild_id.to_string());
    if !start_dir.exists() {
        return Ok(vec![]);
    }

    let mut dir = (fs::read_dir(start_dir).await as Result<ReadDir, io::Error>)?;
    while let Some(file) = dir.next_entry().await? {
        let filename = file.file_name();
        let filename = filename.to_string_lossy();
        let metadata = file.metadata().await?;

        if metadata.is_dir() {
            if let Ok(timestamp) = filename.parse::<u64>() {
                let mut rec_dir = (fs::read_dir(file.path()).await as Result<ReadDir, io::Error>)?;

                let mut users = Vec::new();
                let mut length: f32 = 0.0;
                while let Some(rec_file) = rec_dir.next_entry().await? {
                    if let Some(file_stem) =
                        rec_file.path().file_stem().and_then(|stem| stem.to_str())
                    {
                        users.push(RecordingUser {
                            name: file_stem.to_string(),
                            file_name: rec_file.file_name(),
                        });
                        length = length.max(
                            audio_utils::get_length(&rec_file.path())
                                .await
                                .unwrap_or(0.0),
                        );
                    }
                }

                results.push(Recording {
                    guild_id,
                    timestamp: SystemTime::UNIX_EPOCH + Duration::from_secs(timestamp),
                    length,
                    users,
                });
            } else {
                warn!(?file, "Directory has invalid name. Must be a number.");
            }
        } else {
            warn!(?file, "File found in invalid location");
        }
    }

    Ok(results)
}
