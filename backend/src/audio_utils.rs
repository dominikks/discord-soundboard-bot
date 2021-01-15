use cached::proc_macro::cached;
use lazy_static::lazy_static;
use regex::Regex;
use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;
use tracing::debug;
use tracing::instrument;

#[derive(Clone, Debug)]
pub struct VolumeInformation {
  pub max_volume: f32,
  pub mean_volume: f32,
}

#[instrument]
#[cached(option = true, size = 1000, time = 86400)]
pub async fn detect_volume(path: PathBuf) -> Option<VolumeInformation> {
  lazy_static! {
    static ref RE_MAX: Regex = Regex::new("max_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap();
    static ref RE_MEAN: Regex = Regex::new("mean_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap();
  }

  let args = ["-af", "volumedetect", "-f", "null", "/dev/null", "-i"];

  let out = Command::new("ffmpeg")
    .kill_on_drop(true)
    .args(&args)
    .arg(path)
    .stdin(Stdio::null())
    .output()
    .await
    .ok()?;
  let parsed = String::from_utf8(out.stderr).ok()?;

  let max_captures = RE_MAX.captures(&parsed)?;
  let max_volume = max_captures[1].parse::<f32>().ok()?;
  let mean_captures = RE_MEAN.captures(&parsed)?;
  let mean_volume = mean_captures[1].parse::<f32>().ok()?;
  debug!(?max_volume, ?mean_volume, "Volume analysis completed");

  Some(VolumeInformation {
    max_volume,
    mean_volume,
  })
}

pub async fn get_length(path: &OsStr) -> Option<f32> {
  let args = [
    "-show_entries",
    "format=duration",
    "-v",
    "quiet",
    "-of",
    "csv=p=0",
    "-i",
  ];

  let out = Command::new("ffprobe")
    .kill_on_drop(true)
    .args(&args)
    .arg(path)
    .stdin(Stdio::null())
    .output()
    .await;

  let out = out.ok()?;
  let parsed = String::from_utf8(out.stdout).ok()?;
  parsed.trim().parse::<f32>().ok()
}
