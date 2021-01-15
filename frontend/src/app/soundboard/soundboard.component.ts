import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { clamp, sample } from 'lodash-es';
import { Sound, SoundsService } from '../services/sounds.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import Fuse from 'fuse.js';
import { SettingsService } from '../services/settings.service';
import { ApiService } from '../services/api.service';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { catchError, filter, map, shareReplay, takeUntil, withLatestFrom } from 'rxjs/operators';

@Component({
  templateUrl: './soundboard.component.html',
  styleUrls: ['./soundboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardComponent implements OnInit, OnDestroy {
  get settings() {
    return this.settingsService.settings;
  }

  onDestroy$ = new Subject<void>();
  currentAudio$ = new BehaviorSubject<HTMLAudioElement>(null);
  playSound$ = new Subject<Sound>();
  playInfix$ = new Subject<string>();
  playFirstMatch$ = new Subject<void>();
  stopSound$ = new Subject<void>();
  stopLocalSound$ = new Subject<void>();
  soundSearchFilter$ = new BehaviorSubject('');

  guilds$ = this.apiService.guilds$;
  randomInfixes$ = this.apiService.randomInfixes$;

  sounds$: Observable<[Sound[], Fuse<Sound>]> = this.soundsService.sounds$.pipe(
    map(sounds => [sounds, new Fuse(sounds, { keys: ['name'] })]),
    catchError(error => {
      console.error(error);
      this.snackBar.open('Failed to load sounds');
      return [];
    }),
    shareReplay()
  );
  soundCategories$ = this.sounds$.pipe(
    map(([sounds]) => new Set(sounds.map(sound => sound.category))),
    shareReplay()
  );
  filteredSounds$ = combineLatest([this.sounds$, this.soundSearchFilter$, this.settings.soundCategory$]).pipe(
    map(([sounds, searchFilter, category]) => {
      if (searchFilter.length > 0) {
        return sounds[1].search(searchFilter).map(res => res.item);
      } else if (category.length > 0) {
        return sounds[0].filter(sound => sound.category === category);
      } else {
        return sounds[0];
      }
    }),
    shareReplay()
  );

  constructor(
    public apiService: ApiService,
    private soundsService: SoundsService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    // Play a sound
    this.playSound$
      .pipe(withLatestFrom(this.settings.soundTarget$, this.settings.guildId$, this.settings.debug$))
      .subscribe(([sound, soundTarget, guildId, debug]) => {
        if (soundTarget === 'discord') {
          this.soundsService.playSound(sound, guildId).subscribe(
            result => {
              if (debug) {
                const volString =
                  result.sound_volume != null
                    ? `Max ${result.sound_volume.max_volume.toFixed(1)} dB, Average ${result.sound_volume.mean_volume.toFixed(
                        1
                      )} dB, Automatic `
                    : 'Manual ';
                this.snackBar.open(`Volume: ${volString}adjustment ${result.volume_adjustment.toFixed(1)} dB`, 'Ok', { duration: 5000 });
              }
            },
            error => {
              if (error.status === 503) {
                this.snackBar.open('Failed to join voice channel!', 'Ok', { duration: 2000 });
              } else if (error.status === 404) {
                this.snackBar.open('Sound not found. It might have been deleted or renamed.', 'Ok', { duration: 2000 });
              } else if (error.status >= 300) {
                console.error(error);
                this.snackBar.open('Unknown error', 'Ok', { duration: 2000 });
              }
            }
          );
        } else {
          this.stopLocalSound$.next();
          const audio = new Audio();
          this.currentAudio$.next(audio);
          audio.src = sound.downloadUrl;
          audio.load();
          audio.play();
        }
      });

    // Play random sound
    this.playInfix$.pipe(withLatestFrom(this.filteredSounds$)).subscribe(([infix, filteredSounds]) => {
      const matchingSounds = filteredSounds.filter(sound => sound.name.toLowerCase().includes(infix));
      if (matchingSounds.length > 0) {
        this.playSound$.next(sample(matchingSounds));
      }
    });

    // Play the first search match
    this.playFirstMatch$.pipe(withLatestFrom(this.filteredSounds$)).subscribe(([, filteredSounds]) => {
      if (filteredSounds.length > 0) {
        this.playSound$.next(filteredSounds[0]);
      }
    });

    // Stop playback
    this.stopSound$.pipe(withLatestFrom(this.settings.soundTarget$, this.settings.guildId$)).subscribe(([, soundTarget, guildId]) => {
      if (soundTarget === 'discord') {
        this.soundsService.stopSound(guildId).subscribe();
      } else {
        this.stopLocalSound$.next();
      }
    });
    this.stopLocalSound$.pipe(withLatestFrom(this.currentAudio$)).subscribe(([, currentAudio]) => {
      if (currentAudio != null) {
        currentAudio.pause();
        currentAudio.remove();
        this.currentAudio$.next(null);
      }
    });

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

  trackByName(_: number, item: Sound) {
    if (!item) {
      return null;
    }

    return item.name;
  }
}
