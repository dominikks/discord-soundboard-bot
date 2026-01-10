use crate::audio_utils;
use std::ffi::OsString;
use std::path::Path;
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use std::time::SystemTime;
use thiserror::Error;
use tokio::fs;
use tokio::fs::ReadDir;
use tokio::io;

static SOUNDS_FOLDER: LazyLock<&Path> = LazyLock::new(|| Path::new("data/sounds"));
pub static RECORDINGS_FOLDER: LazyLock<&Path> = LazyLock::new(|| Path::new("data/recorder"));
pub static MIXES_FOLDER: LazyLock<&Path> = LazyLock::new(|| Path::new("data/mixes"));

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

#[derive(Debug, Error)]
pub enum FileError {
    #[error("IO error: {0}")]
    IoError(#[from] io::Error),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_full_sound_path() {
        // Test basic path construction
        let path = get_full_sound_path("123/456/test.mp3");
        assert_eq!(path, PathBuf::from("data/sounds/123/456/test.mp3"));
        
        // Test with different filename
        let path = get_full_sound_path("789/sound.wav");
        assert_eq!(path, PathBuf::from("data/sounds/789/sound.wav"));
        
        // Test with just filename
        let path = get_full_sound_path("simple.mp3");
        assert_eq!(path, PathBuf::from("data/sounds/simple.mp3"));
    }

    #[test]
    fn test_sounds_folder_constant() {
        // Verify the sounds folder path is as expected
        assert_eq!(*SOUNDS_FOLDER, Path::new("data/sounds"));
    }

    #[test]
    fn test_recordings_folder_constant() {
        // Verify the recordings folder path is as expected
        assert_eq!(*RECORDINGS_FOLDER, Path::new("data/recorder"));
    }

    #[test]
    fn test_mixes_folder_constant() {
        // Verify the mixes folder path is as expected
        assert_eq!(*MIXES_FOLDER, Path::new("data/mixes"));
    }

    #[test]
    fn test_file_path_components() {
        // Test that paths can be constructed safely
        let guild_id = 123u64;
        let timestamp = 1234567890u64;
        
        // Construct path like save_channel_recording does
        let folder = (*RECORDINGS_FOLDER)
            .join(guild_id.to_string())
            .join(timestamp.to_string());
        
        assert_eq!(
            folder,
            PathBuf::from("data/recorder/123/1234567890")
        );
    }

    #[test]
    fn test_sanitize_filename_integration() {
        // Test that sanitize_filename crate works as expected
        // Note: @ is allowed in filenames by sanitize_filename
        let safe = sanitize_filename::sanitize("user@name.mp3");
        assert!(safe.contains('@')); // @ is a valid filename character
        
        // Test path traversal prevention - slashes are removed/replaced
        let safe = sanitize_filename::sanitize("../../../etc/passwd");
        assert!(!safe.contains('/')); // No slashes allowed
        // Note: sanitize_filename may keep dots if they don't form path separators
        
        // Test spaces are preserved
        let safe = sanitize_filename::sanitize("test file.mp3");
        assert_eq!(safe, "test file.mp3");
        
        // Test that the result is not empty for problematic input
        let safe = sanitize_filename::sanitize("file/path");
        assert!(!safe.is_empty());
        assert!(!safe.contains('/'));
    }
}
