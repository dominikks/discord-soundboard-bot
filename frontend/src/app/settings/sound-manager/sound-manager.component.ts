import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, from, of, ReplaySubject, Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
  first,
  map,
  mergeMap,
  pairwise,
  shareReplay,
  switchMap,
  takeUntil,
  tap,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';
import { Sound, Soundfile, SoundsService } from 'src/app/services/sounds.service';
import { SettingsService } from 'src/app/services/settings.service';
import { clamp, sortBy } from 'lodash-es';
import { MatDialog } from '@angular/material/dialog';
import Fuse from 'fuse.js';
import { SoundDeleteConfirmComponent } from './sound-delete-confirm/sound-delete-confirm.component';

@Component({
  templateUrl: './sound-manager.component.html',
  styleUrls: ['./sound-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundManagerComponent implements OnDestroy, OnInit {
  private onDestroy$ = new Subject<void>();

  get settings() {
    return this.settingsService.settings;
  }

  guildId$ = new ReplaySubject<string>(1);
  sounds$ = new ReplaySubject<SoundEntry[]>(1);
  soundsWithChanges$ = this.sounds$.pipe(
    switchMap(sounds =>
      sounds.length === 0
        ? of([])
        : combineLatest(sounds.map(sound => sound.hasChanges$)).pipe(map(checks => sounds.filter((_, i) => checks[i])))
    ),
    shareReplay(1)
  );

  soundFilterString$ = new BehaviorSubject('');
  filteredSounds$ = combineLatest([this.soundFilterString$, this.sounds$]).pipe(
    debounceTime(300),
    map(([filterText, sounds]) => {
      if (filterText.length > 0) {
        const fuse = new Fuse(sounds, { keys: ['sound.name', 'sound.category'] });
        return fuse.search(filterText).map(res => res.item);
      } else {
        return sounds;
      }
    })
  );

  isSaving$ = new BehaviorSubject(false);
  isUploading$ = new BehaviorSubject(false);
  isProcessing$ = new BehaviorSubject(false); // tracks replace and delete operations

  hasChanges$ = this.soundsWithChanges$.pipe(map(sounds => sounds.length > 0));
  saveChanges$ = new Subject<void>();
  discardChanges$ = new Subject<void>();

  currentAudio$ = new BehaviorSubject<HTMLAudioElement>(null);
  playAudioClick$ = new Subject<SoundEntry>();

  constructor(
    private soundsService: SoundsService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    // Update guildid and sounds on route change
    this.route.params.pipe(takeUntil(this.onDestroy$)).subscribe(params => {
      const guildId = params.guildId;
      this.guildId$.next(guildId);

      this.soundsService.sounds$
        .pipe(
          first(),
          map(sounds => sounds.filter(sound => sound.guildId === guildId).map(sound => new SoundEntry(this.soundsService, sound)))
        )
        .subscribe(sounds => this.sounds$.next(sounds));
    });

    // Play sounds
    this.playAudioClick$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.currentAudio$)).subscribe(([entry, audio]) => {
      if (audio) {
        audio.pause();
      } else {
        const newAudio = new Audio();
        newAudio.src = entry.sound.getDownloadUrl();
        this.currentAudio$.next(newAudio);
      }
    });
    // Delete HTMLAudioElements when a new one is played
    this.currentAudio$.pipe(takeUntil(this.onDestroy$), pairwise()).subscribe(([previous, current]) => {
      if (previous) {
        previous.remove();
      }
      if (current) {
        current.onpause = () => this.currentAudio$.next(null);
        current.load();
        current.play();
      }
    });
    // Set volume
    combineLatest([this.currentAudio$, this.settings.localVolume$])
      .pipe(
        takeUntil(this.onDestroy$),
        filter(([audio]) => audio != null)
      )
      .subscribe(([audio, volume]) => this.setAudioVolume(audio, volume));

    this.saveChanges$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.soundsWithChanges$)).subscribe(([, sounds]) => {
      this.isSaving$.next(true);
      from(sounds)
        .pipe(
          mergeMap(sound => sound.saveChanges(), 5),
          finalize(() => this.isSaving$.next(false))
        )
        .subscribe({
          error: () => this.snackBar.open('Failed to save changes to sounds', 'Damn'),
        });
    });
    this.discardChanges$
      .pipe(takeUntil(this.onDestroy$), withLatestFrom(this.soundsWithChanges$))
      .subscribe(([, sounds]) => sounds.forEach(sound => sound.discardChanges()));
  }

  onImportFileChange(event: Event, guildId: string) {
    const files = Array.from((event.target as HTMLInputElement).files);
    this.isUploading$.next(true);
    from(files)
      .pipe(
        mergeMap(file => {
          const endingIndex = file.name.lastIndexOf('.');
          const filename = endingIndex > 0 ? file.name.substring(0, endingIndex) : file.name;
          return this.soundsService
            .createSound(guildId, filename, '')
            .pipe(
              mergeMap(sound =>
                this.soundsService
                  .uploadSound(sound, file)
                  .pipe(map(soundfile => new SoundEntry(this.soundsService, new Sound({ ...sound, soundfile }))))
              )
            );
        }, 5),
        toArray(),
        withLatestFrom(this.sounds$),
        finalize(() => this.isUploading$.next(false))
      )
      .subscribe({
        next: ([newEntries, sounds]) => {
          this.sounds$.next([...sounds, ...sortBy(newEntries, entry => entry.sound.name.toLowerCase())]);
          this.snackBar.open('Upload successful');
        },
        error: () => this.snackBar.open('Upload of sounds failed!', 'Damn'),
      });
  }

  deleteSound(entry: SoundEntry) {
    this.dialog
      .open(SoundDeleteConfirmComponent, { data: { sound: entry.sound } })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.isProcessing$.next(true);
          this.soundsService
            .deleteSound(entry.sound)
            .pipe(
              withLatestFrom(this.sounds$),
              tap(([, sounds]) => this.sounds$.next(sounds.filter(sound => sound !== entry))),
              finalize(() => this.isProcessing$.next(false))
            )
            .subscribe({
              error: () => this.snackBar.open('Failed to delete sound', 'Damn'),
            });
        }
      });
  }

  replaceSoundfile(file: File, entry: SoundEntry) {
    this.isProcessing$.next(true);
    this.soundsService
      .uploadSound(entry.sound, file)
      .pipe(
        tap(soundfile => entry.replaceSoundfile(soundfile)),
        finalize(() => this.isProcessing$.next(false))
      )
      .subscribe({
        error: () => this.snackBar.open('Failed to upload soundfile', 'Damn'),
      });
  }

  private setAudioVolume(audio: HTMLAudioElement, volume: number) {
    audio.volume = clamp(volume / 100, 0, 1);
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  trackById(_index: number, item: SoundEntry) {
    return item.sound.id;
  }
}

export class SoundEntry {
  // This is the sound we started with
  private internalSound: Sound;
  // This sound is edited
  sound: Sound;

  checkChanges$ = new BehaviorSubject<void>(null);
  hasChanges$ = this.checkChanges$.pipe(
    map(
      () =>
        this.internalSound.category !== this.sound.category ||
        this.internalSound.name !== this.sound.name ||
        this.internalSound.volumeAdjustment !== this.sound.volumeAdjustment
    ),
    distinctUntilChanged(),
    shareReplay(1)
  );

  constructor(private soundsService: SoundsService, sound: Sound) {
    this.internalSound = new Sound(sound);
    this.sound = new Sound(sound);
  }

  saveChanges() {
    return of(this.sound).pipe(
      mergeMap(sound => this.soundsService.updateSound(sound).pipe(map(() => sound))),
      tap(sound => {
        this.internalSound = new Sound(sound);
        this.checkChanges$.next();
      })
    );
  }

  discardChanges() {
    this.sound = new Sound(this.internalSound);
    this.checkChanges$.next();
  }

  replaceSoundfile(soundfile: Soundfile) {
    this.sound.soundfile = soundfile;
    this.internalSound.soundfile = soundfile;
  }
}
