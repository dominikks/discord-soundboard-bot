use regex::Regex;
use std::path::Path;
use std::process::Stdio;
use std::sync::LazyLock;
use tokio::process::Command;

static RE_MAX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("max_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap());
static RE_MEAN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("mean_volume: ([-]?[\\d]+.[\\d]+) dB").unwrap());

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

/// Calculate volume adjustment in dB based on target and file volume levels
/// Returns the adjustment value, with a minimum of 0.0 (no reduction below original)
pub fn calculate_volume_adjustment(
    target_max_db: f32,
    target_mean_db: f32,
    file_max_db: f32,
    file_mean_db: f32,
    manual_adjustment: Option<f32>,
) -> f32 {
    manual_adjustment.unwrap_or_else(|| {
        (target_max_db - file_max_db)
            .max(target_mean_db - file_mean_db)
            .max(0.0)
    })
}

/// Convert dB to linear scale for volume adjustment
/// Formula: linear = 10^(dB/20)
pub fn db_to_linear(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_adjustment_scenarios() {
        // Test auto-adjustment: file is louder than target, needs reduction
        // Target max: -10 dB, file max: -5 dB -> adjust by -5 dB
        // Target mean: -20 dB, file mean: -15 dB -> adjust by -5 dB
        // Take max of both and max with 0.0 -> 0.0 (no increase beyond original)
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -5.0,  // file_max_db (louder)
            -15.0, // file_mean_db (louder)
            None,
        );
        assert_eq!(adj, 0.0);

        // Test auto-adjustment: file is quieter than target, needs boost
        // Target max: -10 dB, file max: -15 dB -> adjust by +5 dB
        // Target mean: -20 dB, file mean: -25 dB -> adjust by +5 dB
        // Take max -> +5 dB
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -15.0, // file_max_db (quieter)
            -25.0, // file_mean_db (quieter)
            None,
        );
        assert_eq!(adj, 5.0);

        // Test mean requires more boost than max
        // Target max: -10 dB, file max: -12 dB -> adjust by +2 dB
        // Target mean: -20 dB, file mean: -28 dB -> adjust by +8 dB
        // Take max -> +8 dB
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -12.0, // file_max_db
            -28.0, // file_mean_db (much quieter)
            None,
        );
        assert_eq!(adj, 8.0);

        // Test manual override with positive value
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -5.0,  // file_max_db
            -15.0, // file_mean_db
            Some(3.0),
        );
        assert_eq!(adj, 3.0);

        // Test manual override with negative value (reduction)
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -15.0, // file_max_db
            -25.0, // file_mean_db
            Some(-2.0),
        );
        assert_eq!(adj, -2.0);

        // Test zero adjustment when perfectly matched
        let adj = calculate_volume_adjustment(
            -10.0, // target_max_db
            -20.0, // target_mean_db
            -10.0, // file_max_db (matches)
            -20.0, // file_mean_db (matches)
            None,
        );
        assert_eq!(adj, 0.0);
    }

    #[test]
    fn test_db_to_linear_conversion() {
        // Test 0 dB = 1.0x (no change)
        let linear = db_to_linear(0.0);
        assert!((linear - 1.0).abs() < 0.001);

        // Test +6 dB ≈ 2.0x amplitude
        let linear = db_to_linear(6.0);
        assert!((linear - 2.0).abs() < 0.01);

        // Test +20 dB = 10.0x amplitude
        let linear = db_to_linear(20.0);
        assert!((linear - 10.0).abs() < 0.01);

        // Test -6 dB ≈ 0.5x amplitude
        let linear = db_to_linear(-6.0);
        assert!((linear - 0.5).abs() < 0.01);

        // Test -20 dB = 0.1x amplitude
        let linear = db_to_linear(-20.0);
        assert!((linear - 0.1).abs() < 0.01);

        // Test large positive value
        let linear = db_to_linear(40.0);
        assert!((linear - 100.0).abs() < 1.0);
    }

    #[test]
    fn test_volume_regex_patterns() {
        // Test max volume regex
        let test_output = "max_volume: -12.5 dB";
        let captures = RE_MAX.captures(test_output).unwrap();
        assert_eq!(&captures[1], "-12.5");

        // Test mean volume regex
        let test_output = "mean_volume: -23.8 dB";
        let captures = RE_MEAN.captures(test_output).unwrap();
        assert_eq!(&captures[1], "-23.8");

        // Test positive values
        let test_output = "max_volume: 3.2 dB";
        let captures = RE_MAX.captures(test_output).unwrap();
        assert_eq!(&captures[1], "3.2");

        // Test zero
        let test_output = "mean_volume: 0.0 dB";
        let captures = RE_MEAN.captures(test_output).unwrap();
        assert_eq!(&captures[1], "0.0");
    }
}
