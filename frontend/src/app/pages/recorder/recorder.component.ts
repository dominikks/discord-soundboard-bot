import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  Input,
  OutputRefSubscription,
  QueryList,
  signal,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { clamp } from 'lodash-es';
import { WaBufferSource, WaAudioContext, WaDestination, WaGain, WaOutput, WaScheduledSource } from '@ng-web-apis/audio';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MatToolbar } from '@angular/material/toolbar';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatOption } from '@angular/material/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelContent,
  MatExpansionPanelDescription,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from '@angular/material/expansion';
import { TimeagoModule } from 'ngx-timeago';
import { MatDivider } from '@angular/material/divider';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatSlider, MatSliderRangeThumb } from '@angular/material/slider';
import { VolumeSliderComponent } from '../../common/volume-slider/volume-slider.component';
import { DataLoadDirective } from '../../common/data-load/data-load.directive';
import { HeaderComponent } from '../../common/header/header.component';
import { RecorderService, Recording as SrvRecording, RecordingUser } from '../../services/recorder.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { User } from '../../services/api.service';
import { FooterComponent } from '../../common/footer/footer.component';

interface Recording extends SrvRecording {
  selected: boolean[];
  start: number;
  end: number;
}

@Component({
  templateUrl: './recorder.component.html',
  styleUrls: ['./recorder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HeaderComponent,
    DataLoadDirective,
    MatToolbar,
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    VolumeSliderComponent,
    MatButton,
    MatIcon,
    MatIconButton,
    MatTooltip,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    TimeagoModule,
    MatExpansionPanelDescription,
    MatExpansionPanelContent,
    MatDivider,
    MatCheckbox,
    MatSlider,
    MatSliderRangeThumb,
    FooterComponent,
    DecimalPipe,
    DatePipe,
    WaAudioContext,
    WaGain,
    WaDestination,
    WaBufferSource,
    WaOutput,
  ],
})
export class RecorderComponent {
  private recorderService = inject(RecorderService);
  private settingsService = inject(AppSettingsService);
  private snackBar = inject(MatSnackBar);
  private cdRef = inject(ChangeDetectorRef);

  get settings() {
    return this.settingsService.settings;
  }

  @Input({ required: true }) user!: User;

  readonly recordings = signal<Recording[]>([]);
  readonly shownRecordings = computed(() => {
    const guildId = this.settings.guildId();
    return this.recordings().filter(recording => recording.guildId === guildId);
  });

  @ViewChildren(WaBufferSource) audioBufferSources!: QueryList<WaBufferSource>;
  @ViewChildren(WaBufferSource, { read: WaScheduledSource }) scheduledSources!: QueryList<WaScheduledSource>;
  @ViewChild(WaGain) gainNode!: WaGain;
  @ViewChild(WaAudioContext) contextNode!: WaAudioContext;

  readonly gain = computed(() => clamp(this.settings.localVolume() / 100, 0, 1));
  readonly currentlyPlaying = signal<Recording | null>(null);

  private endedSubscriptions: OutputRefSubscription[] = [];

  constructor() {
    // Subscribe to 'ended' events from scheduled sources whenever they change
    effect(() => {
      // Track when currentlyPlaying changes to trigger re-subscription
      const isPlaying = this.currentlyPlaying() !== null;

      // Clean up previous subscriptions
      this.endedSubscriptions.forEach(sub => sub.unsubscribe());
      this.endedSubscriptions = [];

      if (isPlaying) {
        // Subscribe to all scheduled sources' ended events
        // Use a flag to ensure stop() is only called once
        let hasStopped = false;

        this.scheduledSources.forEach(source => {
          const sub = source.ended.subscribe(() => {
            if (!hasStopped) {
              hasStopped = true;
              this.stop();
            }
          });
          this.endedSubscriptions.push(sub);
        });
      }
    });
  }

  data$ = this.getRecordingsObservable();

  reload() {
    this.data$ = this.getRecordingsObservable();
  }

  private getRecordingsObservable(): Observable<Recording[]> {
    return this.recorderService.loadRecordings().pipe(
      map(recordings =>
        recordings
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(recording => ({
            ...recording,
            selected: recording.users.map(_ => true),
            start: 0,
            end: recording.length,
          })),
      ),
    );
  }

  deleteRecording(recording: Recording) {
    this.recorderService.deleteRecording(recording).subscribe({
      next: () => {
        this.recordings.update(recordings => recordings.filter(r => r !== recording));
        this.snackBar.open('Recording deleted!', undefined, { duration: 1500 });
      },
      error: () => {
        this.snackBar.open('Failed to delete recording.', 'Damn', { duration: undefined });
        this.reload();
      },
    });
  }

  record() {
    const guildId = this.settings.guildId();
    if (!guildId) return;

    this.snackBar.open(`Preparing recording. This may take up to one minute.`);
    this.recorderService.record(guildId).subscribe({
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
      const duration = recording.end - recording.start;

      this.audioBufferSources.forEach(source => {
        source.start(playTime, recording.start, duration);
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
