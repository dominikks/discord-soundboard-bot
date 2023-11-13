import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { clamp, sample, sortBy, uniq } from 'lodash-es';
import { MatSnackBar } from '@angular/material/snack-bar';
import Fuse from 'fuse.js';
import { EMPTY, forkJoin } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { AppSettingsService } from '../services/app-settings.service';
import { ApiService, RandomInfix } from '../services/api.service';
import { Sound, SoundsService } from '../services/sounds.service';
import { EventsService } from '../services/events.service';
import { EventLogDialogComponent } from './event-log-dialog/event-log-dialog.component';

@Component({
  templateUrl: './soundboard.component.html',
  styleUrls: ['./soundboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardComponent {
  get settings() {
    return this.settingsService.settings;
  }

  readonly user = this.apiService.user();

  readonly data$ = forkJoin([this.apiService.loadRandomInfixes(), this.soundsService.loadSounds()]);
  readonly loadedData = signal<[RandomInfix[], Sound[]]>(null);

  readonly randomInfixes = computed(() => this.loadedData()?.[0]);
  readonly sounds = computed(() => {
    const sounds = this.loadedData()[1];
    return [sounds, new Fuse(sounds, { keys: ['name'] })] as [Sound[], Fuse<Sound>];
  });
  readonly soundCategories = computed(() => {
    const sounds = this.sounds()[0];
    return sortBy(uniq(sounds.map(sound => sound.category)), category => category.toLowerCase());
  });
  readonly filteredSounds = computed(() => {
    const sounds = this.sounds();

    const searchFilter = this.soundSearchFilter();
    const categories = this.settings.soundCategories();

    if (searchFilter.length > 0) {
      return sounds[1].search(searchFilter).map(res => res.item);
    } else if (categories.length > 0) {
      return sounds[0].filter(sound => categories.includes(sound.category));
    } else {
      return sounds[0];
    }
  });

  readonly currentAudio = signal<HTMLAudioElement>(null);
  readonly currentLocalSound = signal<Sound>(null);
  readonly soundSearchFilter = signal('');

  readonly target = this.settings.guildId;

  readonly events$ = computed(() => {
    const target = this.target();
    return target ? this.eventsService.getEventStream(target).pipe(shareReplay(100)) : EMPTY;
  });

  constructor(
    private apiService: ApiService,
    private soundsService: SoundsService,
    private settingsService: AppSettingsService,
    private eventsService: EventsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Update volume of HTMLAudioElement
    effect(() => {
      const audio = this.currentAudio();
      if (audio) {
        audio.volume = clamp(this.settings.localVolume() / 100, 0, 1);
      }
    });
  }

  playSound(sound: Sound) {
    this.stopLocalSound();
    this.soundsService.playSound(sound, this.settings.guildId(), this.settings.autoJoin()).subscribe({
      next: () => {
        if (this.settings.debug()) {
          let volString =
            sound.soundFile != null
              ? `Volume: Max ${sound.soundFile.maxVolume.toFixed(1)} dB, Average ${sound.soundFile.meanVolume.toFixed(1)} dB, `
              : '';
          volString += sound.volumeAdjustment != null ? `Manual adjustment ${sound.volumeAdjustment} dB` : 'Automatic adjustment';
          this.snackBar.open(volString, 'Ok');
        }
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          this.snackBar.open('Failed to join you. Are you in a voice channel that is visible to the bot?');
        } else if (error.status === 503) {
          this.snackBar.open('The bot is currently not in a voice channel!');
        } else if (error.status === 404) {
          this.snackBar.open('Sound not found. It might have been deleted or renamed.');
        } else if (error.status >= 300) {
          this.snackBar.open('Unknown error playing the sound file.');
        }
      },
    });
  }

  playLocalSound(sound: Sound) {
    this.stopLocalSound();
    const audio = new Audio();
    this.currentAudio.set(audio);
    this.currentLocalSound.set(sound);
    audio.src = sound.getDownloadUrl();
    audio.load();
    audio.addEventListener('ended', () => this.stopLocalSound());
    audio.play();
  }

  playInfix(infix: RandomInfix) {
    // Play random sound
    const matchingSounds = this.sounds()[0].filter(
      sound => sound.name.toLowerCase().includes(infix.infix) && sound.guildId === infix.guildId
    );
    if (matchingSounds.length > 0) {
      this.playSound(sample(matchingSounds));
    } else {
      this.snackBar.open('No matching sounds for this random button.');
    }
  }

  playFirstMatch() {
    // Play the first search match
    const filteredSounds = this.filteredSounds();
    if (filteredSounds.length > 0) {
      this.playSound(filteredSounds[0]);
    }
  }

  stopSound() {
    this.soundsService.stopSound(this.settings.guildId()).subscribe({ error: () => this.snackBar.open('Failed to stop playback.') });
  }

  stopLocalSound() {
    const currentAudio = this.currentAudio();
    if (currentAudio != null) {
      currentAudio.removeAllListeners();
      currentAudio.pause();
      currentAudio.remove();
      this.currentAudio.set(null);
      this.currentLocalSound.set(null);
    }
  }

  joinChannel() {
    this.apiService.joinCurrentChannel(this.settings.guildId()).subscribe({
      next: () => this.snackBar.open('Joined channel!', undefined, { duration: 2000 }),
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          this.snackBar.open('Failed to join you. Are you in a voice channel that is visible to the bot?');
        } else {
          this.snackBar.open('Unknown error joining the voice channel.');
        }
      },
    });
  }

  leaveChannel() {
    this.apiService.leaveChannel(this.settings.guildId()).subscribe({
      next: () => this.snackBar.open('Left channel!', undefined, { duration: 2000 }),
      error: (error: HttpErrorResponse) => {
        if (error.status === 503) {
          this.snackBar.open('The bot is not in a voice channel.');
        } else {
          this.snackBar.open('Unknown error leaving the voice channel.');
        }
      },
    });
  }

  trackById(_position: number, item: Sound) {
    return item?.id;
  }

  openEventLog() {
    this.dialog.open(EventLogDialogComponent, { data: this.events$() });
  }
}
