import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { clamp, sample, uniq, sortBy } from 'lodash-es';
import { Sound, SoundsService } from '../services/sounds.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import Fuse from 'fuse.js';
import { SettingsService } from '../services/settings.service';
import { ApiService, RandomInfix } from '../services/api.service';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { filter, map, shareReplay, takeUntil, withLatestFrom } from 'rxjs/operators';

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
  playSound$ = new Subject<Sound>();
  playInfix$ = new Subject<RandomInfix>();
  playFirstMatch$ = new Subject<void>();
  stopSound$ = new Subject<void>();
  stopLocalSound$ = new Subject<void>();
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

  constructor(
    public apiService: ApiService,
    private soundsService: SoundsService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    // Play a sound
    this.playSound$
      .pipe(takeUntil(this.onDestroy$), withLatestFrom(this.settings.soundTarget$, this.settings.guildId$, this.settings.debug$))
      .subscribe(([sound, soundTarget, guildId, debug]) => {
        if (soundTarget === 'discord') {
          this.soundsService.playSound(sound, guildId).subscribe(
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
            error => {
              if (error.status === 503) {
                this.snackBar.open('Failed to join voice channel!', 'Damn');
              } else if (error.status === 404) {
                this.snackBar.open('Sound not found. It might have been deleted or renamed.', 'Damn');
              } else if (error.status >= 300) {
                console.error(error);
                this.snackBar.open('Unknown error playing the sound file.', 'Damn');
              }
            }
          );
        } else {
          this.stopLocalSound$.next();
          const audio = new Audio();
          this.currentAudio$.next(audio);
          audio.src = sound.getDownloadUrl();
          audio.load();
          audio.play();
        }
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
    this.stopSound$
      .pipe(takeUntil(this.onDestroy$), withLatestFrom(this.settings.soundTarget$, this.settings.guildId$))
      .subscribe(([, soundTarget, guildId]) => {
        if (soundTarget === 'discord') {
          this.soundsService.stopSound(guildId).subscribe();
        } else {
          this.stopLocalSound$.next();
        }
      });
    this.stopLocalSound$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.currentAudio$)).subscribe(([, currentAudio]) => {
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

  trackById(_: number, item: Sound) {
    if (!item) {
      return null;
    }

    return item.id;
  }
}
