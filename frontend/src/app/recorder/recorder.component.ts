import { ChangeDetectionStrategy, Component, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RecorderService, Recording as SrvRecording, RecordingUser } from '../services/recorder.service';
import { SettingsService } from '../services/settings.service';
import { clamp } from 'lodash-es';
import { WebAudioBufferSource, WebAudioContext, WebAudioGain } from '@ng-web-apis/audio';
import { ApiService } from '../services/api.service';
import { BehaviorSubject, EMPTY, empty, Observable, Subject } from 'rxjs';
import { catchError, flatMap, map, mergeMap, withLatestFrom } from 'rxjs/operators';

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
export class RecorderComponent implements OnInit {
  get settings() {
    return this.settingsService.settings;
  }

  guilds$ = this.apiService.guilds$;
  recordings$ = new BehaviorSubject<Recording[]>(null);
  deleteRecording$ = new Subject<Recording>();
  record$ = new Subject<void>();

  @ViewChildren(WebAudioBufferSource) audioBufferSources: QueryList<WebAudioBufferSource>;
  @ViewChild(WebAudioGain) gainNode: WebAudioGain;
  @ViewChild(WebAudioContext) contextNode: WebAudioContext;

  gain = this.settings.localVolume$.pipe(map(volume => clamp(volume / 100, 0, 1)));
  isPlaying: Recording;

  constructor(
    private apiService: ApiService,
    private recorderService: RecorderService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.deleteRecording$
      .pipe(
        mergeMap(recording =>
          this.recorderService.deleteRecording(recording.timestamp).pipe(
            catchError(error => {
              console.error(error);
              this.snackBar.open('Deleting failed', 'Ok');
              this.reload();
              return EMPTY;
            }),
            map(_ => recording)
          )
        ),
        withLatestFrom(this.recordings$)
      )
      .subscribe(([toDelete, recordings]) => {
        recordings = recordings.slice();
        recordings.splice(recordings.indexOf(toDelete), 1);
        this.recordings$.next(recordings);
        this.snackBar.open('Deleted', undefined, { duration: 1500 });
      });

    this.record$
      .pipe(
        withLatestFrom(this.settings.guildId$),
        mergeMap(([, guildId]) => {
          this.snackBar.open(`Preparing recording. This may take up to one minute.`);
          return this.recorderService.record(guildId).pipe(
            catchError(error => {
              console.error(error);
              if (error.status === 404) {
                this.snackBar.open('No data to be saved. Is the bot in a voice channel?', 'Ok');
              } else {
                this.snackBar.open('Unknown error while saving', 'Ok');
              }
              return EMPTY;
            })
          );
        })
      )
      .subscribe(_ => {
        this.snackBar.open(`Saved`, undefined, { duration: 1500 });
        this.reload();
      });

    this.reload();
  }

  reload() {
    this.recordings$.next(null);
    this.recorderService.loadRecordings().subscribe(
      recordings => {
        this.recordings$.next(
          recordings
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(recording => ({ ...recording, selected: recording.users.map(_ => true), start: 0, end: recording.length }))
        );
      },
      error => {
        console.error(error);
        this.snackBar.open('Failed to load data');
      }
    );
  }

  getUsernames(users: RecordingUser[]) {
    return users.map(user => user.username).join(', ');
  }

  play(recording: Recording) {
    this.isPlaying = recording;

    setTimeout(() => {
      const playTime = this.contextNode.currentTime + 0.1;
      this.audioBufferSources.forEach(source => {
        source.start(playTime, recording.start, recording.end - recording.start);
      });
    });
  }

  stop() {
    this.isPlaying = undefined;
  }

  downloadMix(recording: Recording) {
    this.recorderService
      .mixRecording(recording.timestamp, {
        start: recording.start,
        end: recording.end,
        users: recording.users.filter((_, i) => recording.selected[i]).map(user => user.username),
      })
      .subscribe(
        data => {
          window.open(data.download_url, '_blank');
        },
        error => {
          console.error(error);
          this.snackBar.open('Error when mixing', 'Ok');
        }
      );
  }
}
