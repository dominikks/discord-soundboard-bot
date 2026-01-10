# Testing Documentation

## Current Test Coverage

### Unit Tests (Implemented)

#### 1. Audio Utilities (`audio_utils.rs`)
- ✅ Volume adjustment calculation with various scenarios
- ✅ dB to linear conversion for volume scaling
- ✅ Regex pattern matching for ffmpeg output parsing

**Key Test Cases:**
- Auto-adjustment when file is louder/quieter than target
- Manual volume override
- Edge cases (zero adjustment, large values)
- dB conversion accuracy (0dB=1.0x, +6dB≈2.0x, -6dB≈0.5x)

#### 2. Recording Timeline Math (`discord/recorder.rs`)
- ✅ Tick to sample conversion (48kHz stereo, 20ms ticks)
- ✅ Gap calculation between recording segments
- ✅ Sample rate constants validation
- ✅ Gap fill calculation for silence insertion

**Key Test Cases:**
- 1 tick = 1920 samples (960 per channel * 2 channels)
- 50 ticks = 1 second = 96000 samples
- 108 tick gap = 207360 samples of silence
- Saturating subtraction for gap calculations

#### 3. File Handling (`file_handling.rs`)
- ✅ Path construction for sound files
- ✅ Folder constant validation
- ✅ Filename sanitization integration
- ✅ Safe path component assembly

**Key Test Cases:**
- Sound path construction with guild/timestamp folders
- Sanitize_filename library behavior validation
- Path traversal prevention

### Integration Tests (Future Implementation)

The following integration tests would require additional infrastructure:

#### 1. Sound Playback Flow (High Priority)
**What to Test:**
- Complete flow: auth → permission check → autojoin → volume adjustment → playback
- Volume calculation using real sound metadata
- Client.play() call with correct parameters

**Required Infrastructure:**
- Mock Discord API for member/guild lookups
- Mock Songbird voice client
- Test database for sound/guild settings
- Test audio files for volume detection

**Approach:**
```rust
#[rocket::async_test]
async fn test_sound_playback_flow() {
    // Setup: Mock Discord API, test database, mock voice client
    // Execute: POST /api/guilds/{id}/play/{sound_id}?autojoin=true
    // Verify: Autojoin called, volume calculated correctly, play executed
}
```

#### 2. Recording with Gaps (High Priority)
**What to Test:**
- VoiceData event simulation with gaps
- Silence filling between segments
- Proper timeline calculation
- MP3 encoding output

**Required Infrastructure:**
- Synthetic VoiceData event generation
- Mock ffmpeg or real ffmpeg with test files
- Temporary file handling

**Approach:**
```rust
#[tokio::test]
async fn test_recording_with_gaps_and_save() {
    // Setup: Create recorder, simulate voice events with gaps
    // Execute: Send voice data at ticks 0-10, gap, then 118-150
    // Verify: Gap filled with silence, timeline correct, MP3 created
}
```

#### 3. Permission System (Medium Priority)
**What to Test:**
- Admin: Full access
- Moderator: Play + manage sounds
- User: Play only

**Required Infrastructure:**
- Mock Discord API for role lookups
- Test database with guild settings
- Mock CacheHttp

**Approach:**
```rust
#[tokio::test]
async fn test_permission_system() {
    // Setup: Mock Discord API with different role configurations
    // Execute: check_permission() for each role tier
    // Verify: Correct permissions granted/denied
}
```

## Running Tests

```bash
# Run all unit tests
cargo test

# Run specific test module
cargo test audio_utils::tests

# Run with output
cargo test -- --nocapture

# Run single test
cargo test test_volume_adjustment_scenarios
```

## Test Philosophy

1. **Focus on Core Functionality**: Tests validate critical paths (playback, recording, permissions)
2. **Regression Protection**: Tests catch breaking changes from dependency updates
3. **Pragmatic Approach**: Unit tests for pure logic, document integration test strategy
4. **Comprehensive Over Numerous**: Longer tests that validate multiple scenarios

## Future Enhancements

To complete the integration testing strategy:

1. **Add testcontainers**: For PostgreSQL database integration tests
2. **Create mock builders**: Helpers to construct test Discord API objects
3. **Audio test fixtures**: Small (1-2 second) MP3/WAV files for ffmpeg testing
4. **Rocket test client**: Integration tests for API endpoints
5. **CI Pipeline**: GitHub Actions workflow to run tests on PRs

## Notes

- Unit tests added to source files using `#[cfg(test)]` modules
- Integration tests would go in `tests/` directory
- Mock implementations would go in `tests/common/mocks.rs`
- Real dependency tests (DB, ffmpeg) are minimal and focused
