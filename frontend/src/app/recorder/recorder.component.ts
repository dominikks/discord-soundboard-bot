import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { clamp } from 'lodash-es';
import { WebAudioBufferSource, WebAudioContext, WebAudioGain } from '@ng-web-apis/audio';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../services/api.service';
import { AppSettingsService } from '../services/app-settings.service';
import { RecorderService, Recording as SrvRecording, RecordingUser } from '../services/recorder.service';

interface Recording extends SrvRecording {
  selected: boolean[];
  start: number;
  end: number;
}

@Component({
  templateUrl: './recorder.component.html',
  styleUrls: ['./recorder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecorderComponent {
  get settings() {
    return this.settingsService.settings;
  }

  readonly user = this.apiService.user();

  data$: Observable<Recording[]>;

  readonly recordings = signal<Recording[]>(null);
  readonly shownRecordings = computed(() => {
    const guildId = this.settings.guildId();
    return this.recordings().filter(recording => recording.guildId === guildId);
  });

  @ViewChildren(WebAudioBufferSource) audioBufferSources: QueryList<WebAudioBufferSource>;
  @ViewChild(WebAudioGain) gainNode: WebAudioGain;
  @ViewChild(WebAudioContext) contextNode: WebAudioContext;

  readonly gain = computed(() => clamp(this.settings.localVolume() / 100, 0, 1));
  readonly currentlyPlaying = signal<Recording>(null);

  constructor(
    private apiService: ApiService,
    private recorderService: RecorderService,
    private settingsService: AppSettingsService,
    private snackBar: MatSnackBar,
    private cdRef: ChangeDetectorRef
  ) {
    this.reload();
  }

  reload() {
    this.data$ = this.recorderService
      .loadRecordings()
      .pipe(
        map(recordings =>
          recordings
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(recording => ({ ...recording, selected: recording.users.map(_ => true), start: 0, end: recording.length }))
        )
      );
  }

  deleteRecording(recording: Recording) {
    this.recorderService.deleteRecording(recording).subscribe({
      next: () => {
        this.recordings.mutate(recordings => {
          recordings.splice(recordings.indexOf(recording), 1);
        });
        this.snackBar.open('Recording deleted!', undefined, { duration: 1500 });
      },
      error: () => {
        this.snackBar.open('Failed to delete recording.', 'Damn', { duration: undefined });
        this.reload();
      },
    });
  }

  record() {
    this.snackBar.open(`Preparing recording. This may take up to one minute.`);
    this.recorderService.record(this.settings.guildId()).subscribe({
      next: () => {
        this.snackBar.open(`Recording saved!`, undefined, { duration: 1500 });
        this.reload();
        this.cdRef.markForCheck();
      },
      error: error => {
        if (error.status === 404) {
          this.snackBar.open('No data to be saved. Is the bot in a voice channel?');
        } else {
          this.snackBar.open('Unknown error while saving.', 'Damn', { duration: undefined });
        }
      },
    });
  }

  getUsernames(users: RecordingUser[]) {
    return users.map(user => user.username).join(', ');
  }

  play(recording: Recording) {
    this.currentlyPlaying.set(recording);

    setTimeout(() => {
      const playTime = this.contextNode.currentTime + 0.1;
      this.audioBufferSources.forEach(source => {
        source.start(playTime, recording.start, recording.end - recording.start);
      });
    });
  }

  stop() {
    this.currentlyPlaying.set(null);
  }

  downloadMix(recording: Recording) {
    this.recorderService
      .mixRecording(recording, {
        start: recording.start,
        end: recording.end,
        userIds: recording.users.filter((_, i) => recording.selected[i]).map(user => user.id),
      })
      .subscribe({
        next: data => {
          window.open(data.downloadUrl, '_blank');
        },
        error: () => {
          this.snackBar.open('Unknown error when mixing.', 'Damn', { duration: undefined });
        },
      });
  }

  formatTrimSlider(value: number) {
    return `${value.toFixed(1)}s`;
  }
}
