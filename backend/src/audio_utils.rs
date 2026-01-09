use regex::Regex;
use std::path::Path;
use std::sync::LazyLock;
use tokio::process::Command;
use std::process::Stdio;

static RE_MAX: LazyLock<Regex> = LazyLock::new(|| 
    Regex::new("max_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap()
);
static RE_MEAN: LazyLock<Regex> = LazyLock::new(|| 
    Regex::new("mean_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap()
);

#[derive(Clone, Debug)]
pub struct VolumeInformation {
    pub max_volume: f32,
    pub mean_volume: f32,
}

#[instrument(skip(path))]
pub async fn detect_volume(path: impl AsRef<Path>) -> Option<VolumeInformation> {
    let args = ["-af", "volumedetect", "-f", "null", "/dev/null", "-i"];

    let out = Command::new("ffmpeg")
        .kill_on_drop(true)
        .args(args)
        .arg(path.as_ref())
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

#[instrument(skip(path))]
pub async fn get_length(path: impl AsRef<Path>) -> Option<f32> {
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
        .args(args)
        .arg(path.as_ref())
        .stdin(Stdio::null())
        .output()
        .await;

    let out = out.ok()?;
    let parsed = String::from_utf8(out.stdout).ok()?;
    debug!(?parsed, "Read sound file length");
    parsed.trim().parse::<f32>().ok()
}
