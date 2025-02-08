import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Input,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { from, Observable } from 'rxjs';
import { finalize, map, mergeMap, tap, toArray } from 'rxjs/operators';
import { clamp, sortBy } from 'lodash-es';
import { MatDialog } from '@angular/material/dialog';
import Fuse from 'fuse.js';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { MatAccordion } from '@angular/material/expansion';
import { VolumeSliderComponent } from '../../../common/volume-slider/volume-slider.component';
import { DataLoadDirective } from '../../../common/data-load/data-load.directive';
import { Sound, SoundFile, SoundsService } from '../../../services/sounds.service';
import { AppSettingsService } from '../../../services/app-settings.service';
import { UnsavedChangesBoxComponent } from '../unsaved-changes-box/unsaved-changes-box.component';
import { GuildNamePipe } from '../../../common/guild-name.pipe';
import { SoundDeleteConfirmComponent } from './sound-delete-confirm/sound-delete-confirm.component';
import { SoundDetailsComponent } from './sound-details/sound-details.component';

@Component({
  templateUrl: './sound-manager.component.html',
  styleUrls: ['./sound-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataLoadDirective,
    MatToolbar,
    MatTooltip,
    MatProgressSpinner,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatIconButton,
    MatSuffix,
    MatIcon,
    VolumeSliderComponent,
    MatButton,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    MatAccordion,
    CdkVirtualForOf,
    SoundDetailsComponent,
    UnsavedChangesBoxComponent,
    GuildNamePipe,
  ],
})
export class SoundManagerComponent {
  private soundsService = inject(SoundsService);
  private settingsService = inject(AppSettingsService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  get settings() {
    return this.settingsService.settings;
  }

  _guildId: string;
  @Input({ required: true }) set guildId(guildId: string) {
    this._guildId = guildId;

    this.data$ = this.soundsService
      .loadSounds()
      .pipe(
        map(sounds =>
          sounds.filter(sound => sound.guildId === guildId).map(sound => new SoundEntry(this.soundsService, sound)),
        ),
      );
  }

  data$: Observable<SoundEntry[]>;

  readonly sounds = signal<SoundEntry[]>(null);
  readonly soundsWithChanges = computed(() => {
    const sounds = this.sounds();

    if (sounds == null || sounds.length === 0) return [];

    return sounds.filter(sound => sound.hasChanges());
  });

  readonly soundsFuse = computed(() => {
    const sounds = this.sounds();

    return new Fuse(sounds, {
      keys: ['name', 'category'],
      getFn: (obj, path) => {
        const sound = obj.sound();
        if (Array.isArray(path)) return path.map(p => sound[p]);
        else return sound[path];
      },
    });
  });

  readonly soundFilterString = signal('');
  readonly filteredSounds = computed(() => {
    const filterText = this.soundFilterString();

    if (filterText.length > 0) {
      return this.soundsFuse()
        .search(filterText)
        .map(res => res.item);
    } else {
      return this.sounds();
    }
  });

  readonly isSaving = signal(false);
  readonly isUploading = signal(false);
  readonly isProcessing = signal(false); // tracks replace and delete operations

  readonly hasChanges = computed(() => this.soundsWithChanges().length > 0);

  readonly currentAudio = signal<HTMLAudioElement>(null);

  constructor() {
    effect(() => {
      const audio = this.currentAudio();
      if (audio == null) return;

      audio.volume = clamp(this.settings.localVolume() / 100, 0, 1);
    });
  }

  saveChanges() {
    this.isSaving.set(true);
    from(this.soundsWithChanges())
      .pipe(
        mergeMap(sound => sound.saveChanges(), 5),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        error: () => this.snackBar.open('Failed to save changes to sounds.', 'Damn', { duration: undefined }),
      });
  }

  discardChanges() {
    this.soundsWithChanges().forEach(sound => sound.discardChanges());
  }

  playAudio(entry: SoundEntry) {
    const audio = this.currentAudio();

    if (audio) {
      audio.pause();
    } else {
      const newAudio = new Audio();
      newAudio.src = entry.sound().getDownloadUrl();

      newAudio.onpause = () => {
        if (this.currentAudio() === newAudio) {
          newAudio.remove();
          this.currentAudio.set(null);
        }
      };
      this.currentAudio.set(newAudio);

      newAudio.load();
      newAudio.play();
    }
  }

  onImportFileChange(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files);
    this.isUploading.set(true);
    from(files)
      .pipe(
        mergeMap(file => {
          const endingIndex = file.name.lastIndexOf('.');
          const filename = endingIndex > 0 ? file.name.substring(0, endingIndex) : file.name;
          return this.soundsService
            .createSound(this._guildId, filename, '')
            .pipe(
              mergeMap(sound =>
                this.soundsService
                  .uploadSound(sound, file)
                  .pipe(map(soundFile => new SoundEntry(this.soundsService, new Sound({ ...sound, soundFile })))),
              ),
            );
        }, 5),
        toArray(),
        finalize(() => this.isUploading.set(false)),
      )
      .subscribe({
        next: newEntries => {
          this.sounds.update(sounds => [...sounds, ...sortBy(newEntries, entry => entry.sound.name.toLowerCase())]);
          this.snackBar.open('Upload successful!');
        },
        error: () => this.snackBar.open('Upload of sounds failed!', 'Damn', { duration: undefined }),
      });
  }

  deleteSound(entry: SoundEntry) {
    this.dialog
      .open(SoundDeleteConfirmComponent, { data: { sound: entry.sound() } })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.isProcessing.set(true);
          this.soundsService
            .deleteSound(entry.sound())
            .pipe(
              tap(() => {
                this.sounds.update(sounds => sounds.filter(sound => sound !== entry));
              }),
              finalize(() => this.isProcessing.set(false)),
            )
            .subscribe({
              error: () => this.snackBar.open('Failed to delete sound.', 'Damn', { duration: undefined }),
            });
        }
      });
  }

  replaceSoundFile(file: File, entry: SoundEntry) {
    this.isProcessing.set(true);
    this.soundsService
      .uploadSound(entry.sound(), file)
      .pipe(
        tap(soundFile => entry.replaceSoundFile(soundFile)),
        finalize(() => this.isProcessing.set(false)),
      )
      .subscribe({
        error: () => this.snackBar.open('Failed to upload sound file.', 'Damn', { duration: undefined }),
      });
  }

  trackById(_index: number, item: SoundEntry) {
    return item.sound().id;
  }
}

export class SoundEntry {
  // This is the sound we started with
  private readonly internalSound: WritableSignal<Sound>;
  // This sound is edited
  readonly sound: WritableSignal<Sound>;

  hasChanges = computed(() => {
    const sound = this.sound();
    const internalSound = this.internalSound();

    return (
      internalSound.category !== sound.category ||
      internalSound.name !== sound.name ||
      internalSound.volumeAdjustment !== sound.volumeAdjustment
    );
  });

  constructor(
    private soundsService: SoundsService,
    sound: Sound,
  ) {
    this.internalSound = signal(new Sound(sound));
    this.sound = signal(new Sound(sound));
  }

  saveChanges() {
    const sound = new Sound(this.sound());
    return this.soundsService.updateSound(sound).pipe(tap(() => this.internalSound.set(sound)));
  }

  discardChanges() {
    this.sound.set(new Sound(this.internalSound()));
  }

  mutateSound(update: Partial<Pick<Sound, 'category' | 'name' | 'volumeAdjustment'>>) {
    this.sound.update(sound => new Sound({ ...sound, ...update }));
  }

  replaceSoundFile(soundFile: SoundFile) {
    this.sound.update(sound => new Sound({ ...sound, soundFile }));
    this.internalSound.update(internalSound => new Sound({ ...internalSound, soundFile }));
  }
}
