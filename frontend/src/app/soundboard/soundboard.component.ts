import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { clamp, sample, uniq, sortBy } from 'lodash-es';
import { MatSnackBar } from '@angular/material/snack-bar';
import Fuse from 'fuse.js';
import { BehaviorSubject, combineLatest, EMPTY, Subject } from 'rxjs';
import { catchError, filter, map, shareReplay, switchMap, takeUntil, withLatestFrom } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../services/settings.service';
import { ApiService, RandomInfix } from '../services/api.service';
import { Sound, SoundsService } from '../services/sounds.service';
import { EventsService } from '../services/events.service';
import { EventLogDialogComponent } from './event-log-dialog/event-log-dialog.component';

@Component({
  templateUrl: './soundboard.component.html',
  styleUrls: ['./soundboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardComponent implements OnInit, OnDestroy {
  get settings() {
    return this.settingsService.settings;
  }

  private onDestroy$ = new Subject<void>();

  currentAudio$ = new BehaviorSubject<HTMLAudioElement>(null);
  currentLocalSound$ = new BehaviorSubject<Sound>(null);
  playSound$ = new Subject<Sound>();
  playInfix$ = new Subject<RandomInfix>();
  playFirstMatch$ = new Subject<void>();
  stopSound$ = new Subject<void>();
  stopLocalSound$ = new Subject<void>();
  joinChannel$ = new Subject<void>();
  leaveChannel$ = new Subject<void>();
  soundSearchFilter$ = new BehaviorSubject('');

  user$ = this.apiService.user$;
  randomInfixes$ = this.apiService.randomInfixes$;

  sounds$ = this.soundsService.sounds$.pipe(
    map(sounds => [sounds, new Fuse(sounds, { keys: ['name'] })] as [Sound[], Fuse<Sound>]),
    shareReplay(1)
  );
  soundCategories$ = this.sounds$.pipe(
    map(([sounds]) => sortBy(uniq(sounds.map(sound => sound.category)), category => category.toLowerCase())),
    shareReplay(1)
  );
  filteredSounds$ = combineLatest([this.sounds$, this.soundSearchFilter$, this.settings.soundCategories$]).pipe(
    map(([sounds, searchFilter, categories]) => {
      if (searchFilter.length > 0) {
        return sounds[1].search(searchFilter).map(res => res.item);
      } else if (categories.length > 0) {
        return sounds[0].filter(sound => categories.includes(sound.category));
      } else {
        return sounds[0];
      }
    }),
    shareReplay(1)
  );

  target$ = this.settings.guildId$;

  events$ = this.target$.pipe(
    switchMap(target => (target ? this.eventsService.getEventStream(target) : EMPTY)),
    shareReplay(100)
  );

  constructor(
    public apiService: ApiService,
    private soundsService: SoundsService,
    private settingsService: SettingsService,
    private eventsService: EventsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private ref: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Play a sound
    this.playSound$
      .pipe(takeUntil(this.onDestroy$), withLatestFrom(this.settings.guildId$, this.settings.debug$, this.settings.autoJoin$))
      .subscribe(([sound, guildId, debug, autojoin]) => {
        this.stopLocalSound$.next();
        this.soundsService.playSound(sound, guildId, autojoin).subscribe(
          () => {
            if (debug) {
              let volString =
                sound.soundfile != null
                  ? `Volume: Max ${sound.soundfile.maxVolume.toFixed(1)} dB, Average ${sound.soundfile.meanVolume.toFixed(1)} dB, `
                  : '';
              volString += sound.volumeAdjustment != null ? `Manual adjustment ${sound.volumeAdjustment} dB` : 'Automatic adjustment';
              this.snackBar.open(volString, 'Ok');
            }
          },
          (error: HttpErrorResponse) => {
            if (error.status === 400) {
              this.snackBar.open('Failed to join you. Are you in a voice channel that is visible to the bot?', 'Damn');
            } else if (error.status === 503) {
              this.snackBar.open('The bot is currently not in a voice channel!', 'Damn');
            } else if (error.status === 404) {
              this.snackBar.open('Sound not found. It might have been deleted or renamed.', 'Damn');
            } else if (error.status >= 300) {
              this.snackBar.open('Unknown error playing the sound file.', 'Damn');
            }
          }
        );
      });

    // Play random sound
    this.playInfix$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.filteredSounds$)).subscribe(([infix, filteredSounds]) => {
      const matchingSounds = filteredSounds.filter(
        sound => sound.name.toLowerCase().includes(infix.infix) && sound.guildId === infix.guildId
      );
      if (matchingSounds.length > 0) {
        this.playSound$.next(sample(matchingSounds));
      }
    });

    // Play the first search match
    this.playFirstMatch$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.filteredSounds$)).subscribe(([, filteredSounds]) => {
      if (filteredSounds.length > 0) {
        this.playSound$.next(filteredSounds[0]);
      }
    });

    // Stop playback
    this.stopSound$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.settings.guildId$)).subscribe(([, guildId]) => {
      this.soundsService.stopSound(guildId).subscribe();
    });

    this.stopLocalSound$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.currentAudio$)).subscribe(([, currentAudio]) => {
      if (currentAudio != null) {
        currentAudio.pause();
        currentAudio.remove();
        this.currentAudio$.next(null);
        this.currentLocalSound$.next(null);
      }
    });

    // Manage discord channel
    this.joinChannel$
      .pipe(
        takeUntil(this.onDestroy$),
        withLatestFrom(this.settings.guildId$),
        switchMap(([, guildId]) =>
          this.apiService.joinCurrentChannel(guildId).pipe(
            catchError((error: HttpErrorResponse) => {
              if (error.status === 400) {
                this.snackBar.open('Failed to join you. Are you in a voice channel that is visible to the bot?', 'Damn');
              } else {
                this.snackBar.open('Unknown error joining a voice channel.', 'Damn');
              }
              return EMPTY;
            })
          )
        )
      )
      .subscribe(() => this.snackBar.open('Joined channel!', undefined, { duration: 2000 }));
    this.leaveChannel$
      .pipe(
        takeUntil(this.onDestroy$),
        withLatestFrom(this.settings.guildId$),
        switchMap(([, guildId]) =>
          this.apiService.leaveChannel(guildId).pipe(
            catchError((error: HttpErrorResponse) => {
              if (error.status === 503) {
                this.snackBar.open('The bot is not in a voice channel.', undefined, { duration: 2000 });
              } else {
                this.snackBar.open('Unknown error leaving a voice channel.', 'Damn');
              }
              return EMPTY;
            })
          )
        )
      )
      .subscribe(() => this.snackBar.open('Left channel!', undefined, { duration: 2000 }));

    // Update volume of HTMLAudioElement
    combineLatest([this.settings.localVolume$, this.currentAudio$])
      .pipe(
        takeUntil(this.onDestroy$),
        filter(([, audio]) => audio != null)
      )
      .subscribe(([volume, audio]) => {
        audio.volume = clamp(volume / 100, 0, 1);
      });
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  setTarget(guildId: string) {
    this.settings.guildId$.next(guildId);
  }

  trackById(_: number, item: Sound) {
    if (!item) {
      return null;
    }

    return item.id;
  }

  openEventLog() {
    this.dialog.open(EventLogDialogComponent, { data: this.events$ });
  }

  playLocalSound(sound: Sound) {
    this.stopLocalSound$.next();
    this.currentLocalSound$.next(sound);
    const audio = new Audio();
    this.currentAudio$.next(audio);
    audio.src = sound.getDownloadUrl();
    audio.load();
    audio.addEventListener('ended', _ => {
      this.stopLocalSound$.next();
    });
    audio.play();
  }
}
